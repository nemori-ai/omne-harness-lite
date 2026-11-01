// The host file root on the real Linux file system: the four ways a path can leave the root
// (resolution outside it, `..`, a link to the outside, a hard link to an outside file), the races
// around a directory swapped under the walk, and the root's own identity. Every refusal is checked
// against a snapshot of the root and of the outside tree taken before and after the request.
import {
  chmod,
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
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type FacilityResult,
  type FileRequest,
  type FileSystemFacility,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createHostFilesEngine } from '../src/host-files.ts'
import { probeHostFilesPrerequisite } from '../src/host-paths.ts'

type Hook = { fn: string; match: string; run: () => Promise<void> }
const hooks = vi.hoisted(() => ({ rules: [] as Hook[] }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  /** Runs the first matching hook once, before the call it precedes reaches the file system. */
  const before = async (fn: string, args: readonly unknown[]) => {
    const texts = args.filter((arg): arg is string => typeof arg === 'string')
    const index = hooks.rules.findIndex(
      rule => rule.fn === fn && texts.some(text => text.includes(rule.match)),
    )
    if (index < 0) return
    const [rule] = hooks.rules.splice(index, 1)
    await rule?.run()
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
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      await before('mkdir', args)
      return actual.mkdir(...args)
    },
    link: async (...args: Parameters<typeof actual.link>) => {
      await before('link', args)
      return actual.link(...args)
    },
  }
})

const bases: string[] = []

// These tests need `/proc/self/fd` and a POSIX file system; elsewhere they are skipped, not passed.
beforeEach(({ skip }) => {
  skip(process.platform !== 'linux')
})

afterEach(async () => {
  hooks.rules.length = 0
  await Promise.all(
    bases.splice(0).map(async base => {
      await chmod(base, 0o700).catch(() => undefined)
      await rm(base, { recursive: true, force: true })
    }),
  )
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
const refused = (requestId: string, reason: string) => ({ kind: 'rejected', requestId, reason })

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

function done<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}

/**
 * The world of one case: `root/` is the host file root, `outside/` a sibling the root must never
 * touch, `evil/` a sibling whose name begins with the root's name, `state/` the batch state.
 */
type World = Readonly<{
  base: string
  root: string
  outside: string
  state: string
  okToken: ObjectToken
  rootToken: ObjectToken
  facility: FileSystemFacility<unknown>
}>

async function world(options: { root?: boolean } = {}): Promise<World> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-root-')))
  bases.push(base)
  const root = join(base, 'root')
  const outside = join(base, 'outside')
  // The state directory is the engine's own; it is kept out of the tree the snapshots compare.
  const state = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-state-')))
  bases.push(state)
  await mkdir(join(root, 'dir'), { recursive: true })
  await mkdir(join(outside, 'odir'), { recursive: true })
  await mkdir(join(base, 'root-evil'))
  await writeFile(join(root, 'ok.txt'), 'inside')
  await writeFile(join(root, 'dir', 'inner.txt'), 'inner')
  await writeFile(join(outside, 'secret'), 'secret-bytes')
  await writeFile(join(base, 'root-evil', 'secret'), 'evil-bytes')
  const engine = createHostFilesEngine(
    options.root === false ? { stateDirectory: state } : { root, stateDirectory: state },
  )
  return {
    base,
    root,
    outside,
    state,
    okToken: await hostObjectToken(join(root, 'ok.txt')),
    rootToken: await hostObjectToken(root),
    facility: engine.facilityFor('root-spec'),
  }
}

type Entry = Readonly<{
  type: string
  size: number
  nlink: number
  mtimeMs: number
  ino: number
  mode: number
  digest: string | null
}>

/** Name, type, size, link count, modification time, inode, mode and a digest of the bytes. */
async function snapshot(directory: string, prefix = ''): Promise<Record<string, Entry>> {
  const entries: Record<string, Entry> = {}
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name)
    const stat = await lstat(path)
    const key = `${prefix}/${name}`
    const type = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file'
    entries[key] = {
      type,
      size: stat.size,
      nlink: stat.nlink,
      mtimeMs: stat.mtimeMs,
      ino: stat.ino,
      mode: stat.mode,
      digest:
        type === 'file'
          ? createHash('sha256')
              .update(await readFile(path))
              .digest('hex')
          : null,
    }
    if (type === 'directory') Object.assign(entries, await snapshot(path, key))
  }
  return entries
}

