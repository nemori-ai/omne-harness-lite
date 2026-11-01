// commitBatch and recoverBatch on the real file system. Each entry is published on its own, and a
// manifest in the state directory records the batch so that a later recovery can say what happened.
// Faults and pauses are injected under `node:fs/promises` to reach the half-way answers; the crash
// case kills a real child process.
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type FacilityResult,
  type FileBatchOutcome,
  type FileBatchRef,
  type FileSystemFacility,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createHostFilesEngine, type HostFilesEngine } from '../src/host-files.ts'

type Rule = {
  fn: string
  match: string
  skip: number
  code?: string
  run?: () => Promise<void>
}
const rules = vi.hoisted(() => ({ list: [] as Rule[] }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const before = async (fn: string, args: readonly unknown[]) => {
    const texts = args.filter((arg): arg is string => typeof arg === 'string')
    const rule = rules.list.find(
      candidate => candidate.fn === fn && texts.some(text => text.includes(candidate.match)),
    )
    if (rule === undefined) return
    if (rule.skip > 0) {
      rule.skip--
      return
    }
    rules.list.splice(rules.list.indexOf(rule), 1)
    if (rule.run !== undefined) await rule.run()
    if (rule.code !== undefined)
      throw Object.assign(new Error(`injected ${rule.code}`), { code: rule.code })
  }
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      await before('open', args)
      return actual.open(...args)
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      await before('rename', args)
      return actual.rename(...args)
    },
    link: async (...args: Parameters<typeof actual.link>) => {
      await before('link', args)
      return actual.link(...args)
    },
    unlink: async (...args: Parameters<typeof actual.unlink>) => {
      await before('unlink', args)
      return actual.unlink(...args)
    },
  }
})

const dirs: string[] = []

// These tests need `/proc/self/fd` and a POSIX file system; elsewhere they are skipped, not passed.
beforeEach(({ skip }) => {
  skip(process.platform !== 'linux')
})

afterEach(async () => {
  rules.list.length = 0
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function tenantOf(organization: string) {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization, account: 'acc_0123456789abcdefghjkmnpqrs' }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}

const tenantA = tenantOf('org_0123456789abcdefghjkmnpqrs')
const tenantB = tenantOf('org_1123456789abcdefghjkmnpqrs')

const text = (value: string) => new TextEncoder().encode(value)
const refused = (requestId: string, reason: string) => ({ kind: 'rejected', requestId, reason })

function done<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}

type Entry = {
  path: string
  named: ObjectToken | null
  bytes: Uint8Array
  expectedVersion: string | null
}

type Setup = Readonly<{
  base: string
  files: string
  state: string
  engine: HostFilesEngine
  facility: FileSystemFacility<unknown>
  parent: ObjectToken
}>

async function setup(options: { state?: boolean } = {}): Promise<Setup> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-batch-')))
  dirs.push(base)
  const files = join(base, 'files')
  const state = join(base, 'state')
  await mkdir(files)
  await mkdir(state)
  const engine = createHostFilesEngine(
    options.state === false ? undefined : { stateDirectory: state },
  )
  return {
    base,
    files,
    state,
    engine,
    facility: engine.facilityFor('batch-spec'),
    parent: await hostObjectToken(files),
  }
}

const context = (requestId: string, tenant = tenantA) => ({
  requestId,
  access: { principal: 'subject-a', tenant },
  origin: originRef('call-1'),
  binding: { kind: 'host_machine' } as const,
})

const commit = (
  facility: FileSystemFacility<unknown>,
  entries: Entry[],
  id = 'commit',
  tenant = tenantA,
) => facility.commitBatch({ ...context(id, tenant), entries })

const recover = (
  facility: FileSystemFacility<unknown>,
  batch: FileBatchRef,
  id = 'recover',
  tenant = tenantA,
) => facility.recoverBatch({ ...context(id, tenant), batch })

const created = (s: Setup, name: string, bytes: string): Entry => ({
  path: join(s.files, name),
  named: s.parent,
  bytes: text(bytes),
  expectedVersion: null,
})

async function replacing(s: Setup, name: string, bytes: string): Promise<Entry> {
  const path = join(s.files, name)
  await writeFile(path, 'old')
  const named = await hostObjectToken(path)
  const stat = done(await s.facility.stat({ ...context('stat'), path, named }))
  return { path, named, bytes: text(bytes), expectedVersion: stat.version }
}

