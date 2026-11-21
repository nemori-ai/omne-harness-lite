import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type FacilityResult,
  type FileRequest,
  type FilesScope,
  type FileSystemFacility,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createHostFilesEngine } from '../src/host-files.ts'

const bases: string[] = []

beforeEach(({ skip }) => {
  skip(process.platform !== 'linux' && process.platform !== 'darwin')
})

afterEach(async () => {
  await Promise.all(bases.splice(0).map(base => rm(base, { recursive: true, force: true })))
})

const tenant = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
})()

const text = (value: string) => new TextEncoder().encode(value)

function request(path: string, named: ObjectToken | null, requestId: string): FileRequest<string> {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: { kind: 'host_machine' },
    path,
    named,
  }
}

type Place = Readonly<{ dir: string; file: string }>

type World = Readonly<{
  base: string
  state: string
  inside: Place
  outside: Place
  facility: FileSystemFacility<unknown>
}>

/** The three scopes the setting gives: read and write below the workspace, write only, neither. */
const scopes = {
  workspace: (root: string): FilesScope => ({ read: root, write: root }),
  readOutside: (root: string): FilesScope => ({ write: root }),
  everywhere: (): FilesScope => ({}),
} as const

type ScopeName = keyof typeof scopes

async function world(scope: ScopeName): Promise<World> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-scope-')))
  bases.push(base)
  const place = async (name: string): Promise<Place> => {
    const dir = join(base, name)
    await mkdir(join(dir, 'sub'), { recursive: true })
    await writeFile(join(dir, 'file.txt'), `${name} bytes`)
    await writeFile(join(dir, 'sub', 'inner.txt'), `${name} inner`)
    return { dir, file: join(dir, 'file.txt') }
  }
  const inside = await place('workspace')
  const outside = await place('outside')
  const state = join(base, 'state')
  await mkdir(state)
  const engine = createHostFilesEngine({ scope: scopes[scope](inside.dir), stateDirectory: state })
  return { base, state, inside, outside, facility: engine.facilityFor(`scope-${scope}`) }
}

type Operation = (w: World, from: Place, to: Place) => Promise<FacilityResult<unknown>>

const token = hostObjectToken

/** Each operation with the place it acts on (`from`) and, for a move or copy, the place it lands in (`to`). */
const operations: Readonly<Record<string, Operation>> = {
  read: async (w, from) => w.facility.read(request(from.file, await token(from.file), 'read')),
  stat: async (w, from) => w.facility.stat(request(from.file, await token(from.file), 'stat')),
  list: async (w, from) => w.facility.list(request(from.dir, await token(from.dir), 'list')),
  search: async (w, from) =>
    w.facility.search({
      ...request(from.dir, await token(from.dir), 'search'),
      pattern: text('inner'),
      match: 'content',
      recursive: true,
    }),
  replace: async (w, from) =>
    w.facility.write({
      ...request(from.file, await token(from.file), 'replace'),
      bytes: text('replaced'),
      mode: 'replace',
    }),
  create: async (w, from) =>
    w.facility.write({
      ...request(join(from.dir, 'created.txt'), await token(from.dir), 'create'),
      bytes: text('created'),
      mode: 'create',
    }),
  mkdir: async (w, from) =>
    w.facility.mkdir({
      ...request(join(from.dir, 'made'), await token(from.dir), 'mkdir'),
      parents: false,
    }),
  remove: async (w, from) =>
    w.facility.remove({
      ...request(from.file, await token(from.file), 'remove'),
      recursive: false,
    }),
  copy: async (w, from, to) =>
    w.facility.copy({
      ...request(from.file, await token(from.file), 'copy'),
      target: { path: join(to.dir, 'copied.txt'), named: await token(to.dir) },
      replace: false,
    }),
  move: async (w, from, to) =>
    w.facility.move({
      ...request(from.file, await token(from.file), 'move'),
      target: { path: join(to.dir, 'moved.txt'), named: await token(to.dir) },
      replace: false,
    }),
}

type Case = Readonly<{
  operation: keyof typeof operations
  from: 'inside' | 'outside'
  to: 'inside' | 'outside'
}>