/** Runs the request and checks that neither the root nor the outside tree changed. */
async function unchanged(w: World, run: () => Promise<unknown>): Promise<unknown> {
  const before = await snapshot(w.base)
  const result = await run()
  expect(await snapshot(w.base)).toEqual(before)
  return result
}

/** The twelve calls aimed at one situation: a file, a directory, a name that does not exist yet. */
function calls(
  w: World,
  situation: {
    file: string
    fileToken: ObjectToken
    dir: string
    dirToken: ObjectToken
    fresh: string
  },
) {
  const f = w.facility
  const bytes = text('new bytes')
  const clean = join(w.root, 'ok.txt')
  return {
    read: () => f.read(request(situation.file, situation.fileToken, 'read')),
    replace: () =>
      f.write({
        ...request(situation.file, situation.fileToken, 'replace'),
        bytes,
        mode: 'replace',
      }),
    create: () =>
      f.write({ ...request(situation.fresh, situation.dirToken, 'create'), bytes, mode: 'create' }),
    mkdir: () =>
      f.mkdir({ ...request(situation.fresh, situation.dirToken, 'mkdir'), parents: false }),
    list: () => f.list(request(situation.dir, situation.dirToken, 'list')),
    search: () =>
      f.search({
        ...request(situation.dir, situation.dirToken, 'search'),
        pattern: text('inner'),
        match: 'content',
        recursive: true,
      }),
    remove: () =>
      f.remove({ ...request(situation.file, situation.fileToken, 'remove'), recursive: false }),
    moveFrom: () =>
      f.move({
        ...request(situation.file, situation.fileToken, 'moveFrom'),
        target: { path: join(w.root, 'moved'), named: w.rootToken },
        replace: false,
      }),
    moveInto: () =>
      f.move({
        ...request(clean, w.okToken, 'moveInto'),
        target: { path: situation.fresh, named: situation.dirToken },
        replace: false,
      }),
    copyFrom: () =>
      f.copy({
        ...request(situation.file, situation.fileToken, 'copyFrom'),
        target: { path: join(w.root, 'copied'), named: w.rootToken },
        replace: false,
      }),
    copyInto: () =>
      f.copy({
        ...request(clean, w.okToken, 'copyInto'),
        target: { path: situation.fresh, named: situation.dirToken },
        replace: false,
      }),
    batch: () =>
      f.commitBatch({
        requestId: 'batch',
        access: { principal: 'subject-a', tenant },
        origin: originRef('call-1'),
        binding: { kind: 'host_machine' },
        entries: [
          { path: situation.fresh, named: situation.dirToken, bytes, expectedVersion: null },
        ],
      }),
  }
}

async function everyCallRefuses(
  w: World,
  situation: Parameters<typeof calls>[1],
  reason: string,
  skip: readonly string[] = [],
) {
  const all = calls(w, situation)
  for (const [name, run] of Object.entries(all)) {
    if (skip.includes(name)) continue
    const result = await unchanged(w, run)
    expect(result, name).toEqual(refused(name, reason))
  }
}

it('reports a satisfied prerequisite for descriptor paths on Linux', async () => {
  expect(await probeHostFilesPrerequisite()).toBe('satisfied')
})

it('serves reads, writes and listings inside the root', async () => {
  const w = await world()
  const f = w.facility
  const ok = join(w.root, 'ok.txt')
  const named = await hostObjectToken(ok)
  expect(done(await f.read(request(ok, named, 'read'))).bytes).toEqual(text('inside'))
  expect(done(await f.stat(request(ok, named, 'stat'))).type).toBe('file')
  expect(done(await f.stat(request(w.root, await hostObjectToken(w.root), 'root'))).type).toBe(
    'directory',
  )
  const created = join(w.root, 'dir', 'new.txt')
  const parent = await hostObjectToken(join(w.root, 'dir'))
  done(await f.write({ ...request(created, parent, 'create'), bytes: text('n'), mode: 'create' }))
  expect(await readFile(created, 'utf8')).toBe('n')
  done(
    await f.write({
      ...request(created, await hostObjectToken(created), 'replace'),
      bytes: text('replaced'),
      mode: 'replace',
    }),
  )
  expect(await readFile(created, 'utf8')).toBe('replaced')
  const listed = done(await f.list(request(w.root, await hostObjectToken(w.root), 'list')))
  expect(listed.entries).toHaveLength(2)
})