async function manifests(s: Setup): Promise<string[]> {
  const root = join(s.state, 'batches')
  const found: string[] = []
  for (const tenant of await readdir(root).catch(() => [])) {
    for (const name of await readdir(join(root, tenant))) found.push(join(root, tenant, name))
  }
  return found
}

function committedOutcome(result: FacilityResult<FileBatchOutcome>) {
  const value = done(result)
  if (value.kind !== 'committed')
    throw new Error(`expected committed, got ${JSON.stringify(value)}`)
  return value
}

it('publishes every entry, leaves no temporary file and records the batch as committed', async () => {
  const s = await setup()
  const replace = await replacing(s, 'replace.txt', 'replaced')
  const outcome = committedOutcome(
    await commit(s.facility, [created(s, 'one.txt', 'one'), replace, created(s, 'two.txt', 'two')]),
  )
  expect(outcome.published).toEqual([
    join(s.files, 'one.txt'),
    join(s.files, 'replace.txt'),
    join(s.files, 'two.txt'),
  ])
  expect(await readFile(join(s.files, 'one.txt'), 'utf8')).toBe('one')
  expect(await readFile(join(s.files, 'replace.txt'), 'utf8')).toBe('replaced')
  expect(await readdir(s.files)).toEqual(['one.txt', 'replace.txt', 'two.txt'])

  const [manifest] = await manifests(s)
  expect(manifest).toBeDefined()
  const raw = await readFile(manifest ?? '', 'utf8')
  expect(JSON.parse(raw)).toMatchObject({ state: 'committed', id: outcome.batch.id })
  expect(raw).not.toContain('replaced')
  expect(raw).toContain(createHash('sha256').update('replaced').digest('hex'))

  const recognition = done(await recover(s.facility, outcome.batch))
  expect(recognition).toMatchObject({
    state: 'complete',
    published: outcome.published,
    matchingPrepared: [],
    conflicting: [],
  })
})

it('refuses an unsound batch before it writes anything', async () => {
  const s = await setup()
  await writeFile(join(s.files, 'there.txt'), 'there')
  const there = await hostObjectToken(join(s.files, 'there.txt'))
  const good = created(s, 'good.txt', 'good')
  const cases: [string, Entry[], string][] = [
    ['empty', [], 'invalidInput'],
    ['relative', [{ ...good, path: 'good.txt' }], 'invalidInput'],
    ['unnamed', [{ ...good, named: null }], 'notAuthorized'],
    ['duplicate', [good, good], 'invalidInput'],
    ['exists', [good, { ...good, path: join(s.files, 'there.txt') }], 'conflict'],
    [
      'stale',
      [
        good,
        {
          path: join(s.files, 'there.txt'),
          named: there,
          bytes: text('x'),
          expectedVersion: '0:0',
        },
      ],
      'conflict',
    ],
    ['wrong-name', [{ ...good, named: there }], 'conflict'],
    ['orphan', [{ ...good, path: join(s.files, 'no', 'good.txt') }], 'notFound'],
  ]
  for (const [id, entries, reason] of cases) {
    expect(await commit(s.facility, entries, id), id).toEqual(refused(id, reason))
  }
  expect(
    await s.facility.commitBatch({
      ...context('binding'),
      binding: { kind: 'tenant_sandbox', tenant: tenantA },
      entries: [created(s, 'other.txt', 'x')],
    }),
  ).toEqual(refused('binding', 'unsupported'))
  expect(await readdir(s.files)).toEqual(['there.txt'])
  expect(await manifests(s)).toEqual([])
})

it('stops at an entry whose target changed, removes the temporary files and names what it published', async () => {
  const s = await setup()
  const victim = await replacing(s, 'victim.txt', 'mine')
  rules.list.push({
    fn: 'open',
    match: '.omne-batch-',
    skip: 3,
    run: () => writeFile(victim.path, 'changed by someone else'),
  })
  const result = done(
    await commit(s.facility, [
      created(s, 'one.txt', 'one'),
      created(s, 'two.txt', 'two'),
      victim,
      created(s, 'four.txt', 'four'),
    ]),
  )
  expect(result).toMatchObject({
    kind: 'unknown',
    reason: 'conflict',
    published: [join(s.files, 'one.txt'), join(s.files, 'two.txt')],
  })
  expect(await readdir(s.files)).toEqual(['one.txt', 'two.txt', 'victim.txt'])
  expect(await readFile(victim.path, 'utf8')).toBe('changed by someone else')
  const recognition = done(await recover(s.facility, result.batch))
  expect(recognition).toMatchObject({
    state: 'conflict',
    published: [join(s.files, 'one.txt'), join(s.files, 'two.txt')],
    conflicting: [victim.path],
  })
})