/** Carried out or refused under each scope; a move writes its source and its target, a copy reads its source (SPEC). */
const carried: readonly (Case & Readonly<Record<ScopeName, boolean>>)[] = [
  ...['read', 'stat', 'list', 'search'].map(operation => ({
    operation,
    from: 'outside' as const,
    to: 'outside' as const,
    workspace: false,
    readOutside: true,
    everywhere: true,
  })),
  ...['replace', 'create', 'mkdir', 'remove'].map(operation => ({
    operation,
    from: 'outside' as const,
    to: 'outside' as const,
    workspace: false,
    readOutside: false,
    everywhere: true,
  })),
  ...['copy', 'move'].flatMap(operation => [
    {
      operation,
      from: 'outside' as const,
      to: 'inside' as const,
      workspace: false,
      readOutside: operation === 'copy',
      everywhere: true,
    },
    {
      operation,
      from: 'inside' as const,
      to: 'outside' as const,
      workspace: false,
      readOutside: false,
      everywhere: true,
    },
  ]),
  ...Object.keys(operations).map(operation => ({
    operation,
    from: 'inside' as const,
    to: 'inside' as const,
    workspace: true,
    readOutside: true,
    everywhere: true,
  })),
]

async function snapshot(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true })
  const files = await Promise.all(
    entries
      .sort()
      .map(async entry => `${entry}=${await readFile(join(dir, entry)).catch(() => '<dir>')}`),
  )
  return files.join('\n')
}

for (const scope of Object.keys(scopes) as ScopeName[])
  for (const entry of carried)
    it(`${scope}: ${entry.operation} from ${entry.from} to ${entry.to} is ${entry[scope] ? 'carried out' : 'refused'}`, async () => {
      const w = await world(scope)
      const from = w[entry.from]
      const to = w[entry.to]
      const both = async () => [await snapshot(w.inside.dir), await snapshot(w.outside.dir)]
      const before = await both()
      const result = await operations[entry.operation]!(w, from, to)
      if (entry[scope]) {
        expect(result.kind, JSON.stringify(result)).toBe('done')
        return
      }
      expect(result).toEqual({
        kind: 'rejected',
        requestId: entry.operation,
        reason: 'notAuthorized',
      })
      // A refused call leaves no trace inside the scope or outside it.
      expect(await both()).toEqual(before)
    })

it('reads through a link to the outside when reads are not limited, and refuses a write through it', async () => {
  const w = await world('readOutside')
  await symlink(w.outside.dir, join(w.inside.dir, 'link'))
  const through = join(w.inside.dir, 'link', 'file.txt')
  const named = await token(w.outside.file)
  const read = await w.facility.read(request(through, named, 'read'))
  expect(read.kind === 'done' && new TextDecoder().decode(read.value.bytes)).toBe('outside bytes')
  expect(
    await w.facility.write({
      ...request(through, named, 'replace'),
      bytes: text('x'),
      mode: 'replace',
    }),
  ).toEqual({ kind: 'rejected', requestId: 'replace', reason: 'notAuthorized' })
  expect(await readFile(w.outside.file, 'utf8')).toBe('outside bytes')
})

it('reads a path with .. when reads are not limited, and refuses a write with .. even when it ends inside', async () => {
  const w = await world('readOutside')
  const climbing = join(w.inside.dir, '..', 'outside', 'file.txt')
  const read = await w.facility.read(request(climbing, await token(w.outside.file), 'read'))
  expect(read.kind).toBe('done')
  const back = `${w.inside.dir}/../workspace/file.txt`
  expect(
    await w.facility.write({
      ...request(back, await token(w.inside.file), 'replace'),
      bytes: text('x'),
      mode: 'replace',
    }),
  ).toEqual({ kind: 'rejected', requestId: 'replace', reason: 'notAuthorized' })
  expect(await readFile(w.inside.file, 'utf8')).toBe('workspace bytes')
})

it('reads a file with a second name outside when reads are not limited, and refuses to write its bytes', async () => {
  const w = await world('readOutside')
  const hard = join(w.inside.dir, 'hard.txt')
  await link(w.outside.file, hard)
  const named = await token(hard)
  expect((await w.facility.read(request(hard, named, 'read'))).kind).toBe('done')
  expect(
    await w.facility.write({
      ...request(hard, named, 'replace'),
      bytes: text('x'),
      mode: 'replace',
    }),
  ).toEqual({ kind: 'rejected', requestId: 'replace', reason: 'notAuthorized' })
  expect(await readFile(w.outside.file, 'utf8')).toBe('outside bytes')
})

