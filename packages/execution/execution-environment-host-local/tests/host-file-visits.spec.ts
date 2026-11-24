// @module-tag slow
import { beforeAll, expect, it, vi } from 'vitest'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import { originRef, type FacilityResult } from '@omne-harness/execution-environment-contract'
import { createHostFileLookup } from '../src/host-file-lookup.ts'
import { createHostFiles, createHostFilesEngine, hostObjectToken } from '../src/host-files.ts'
import { prepareNativeHooks, spawnWithNativeHooks } from './macos-files/native-hooks.ts'

const fault = vi.hoisted(() => ({
  armed: false,
  move: undefined as { from: string; to: string } | undefined,
  moveParent: undefined as { from: string; to: string } | undefined,
  moves: 0,
}))
async function before(fn: string, paths: readonly unknown[]) {
  if (
    fault.moveParent &&
    fn === 'rename' &&
    paths.some(path => typeof path === 'string' && path.endsWith('/replace.txt'))
  ) {
    const { from, to } = fault.moveParent
    fault.moveParent = undefined
    await rename(from, to)
    fault.moves++
  }
  if (
    fault.move &&
    (fn === 'pread' || fn === 'file-opened') &&
    paths.some(path => typeof path === 'string' && path.endsWith('/sample.txt'))
  ) {
    const { from, to } = fault.move
    fault.move = undefined
    await rename(from, to)
    fault.moves++
  }
  if (
    fault.armed &&
    fn === 'rename' &&
    paths.some(path => typeof path === 'string' && path.endsWith('/b.txt'))
  ) {
    fault.armed = false
    throw Object.assign(new Error('injected second publication failure'), { code: 'EIO' })
  }
}
vi.mock('../src/macos-files/launcher.ts', () => ({
  spawnFilesHelper: (executable: string) => spawnWithNativeHooks(executable, before),
}))
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      await before('file-opened', args)
      return handle
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      await before('rename', args)
      return actual.rename(...args)
    },
  }
})
beforeAll(async () => {
  if (process.platform === 'darwin') await prepareNativeHooks()
})
const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('invalid tenant')
const tenant = parsed.value
function done<T>(answer: FacilityResult<T>): T {
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
  return answer.value
}

it('C2/C6 a partial real host batch proves only its published directories without a later lookup', async ({
  skip,
}) => {
  skip(process.platform !== 'darwin' && process.platform !== 'linux')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'batch-visits-')))
  const engine = createHostFilesEngine({
    scope: { read: root, write: root },
    stateDirectory: join(root, 'state'),
  })
  try {
    const a = join(root, 'a'),
      b = join(root, 'b'),
      c = join(root, 'c')
    await Promise.all([mkdir(a), mkdir(b), mkdir(c), mkdir(join(root, 'state'))])
    await writeFile(join(b, 'b.txt'), 'old')
    const files = engine.facilityFor('test')
    const common = {
      requestId: 'visits',
      access: { principal: 'test', tenant },
      origin: originRef('test'),
      binding: { kind: 'host_machine' as const },
    }
    const namedB = await hostObjectToken(join(b, 'b.txt'))
    const version = done(
      await files.stat({ ...common, path: join(b, 'b.txt'), named: namedB }),
    ).version
    fault.armed = true
    const answer = await files.commitBatch({
      ...common,
      entries: [
        {
          path: join(a, 'a.txt'),
          named: await hostObjectToken(a),
          expectedVersion: null,
          bytes: new TextEncoder().encode('published'),
        },
        {
          path: join(b, 'b.txt'),
          named: namedB,
          expectedVersion: version,
          bytes: new TextEncoder().encode('replacement'),
        },
        {
          path: join(c, 'c.txt'),
          named: await hostObjectToken(c),
          expectedVersion: null,
          bytes: new TextEncoder().encode('unpublished'),
        },
      ],
    })
    expect(done(answer)).toMatchObject({
      kind: 'unknown',
      reason: 'effectUnknown',
      published: [join(a, 'a.txt')],
    })
    expect(answer).toMatchObject({ verifiedDirectories: [a] })
    await rename(a, a + '-moved')
    await symlink(c, a)
    expect(answer).toMatchObject({ verifiedDirectories: [a] })
    expect(await readFile(join(a + '-moved', 'a.txt'), 'utf8')).toBe('published')
    expect(await readFile(join(b, 'b.txt'), 'utf8')).toBe('old')
  } finally {
    fault.armed = false
    await engine.closeOwned('test')
    await rm(root, { recursive: true, force: true })
  }
}, 60000)