it('refuses a create whose named parent is not the directory the path leads to', async () => {
  const w = await world()
  const result = await w.facility.write({
    ...request(join(w.root, 'dir', 'new.txt'), w.rootToken, 'wrong-parent'),
    bytes: text('x'),
    mode: 'create',
  })
  expect(result).toEqual(refused('wrong-parent', 'conflict'))
  expect(await readdir(join(w.root, 'dir'))).toEqual(['inner.txt'])
})

it('refuses a path that resolves outside the root, also one that only shares the name prefix', async () => {
  const w = await world()
  await everyCallRefuses(
    w,
    {
      file: join(w.outside, 'secret'),
      fileToken: await hostObjectToken(join(w.outside, 'secret')),
      dir: w.outside,
      dirToken: await hostObjectToken(w.outside),
      fresh: join(w.outside, 'new'),
    },
    'notAuthorized',
  )
  const evil = join(w.base, 'root-evil')
  const result = await unchanged(w, () =>
    w.facility.read(request(join(evil, 'secret'), null, 'sibling')),
  )
  expect(result).toEqual(refused('sibling', 'notAuthorized'))
  const named = await unchanged(w, async () =>
    w.facility.read(
      request(join(evil, 'secret'), await hostObjectToken(join(evil, 'secret')), 'named'),
    ),
  )
  expect(named).toEqual(refused('named', 'notAuthorized'))
})

it('refuses any path with a .. segment, also one that would resolve inside the root', async () => {
  const w = await world()
  const inside = `${w.root}/dir/../ok.txt`
  await everyCallRefuses(
    w,
    {
      file: inside,
      fileToken: await hostObjectToken(join(w.root, 'ok.txt')),
      dir: `${w.root}/dir/..`,
      dirToken: await hostObjectToken(w.root),
      fresh: `${w.root}/dir/../fresh`,
    },
    'notAuthorized',
  )
  const secret = await hostObjectToken(join(w.outside, 'secret'))
  const escaping = await unchanged(w, () =>
    w.facility.read(request(`${w.root}/dir/../../outside/secret`, secret, 'escape')),
  )
  expect(escaping).toEqual(refused('escape', 'notAuthorized'))
})

it('refuses a path that goes through a link to the outside, whatever the operation', async () => {
  const w = await world()
  await symlink(w.outside, join(w.root, 'linkdir'))
  const linked = join(w.root, 'linkdir')
  await everyCallRefuses(
    w,
    {
      file: join(linked, 'secret'),
      fileToken: await hostObjectToken(join(w.outside, 'secret')),
      dir: join(linked, 'odir'),
      dirToken: await hostObjectToken(join(w.outside, 'odir')),
      fresh: join(linked, 'new'),
    },
    'notAuthorized',
  )
})

it('treats a link as the last segment as the link itself: content operations refuse it, remove and move act on the link', async () => {
  const w = await world()
  await symlink(join(w.outside, 'secret'), join(w.root, 'linkfile'))
  await symlink(w.outside, join(w.root, 'linkdir'))
  const f = w.facility
  const linkfile = join(w.root, 'linkfile')
  const token = await hostObjectToken(linkfile)
  const secretBefore = await snapshot(w.outside)
  const rootToken = await hostObjectToken(w.root)
  expect(await unchanged(w, () => f.read(request(linkfile, token, 'read')))).toEqual(
    refused('read', 'unsupported'),
  )
  expect(
    await unchanged(w, () =>
      f.write({ ...request(linkfile, token, 'replace'), bytes: text('x'), mode: 'replace' }),
    ),
  ).toEqual(refused('replace', 'unsupported'))
  expect(
    await unchanged(w, () =>
      f.write({
        ...request(linkfile, rootToken, 'create'),
        bytes: text('x'),
        mode: 'create',
      }),
    ),
  ).toEqual(refused('create', 'conflict'))
  expect(await unchanged(w, () => f.list(request(join(w.root, 'linkdir'), token, 'list')))).toEqual(
    refused('list', 'unsupported'),
  )

  done(
    await f.move({
      ...request(linkfile, token, 'move'),
      target: { path: join(w.root, 'moved-link'), named: await hostObjectToken(w.root) },
      replace: false,
    }),
  )
  expect((await lstat(join(w.root, 'moved-link'))).isSymbolicLink()).toBe(true)
  done(
    await f.remove({
      ...request(join(w.root, 'moved-link'), token, 'remove'),
      recursive: false,
    }),
  )
  done(
    await f.remove({
      ...request(join(w.root, 'linkdir'), await hostObjectToken(join(w.root, 'linkdir')), 'rm'),
      recursive: true,
    }),
  )
  expect(await snapshot(w.outside)).toEqual(secretBefore)
})