it('closes a handle below either root of the scope, and refuses one below neither', async () => {
  const writeOnly = await world('readOutside')
  const outsideRead = await writeOnly.facility.read(
    request(writeOnly.outside.file, await token(writeOnly.outside.file), 'read'),
  )
  if (outsideRead.kind !== 'done') throw new Error(JSON.stringify(outsideRead))
  const close = (w: World, path: string, handle: typeof outsideRead.value.handle) =>
    w.facility.close({
      ...request(path, handle.object, 'close'),
      handle,
    })
  expect(await close(writeOnly, writeOnly.outside.file, outsideRead.value.handle)).toMatchObject({
    kind: 'done',
  })
  const confined = await world('workspace')
  const insideRead = await confined.facility.read(
    request(confined.inside.file, await token(confined.inside.file), 'read'),
  )
  if (insideRead.kind !== 'done') throw new Error(JSON.stringify(insideRead))
  expect(await close(confined, confined.outside.file, insideRead.value.handle)).toEqual({
    kind: 'rejected',
    requestId: 'close',
    reason: 'notAuthorized',
  })
  expect(await close(confined, confined.inside.file, insideRead.value.handle)).toMatchObject({
    kind: 'done',
  })
})

it('refuses a write outside the write root before anything touches the state directory, when reads are not limited', async () => {
  for (const operation of ['replace', 'create', 'mkdir', 'remove'] as const) {
    const w = await world('readOutside')
    const stamp = async () => {
      const own = await lstat(w.state, { bigint: true })
      return { mtimeNs: own.mtimeNs, ctimeNs: own.ctimeNs, below: await readdir(w.state) }
    }
    const before = await stamp()
    await new Promise(resolve => setTimeout(resolve, 25))
    const result = await operations[operation]!(w, w.outside, w.outside)
    expect(result, operation).toEqual({
      kind: 'rejected',
      requestId: operation,
      reason: 'notAuthorized',
    })
    expect(await stamp(), operation).toEqual(before)
  }
})

it('searches and copies a file with a second name outside when reads are not limited', async () => {
  const w = await world('readOutside')
  await link(w.outside.file, join(w.outside.dir, 'twin.txt'))
  const searched = await operations['search']!(w, w.outside, w.outside)
  expect(searched.kind, JSON.stringify(searched)).toBe('done')
  const copied = await operations['copy']!(w, w.outside, w.inside)
  expect(copied.kind, JSON.stringify(copied)).toBe('done')
  expect(await readFile(join(w.inside.dir, 'copied.txt'), 'utf8')).toBe('outside bytes')
})

it('closes a handle when the write side admits its path though the read side does not', async () => {
  const w = await world('everywhere')
  const engine = createHostFilesEngine({ scope: { read: w.inside.dir }, stateDirectory: w.state })
  const facility = engine.facilityFor('read-only-limited')
  const written = await facility.write({
    ...request(join(w.outside.dir, 'new.txt'), await token(w.outside.dir), 'create'),
    bytes: text('new'),
    mode: 'create',
  })
  if (written.kind !== 'done') throw new Error(JSON.stringify(written))
  const handle = written.value.handle
  const closed = await facility.close({
    ...request(join(w.outside.dir, 'new.txt'), handle.object, 'close'),
    handle,
  })
  expect(closed).toMatchObject({ kind: 'done' })
})

it('keeps one recorded identity for a root that both sides of the scope name', async () => {
  const w = await world('workspace')
  const read = await w.facility.read(request(w.inside.file, await token(w.inside.file), 'read'))
  expect(read.kind).toBe('done')
  await rename(w.inside.dir, join(w.base, 'workspace-old'))
  await mkdir(w.inside.dir)
  const written = await w.facility.write({
    ...request(join(w.inside.dir, 'created.txt'), await token(w.inside.dir), 'create'),
    bytes: text('created'),
    mode: 'create',
  })
  expect(written).toEqual({ kind: 'rejected', requestId: 'create', reason: 'notAuthorized' })
})