it('looks up and reads a named file only under the verified root object', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'host-guidance-root-')))
  try {
    const file = join(root, 'AGENTS.md')
    const other = join(root, 'other')
    await mkdir(other)
    await writeFile(file, 'one instruction')
    const rootToken = async (path: string) => {
      const info = await lstat(path, { bigint: true })
      return `${info.dev}:${info.ino}`
    }
    const identity = await rootToken(root)
    const wrong = await rootToken(other)
    expect(() => createHostFiles(undefined, identity)).toThrow(
      'a verified read root needs its absolute path',
    )
    const lookup = await createHostFileLookup(root, identity)(file)
    if (!lookup.ok || lookup.value === null) throw new Error(JSON.stringify(lookup))
    const request = {
      requestId: 'read-source',
      binding: { kind: 'host_machine' as const },
      origin: originRef('test'),
      access: { principal: 'test', tenant },
      named: lookup.value.object,
      path: file,
    }
    const read = await createHostFiles({ read: root }, identity).read(request)
    expect(new TextDecoder().decode(done(read).bytes)).toBe('one instruction')
    expect(await createHostFiles({ read: root }, wrong).read(request)).toMatchObject({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await createHostFileLookup(root, wrong)(join(root, 'missing'))).toEqual({
      ok: false,
      failure: 'notAuthorized',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60000)

it.skipIf(process.platform !== 'linux' && process.platform !== 'darwin').each([false, true])(
  'C2/C6 a file moved after open retains its original parent, with another hard link %s',
  async hardLinked => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'visit-open-')))
    try {
      const original = join(base, 'opened'),
        sibling = join(base, 'other')
      await mkdir(original)
      await mkdir(sibling)
      const from = join(original, 'sample.txt'),
        to = join(sibling, 'moved.txt')
      await writeFile(from, 'original bytes')
      if (hardLinked) await link(from, join(sibling, 'other-name'))
      fault.moves = 0
      fault.move = { from, to }
      const request = {
        requestId: 'moved-read',
        path: from,
        named: await hostObjectToken(from),
        binding: { kind: 'host_machine' as const },
        origin: originRef('test'),
        access: { principal: 'test', tenant },
        observeDirectory: true as const,
      }
      const answer = await createHostFiles().read(request)
      expect(new TextDecoder().decode(done(answer).bytes)).toBe('original bytes')
      expect(fault.moves).toBe(1)
      expect(answer).toHaveProperty('verifiedDirectories', [original])
      expect(await readFile(to, 'utf8')).toBe('original bytes')
    } finally {
      fault.move = undefined
      await rm(base, { recursive: true, force: true })
    }
  },
  60000,
)

it.skipIf(process.platform !== 'linux' && process.platform !== 'darwin')(
  'C2/C6 an unbounded batch retains the originally opened directory if its parent name changes during publication',
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'visit-publish-')))
    const state = join(root, 'state')
    const original = join(root, 'entered'),
      moved = join(root, 'renamed')
    const engine = createHostFilesEngine({ stateDirectory: state })
    try {
      await mkdir(state)
      await mkdir(original)
      const path = join(original, 'replace.txt')
      await writeFile(path, 'old bytes')
      const files = engine.facilityFor('test')
      const request = {
        requestId: 'rename-on-publish',
        access: { principal: 'test', tenant },
        origin: originRef('test'),
        binding: { kind: 'host_machine' as const },
      }
      const named = await hostObjectToken(path)
      const version = done(await files.stat({ ...request, path, named })).version
      fault.moves = 0
      fault.moveParent = { from: original, to: moved }
      const publication = await files.commitBatch({
        ...request,
        observeDirectory: true,
        entries: [
          { path, named, expectedVersion: version, bytes: new TextEncoder().encode('new bytes') },
        ],
      })
      expect(fault.moves).toBe(1)
      expect(publication).toMatchObject({
        kind: 'done',
        value: { kind: 'committed', published: [path] },
        verifiedDirectories: [original],
      })
      expect(await readFile(join(moved, 'replace.txt'), 'utf8')).toBe('new bytes')
    } finally {
      fault.moveParent = undefined
      await engine.closeOwned('test')
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)