it('refuses to read, write, copy or search the bytes of a file that has a second name outside the root', async () => {
  const w = await world()
  await link(join(w.outside, 'secret'), join(w.root, 'hard'))
  const hard = join(w.root, 'hard')
  const token = await hostObjectToken(hard)
  const situation = {
    file: hard,
    fileToken: token,
    dir: w.root,
    dirToken: await hostObjectToken(w.root),
    fresh: join(w.root, 'fresh'),
  }
  const all = calls(w, situation)
  for (const name of ['read', 'replace', 'copyFrom', 'search'] as const) {
    expect(await unchanged(w, all[name]), name).toEqual(refused(name, 'notAuthorized'))
  }
})

it('removing the root name of a hard link leaves the outside bytes and takes one link from the count', async () => {
  const w = await world()
  await link(join(w.outside, 'secret'), join(w.root, 'hard'))
  const hard = join(w.root, 'hard')
  done(
    await w.facility.remove({
      ...request(hard, await hostObjectToken(hard), 'remove'),
      recursive: false,
    }),
  )
  const secret = join(w.outside, 'secret')
  expect(await readFile(secret, 'utf8')).toBe('secret-bytes')
  expect((await lstat(secret)).nlink).toBe(1)
})

it('renaming the root name of a hard link, or replacing it in a batch, leaves the outside bytes', async () => {
  const w = await world()
  await link(join(w.outside, 'secret'), join(w.root, 'hard'))
  const hard = join(w.root, 'hard')
  const parent = await hostObjectToken(w.root)
  done(
    await w.facility.move({
      ...request(hard, await hostObjectToken(hard), 'move'),
      target: { path: join(w.root, 'renamed'), named: parent },
      replace: false,
    }),
  )
  const renamed = join(w.root, 'renamed')
  const version = done(
    await w.facility.stat(request(renamed, await hostObjectToken(renamed), 'stat')),
  ).version
  const batch = done(
    await w.facility.commitBatch({
      requestId: 'batch',
      access: { principal: 'subject-a', tenant },
      origin: originRef('call-1'),
      binding: { kind: 'host_machine' },
      entries: [
        {
          path: renamed,
          named: await hostObjectToken(renamed),
          bytes: text('replacement'),
          expectedVersion: version,
        },
      ],
    }),
  )
  expect(batch.kind).toBe('committed')
  expect(await readFile(renamed, 'utf8')).toBe('replacement')
  const secret = join(w.outside, 'secret')
  expect(await readFile(secret, 'utf8')).toBe('secret-bytes')
  expect((await lstat(secret)).nlink).toBe(1)
})