it('answers effectUnknown when a publication fails, and recovery then says partial', async () => {
  const s = await setup()
  const victim = await replacing(s, 'victim.txt', 'mine')
  rules.list.push({ fn: 'rename', match: '/victim.txt', skip: 0, code: 'EIO' })
  const result = done(
    await commit(s.facility, [
      created(s, 'one.txt', 'one'),
      victim,
      created(s, 'three.txt', 'three'),
    ]),
  )
  expect(result).toMatchObject({
    kind: 'unknown',
    reason: 'effectUnknown',
    published: [join(s.files, 'one.txt')],
  })
  expect(await readFile(victim.path, 'utf8')).toBe('old')
  expect(await readFile(join(s.files, 'one.txt'), 'utf8')).toBe('one')
  const recognition = done(await recover(s.facility, result.batch))
  expect(recognition.state).toBe('partial')
  expect(recognition.published).toEqual([join(s.files, 'one.txt')])
})

it('does not count matching bytes as a receipt', async () => {
  const s = await setup()
  rules.list.push({ fn: 'rename', match: '.json', skip: 2, code: 'EIO' })
  const result = done(
    await commit(s.facility, [created(s, 'one.txt', 'one'), created(s, 'two.txt', 'two')]),
  )
  expect(result).toMatchObject({ kind: 'unknown', reason: 'effectUnknown', published: [] })
  const recognition = done(await recover(s.facility, result.batch))
  expect(recognition).toMatchObject({
    state: 'partial',
    published: [],
    matchingPrepared: [join(s.files, 'one.txt')],
    conflicting: [],
  })
})

it('says pending while the batch runs in this process, then complete', async () => {
  const s = await setup()
  const victim = await replacing(s, 'victim.txt', 'mine')
  let reached: () => void = () => undefined
  const stalled = new Promise<void>(resolve => {
    reached = resolve
  })
  let release: () => void = () => undefined
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  rules.list.push({
    fn: 'rename',
    match: '/victim.txt',
    skip: 0,
    run: async () => {
      reached()
      await released
    },
  })
  const running = commit(s.facility, [created(s, 'one.txt', 'one'), victim])
  await stalled
  const [manifest] = await manifests(s)
  const id = JSON.parse(await readFile(manifest ?? '', 'utf8')).id as string
  const generation = JSON.parse(await readFile(manifest ?? '', 'utf8')).generation as string
  const midway = done(await recover(s.facility, { id, generation }))
  expect(midway).toMatchObject({ state: 'pending', published: [join(s.files, 'one.txt')] })
  release()
  const outcome = committedOutcome(await running)
  expect(done(await recover(s.facility, outcome.batch)).state).toBe('complete')
})

it('stops publishing once the facade is sealed and says closed', async () => {
  const s = await setup()
  const victim = await replacing(s, 'victim.txt', 'mine')
  rules.list.push({
    fn: 'rename',
    match: '/victim.txt',
    skip: 0,
    run: async () => {
      s.engine.seal('batch-spec')
    },
  })
  const result = done(
    await commit(s.facility, [
      created(s, 'one.txt', 'one'),
      victim,
      created(s, 'three.txt', 'three'),
    ]),
  )
  expect(result).toMatchObject({
    kind: 'unknown',
    reason: 'closed',
    published: [join(s.files, 'one.txt'), victim.path],
  })
  expect(await readdir(s.files)).toEqual(['one.txt', 'victim.txt'])
  expect(await commit(s.facility, [created(s, 'late.txt', 'late')], 'late')).toEqual(
    refused('late', 'closed'),
  )
})

it('answers unavailable to both operations when no state directory is configured', async () => {
  const s = await setup({ state: false })
  expect(await commit(s.facility, [created(s, 'x.txt', 'x')])).toEqual(
    refused('commit', 'unavailable'),
  )
  expect(await recover(s.facility, { id: randomUUID(), generation: '1' })).toEqual(
    refused('recover', 'unavailable'),
  )
  expect(await readdir(s.files)).toEqual([])
})