it('creates, renames and makes directories in the directory it opened when that directory is swapped for a link', async () => {
  const w = await world()
  const parentPath = join(w.root, 'p')
  await mkdir(parentPath)
  await writeFile(join(parentPath, 'source.txt'), 'source')
  const parent = await hostObjectToken(parentPath)
  const swapped = join(w.root, 'p-moved')
  const swap = async () => {
    await rename(parentPath, swapped)
    await symlink(w.outside, parentPath)
  }
  const outsideBefore = await snapshot(w.outside)

  hooks.rules.push({ fn: 'open', match: '/created.txt', run: swap })
  done(
    await w.facility.write({
      ...request(join(parentPath, 'created.txt'), parent, 'create'),
      bytes: text('created'),
      mode: 'create',
    }),
  )
  expect(await readFile(join(swapped, 'created.txt'), 'utf8')).toBe('created')
  expect(await snapshot(w.outside)).toEqual(outsideBefore)

  await rm(parentPath)
  await rename(swapped, parentPath)
  // Without replace a file is moved by link and unlink; with replace by rename.
  hooks.rules.push({ fn: 'link', match: '/renamed.txt', run: swap })
  done(
    await w.facility.move({
      ...request(
        join(parentPath, 'source.txt'),
        await hostObjectToken(join(parentPath, 'source.txt')),
        'move',
      ),
      target: { path: join(parentPath, 'renamed.txt'), named: parent },
      replace: false,
    }),
  )
  expect(await readFile(join(swapped, 'renamed.txt'), 'utf8')).toBe('source')
  expect(await snapshot(w.outside)).toEqual(outsideBefore)

  await rm(parentPath)
  await rename(swapped, parentPath)
  hooks.rules.push({ fn: 'rename', match: '/replaced.txt', run: swap })
  done(
    await w.facility.move({
      ...request(
        join(parentPath, 'renamed.txt'),
        await hostObjectToken(join(parentPath, 'renamed.txt')),
        'replace',
      ),
      target: { path: join(parentPath, 'replaced.txt'), named: parent },
      replace: true,
    }),
  )
  expect(await readFile(join(swapped, 'replaced.txt'), 'utf8')).toBe('source')
  expect(await snapshot(w.outside)).toEqual(outsideBefore)

  await rm(parentPath)
  await rename(swapped, parentPath)
  hooks.rules.push({ fn: 'mkdir', match: '/made', run: swap })
  done(
    await w.facility.mkdir({
      ...request(join(parentPath, 'made'), parent, 'mkdir'),
      parents: false,
    }),
  )
  expect((await lstat(join(swapped, 'made'))).isDirectory()).toBe(true)
  expect(await snapshot(w.outside)).toEqual(outsideBefore)
})

it('refuses when a directory on the way is swapped for a link to the outside during the walk', async () => {
  const w = await world()
  const mid = join(w.root, 'mid')
  await mkdir(mid)
  const parent = await hostObjectToken(mid)
  hooks.rules.push({
    fn: 'open',
    match: '/mid',
    run: async () => {
      await rename(mid, join(w.root, 'mid-original'))
      await symlink(w.outside, mid)
    },
  })
  const outsideBefore = await snapshot(w.outside)
  const result = await w.facility.write({
    ...request(join(mid, 'new.txt'), parent, 'raced'),
    bytes: text('x'),
    mode: 'create',
  })
  expect(result).toEqual(refused('raced', 'notAuthorized'))
  expect(await snapshot(w.outside)).toEqual(outsideBefore)
})

it('refuses everything once the directory at the root path is another directory than the one recorded', async () => {
  const w = await world()
  const ok = join(w.root, 'ok.txt')
  const named = await hostObjectToken(ok)
  expect(done(await w.facility.read(request(ok, named, 'before'))).bytes).toEqual(text('inside'))
  await rename(w.root, join(w.base, 'root-old'))
  await mkdir(w.root)
  await writeFile(ok, 'impostor')
  const result = await w.facility.read(request(ok, await hostObjectToken(ok), 'after'))
  expect(result).toEqual(refused('after', 'notAuthorized'))
})

it('answers unavailable for every operation when the root cannot be opened, and never falls back to no root', async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-root-')))
  bases.push(base)
  await writeFile(join(base, 'file.txt'), 'x')
  const engine = createHostFilesEngine({ root: join(base, 'no-such-root') })
  const f = engine.facilityFor('unavailable')
  const named = await hostObjectToken(join(base, 'file.txt'))
  expect(await f.read(request(join(base, 'file.txt'), named, 'read'))).toEqual(
    refused('read', 'unavailable'),
  )
  expect(await f.list(request(base, await hostObjectToken(base), 'list'))).toEqual(
    refused('list', 'unavailable'),
  )
})

it('rejects a root that is not an absolute path when the engine is made', () => {
  expect(() => createHostFilesEngine({ root: 'relative/root' })).toThrow(TypeError)
  expect(() => createHostFilesEngine({ stateDirectory: 'relative/state' })).toThrow(TypeError)
})

it('tells whether the engine has a root', () => {
  expect(createHostFilesEngine().hasRoot).toBe(false)
  expect(createHostFilesEngine({ root: tmpdir() }).hasRoot).toBe(true)
})

it('does not change the accepted behaviour for a path with an ancestor link when no root is configured', async () => {
  const w = await world({ root: false })
  await symlink(w.outside, join(w.root, 'linkdir'))
  const secret = join(w.root, 'linkdir', 'secret')
  const result = await w.facility.read(
    request(secret, await hostObjectToken(join(w.outside, 'secret')), 'follow'),
  )
  expect(done(result).bytes).toEqual(text('secret-bytes'))
})