it('answers notFound for a batch of another tenant or an unknown batch, and changes nothing when it recovers', async () => {
  const s = await setup()
  const outcome = committedOutcome(await commit(s.facility, [created(s, 'one.txt', 'one')]))
  expect(await recover(s.facility, outcome.batch, 'other', tenantB)).toEqual(
    refused('other', 'notFound'),
  )
  expect(
    await recover(
      s.facility,
      { id: randomUUID(), generation: outcome.batch.generation },
      'unknown',
    ),
  ).toEqual(refused('unknown', 'notFound'))
  expect(await recover(s.facility, { id: '../escape', generation: '1' }, 'bad')).toEqual(
    refused('bad', 'invalidInput'),
  )
  const before = await readdir(s.files)
  const manifestBefore = await readFile((await manifests(s))[0] ?? '', 'utf8')
  done(await recover(s.facility, outcome.batch))
  expect(await readdir(s.files)).toEqual(before)
  expect(await readFile((await manifests(s))[0] ?? '', 'utf8')).toBe(manifestBefore)
})

const execute = promisify(execFile)

it(
  'reads interrupted from a new process after a process killed in the middle of publishing',
  { tags: ['slow'] },
  async () => {
    const s = await setup()
    const first = await replacing(s, 'first.txt', 'first-new')
    const second = await replacing(s, 'second.txt', 'second-new')
    const third = await replacing(s, 'third.txt', 'third-new')
    const scripts = join(process.cwd(), 'tmp', `batch-child-${randomUUID()}`)
    await mkdir(scripts, { recursive: true })
    dirs.push(scripts)
    const script = join(scripts, 'child.mjs')
    await writeFile(
      script,
      `
import fsp from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tenantCodec } from '@omne-harness/legal-identity'
import { originRef } from '@omne-harness/execution-environment-contract'
const [, , sourceUrl, stateDirectory, tenantText, entriesJson] = process.argv
const realRename = fsp.rename
let publications = 0
fsp.rename = async (from, to) => {
  if (String(to).startsWith('/proc/self/fd/') && ++publications === 2) process.kill(process.pid, 'SIGKILL')
  return realRename(from, to)
}
syncBuiltinESMExports()
const { createHostFilesEngine } = await import(sourceUrl)
const tenant = tenantCodec.parse(tenantText).value
const entries = JSON.parse(entriesJson).map(entry => ({ ...entry, bytes: new TextEncoder().encode(entry.bytes) }))
const facility = createHostFilesEngine({ stateDirectory }).facilityFor('child')
await facility.commitBatch({
  requestId: 'child',
  access: { principal: 'subject-a', tenant },
  origin: originRef('call-1'),
  binding: { kind: 'host_machine' },
  entries,
})
`,
    )
    const tenantText = tenantCodec.encode(tenantA)
    if (!tenantText.ok) throw new Error('tenant fixture did not encode')
    const entries = [first, second, third].map(entry => ({
      path: entry.path,
      named: entry.named,
      bytes: new TextDecoder().decode(entry.bytes),
      expectedVersion: entry.expectedVersion,
    }))
    const exit = await execute(process.execPath, [
      script,
      pathToFileURL(join(process.cwd(), 'src', 'host-files.ts')).href,
      s.state,
      tenantText.value,
      JSON.stringify(entries),
    ]).then(
      () => 'finished',
      (error: { signal?: string }) => error.signal ?? 'failed',
    )
    expect(exit).toBe('SIGKILL')

    expect(await readFile(first.path, 'utf8')).toBe('first-new')
    expect(await readFile(second.path, 'utf8')).toBe('old')
    const [manifest] = await manifests(s)
    const written = JSON.parse(await readFile(manifest ?? '', 'utf8'))
    const fresh = createHostFilesEngine({ stateDirectory: s.state }).facilityFor('fresh')
    const recognition = done(
      await recover(fresh, { id: written.id, generation: written.generation }),
    )
    expect(recognition).toMatchObject({
      state: 'interrupted',
      published: [first.path],
      matchingPrepared: [],
      conflicting: [],
    })
    expect(await readFile(second.path, 'utf8')).toBe('old')
    expect(await lstat(first.path).then(stat => stat.isFile())).toBe(true)
  },
)
