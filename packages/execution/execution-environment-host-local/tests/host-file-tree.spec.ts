// The six tree operations of the host files facility (list, search, mkdir, remove, move, copy) on
// the real file system, without a host file root. Each operation shows done, a refusal, and where
// the operation can stop half way, unknown. Faults are injected under `node:fs/promises` only for the
// unknown answers; everything else is the real file system.
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open as openFile,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type EnvironmentBinding,
  type FacilityResult,
  type FileRequest,
  type FileSystemFacility,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createHostFilesEngine } from '../src/host-files.ts'

type Fault = { fn: string; match: string; code: string; times: number }
const faults = vi.hoisted(() => ({ rules: [] as Fault[] }))

function injected(fn: string, args: readonly unknown[]): Fault | undefined {
  const texts = args.filter((arg): arg is string => typeof arg === 'string')
  return faults.rules.find(
    rule => rule.fn === fn && rule.times > 0 && texts.some(text => text.includes(rule.match)),
  )
}

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const failing = (fn: string, args: readonly unknown[]) => {
    const rule = injected(fn, args)
    if (rule === undefined) return
    rule.times--
    throw Object.assign(new Error(`injected ${rule.code}`), { code: rule.code })
  }
  return {
    ...actual,
    readdir: async (...args: Parameters<typeof actual.readdir>) => {
      failing('readdir', args)
      return actual.readdir(...args)
    },
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      failing('mkdir', args)
      return actual.mkdir(...args)
    },
    unlink: async (...args: Parameters<typeof actual.unlink>) => {
      failing('unlink', args)
      return actual.unlink(...args)
    },
    rmdir: async (...args: Parameters<typeof actual.rmdir>) => {
      failing('rmdir', args)
      return actual.rmdir(...args)
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      failing('open', args)
      const handle = await actual.open(...args)
      const rule = injected('write', args)
      if (rule !== undefined) {
        handle.write = async () => {
          rule.times--
          throw Object.assign(new Error(`injected ${rule.code}`), { code: rule.code })
        }
      }
      return handle
    },
  }
})

const roots: string[] = []

// These tests need `/proc/self/fd` and a POSIX file system; elsewhere they are skipped, not passed.
beforeEach(({ skip }) => {
  skip(process.platform !== 'linux')
})

afterEach(async () => {
  faults.rules.length = 0
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tree(base = tmpdir()) {
  const root = await realpath(await mkdtemp(join(base, 'omne-exec-tree-')))
  roots.push(root)
  return root
}

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

const sandbox: EnvironmentBinding = { kind: 'tenant_sandbox', tenant }

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

const text = (value: string) => new TextEncoder().encode(value)
const refused = (requestId: string, reason: string) => ({ kind: 'rejected', requestId, reason })

function done<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result.value
}

function files(limits?: Parameters<typeof createHostFilesEngine>[1]): FileSystemFacility<unknown> {
  return createHostFilesEngine(undefined, limits).facilityFor('tree-spec')
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  )
}

it('lists a directory in name order and pages it', async () => {
  const base = await tree()
  const dir = join(base, 'dir')
  await mkdir(dir)
  // Created from the last name to the first, with a size that tells the entries apart.
  for (let index = 11; index >= 0; index--)
    await writeFile(join(dir, `n${String(index).padStart(2, '0')}`), 'x'.repeat(index + 1))
  const named = await hostObjectToken(dir)
  const facility = files()
  const sizes = (page: Awaited<ReturnType<typeof facility.list>>) =>
    done(page).entries.map(entry => entry.sizeBytes)

  const first = await facility.list({ ...request(dir, named, 'p1'), offset: 0, limit: 5 })
  expect(sizes(first)).toEqual([1, 2, 3, 4, 5])
  expect(done(first).nextOffset).toBe(5)
  expect(done(first).directory.object).toEqual(named)
  const second = await facility.list({ ...request(dir, named, 'p2'), offset: 5, limit: 5 })
  expect(sizes(second)).toEqual([6, 7, 8, 9, 10])
  expect(done(second).nextOffset).toBe(10)
  const third = await facility.list({ ...request(dir, named, 'p3'), offset: 10, limit: 5 })
  expect(sizes(third)).toEqual([11, 12])
  expect(done(third).nextOffset).toBeUndefined()
  expect(done(second).directory.version).toBe(done(first).directory.version)

  await writeFile(join(dir, 'later'), 'new')
  const changed = await facility.list({ ...request(dir, named, 'p4'), limit: 1 })
  expect(done(changed).directory.version).not.toBe(done(first).directory.version)
})

it('reports the type of every entry, a link as symlink, and does not follow the link', async () => {
  const base = await tree()
  const dir = join(base, 'dir')
  const outside = join(base, 'outside')
  await mkdir(dir)
  await mkdir(outside)
  await writeFile(join(outside, 'inside-the-link'), 'x')
  await writeFile(join(dir, 'file'), 'bb')
  await mkdir(join(dir, 'sub'))
  await symlink(outside, join(dir, 'link'))
  const listed = done(await files().list(request(dir, await hostObjectToken(dir), 'types')))
  expect(listed.entries.map(entry => entry.type).sort()).toEqual(['directory', 'file', 'symlink'])
  const link = listed.entries.find(entry => entry.type === 'symlink')
  expect(link?.object).toEqual(await hostObjectToken(join(dir, 'link')))
  expect(listed.entries).toHaveLength(3)
})

it('answers done with no entries when the offset passes the last entry', async () => {
  const base = await tree()
  await writeFile(join(base, 'only'), 'x')
  const result = await files().list({
    ...request(base, await hostObjectToken(base), 'past'),
    offset: 5,
  })
  expect(done(result)).toMatchObject({ entries: [] })
  expect(done(result).nextOffset).toBeUndefined()
})

it('refuses list for a missing path as unresolved and for the other bad requests with a reason', async () => {
  const base = await tree()
  const file = join(base, 'file')
  await writeFile(file, 'x')
  const named = await hostObjectToken(base)
  const facility = files({ listPageLimit: 2 })
  expect(await facility.list(request(join(base, 'missing'), named, 'missing'))).toEqual({
    kind: 'unresolved',
    requestId: 'missing',
  })
  expect(await facility.list(request(file, await hostObjectToken(file), 'file'))).toEqual(
    refused('file', 'unsupported'),
  )
  expect(await facility.list(request(base, null, 'unnamed'))).toEqual(
    refused('unnamed', 'notAuthorized'),
  )
  expect(await facility.list(request(base, await hostObjectToken(file), 'wrong'))).toEqual(
    refused('wrong', 'conflict'),
  )
  expect(await facility.list({ ...request(base, named, 'sandbox'), binding: sandbox })).toEqual(
    refused('sandbox', 'unsupported'),
  )
  expect(await facility.list(request('relative/dir', named, 'relative'))).toEqual(
    refused('relative', 'invalidInput'),
  )
  expect(await facility.list(request(`${base}\0`, named, 'nul'))).toEqual(
    refused('nul', 'invalidInput'),
  )
  for (const [id, extra] of [
    ['zero', { limit: 0 }],
    ['negative', { offset: -1 }],
    ['fraction', { offset: 1.5 }],
    ['over', { limit: 3 }],
  ] as const) {
    expect(await facility.list({ ...request(base, named, id), ...extra })).toEqual(
      refused(id, 'invalidInput'),
    )
  }
})

it('does not follow a directory that was replaced by a link', async () => {
  const base = await tree()
  const dir = join(base, 'dir')
  await mkdir(dir)
  const named = await hostObjectToken(dir)
  await rm(dir, { recursive: true })
  await mkdir(join(base, 'elsewhere'))
  await symlink(join(base, 'elsewhere'), dir)
  expect(await files().list(request(dir, named, 'link'))).toEqual(refused('link', 'unsupported'))
})

it('answers unknown when reading the directory fails half way', async () => {
  const base = await tree()
  await writeFile(join(base, 'x'), 'x')
  faults.rules.push({ fn: 'readdir', match: '/proc/self/fd/', code: 'EIO', times: 1 })
  const result = await files().list(request(base, await hostObjectToken(base), 'eio'))
  expect(result).toEqual({ kind: 'unknown', requestId: 'eio' })
})

const search = (
  facility: FileSystemFacility<unknown>,
  dir: string,
  named: ObjectToken,
  pattern: string,
  extra: Partial<Parameters<FileSystemFacility<unknown>['search']>[0]> = {},
) =>
  facility.search({
    ...request(dir, named, extra.requestId ?? 'search'),
    pattern: text(pattern),
    match: 'name',
    recursive: false,
    ...extra,
  })

it('searches by name, with and without descending, in name order and page by page', async () => {
  const base = await tree()
  const outside = join(base, 'outside')
  const dir = join(base, 'dir')
  await mkdir(join(dir, 'sub'), { recursive: true })
  await mkdir(outside)
  await writeFile(join(outside, 'needle-secret'), 'x')
  await writeFile(join(dir, 'needle-1'), 'x')
  await writeFile(join(dir, 'other'), 'x')
  await writeFile(join(dir, 'sub', 'needle-2'), 'x')
  await symlink(outside, join(dir, 'needle-link'))
  const named = await hostObjectToken(dir)
  const facility = files()

  const shallow = done(await search(facility, dir, named, 'needle'))
  expect(shallow.hits.map(hit => hit.path)).toEqual([
    join(dir, 'needle-1'),
    join(dir, 'needle-link'),
  ])
  expect(shallow.truncated).toBe(false)
  expect(shallow.root.object).toEqual(named)

  const deep = done(await search(facility, dir, named, 'needle', { recursive: true }))
  expect(deep.hits.map(hit => hit.path)).toEqual([
    join(dir, 'needle-1'),
    join(dir, 'needle-link'),
    join(dir, 'sub', 'needle-2'),
  ])
  expect(deep.hits[0]?.object).toEqual(await hostObjectToken(join(dir, 'needle-1')))

  const page = done(await search(facility, dir, named, 'needle', { recursive: true, limit: 2 }))
  expect(page.hits).toHaveLength(2)
  expect(page.nextOffset).toBe(2)
  const rest = done(
    await search(facility, dir, named, 'needle', { recursive: true, limit: 2, offset: 2 }),
  )
  expect(rest.hits.map(hit => hit.path)).toEqual([join(dir, 'sub', 'needle-2')])
  expect(rest.nextOffset).toBeUndefined()
})

it('searches file contents, reports the first match offset and skips links and directories', async () => {
  const base = await tree()
  const outside = join(base, 'outside.txt')
  const dir = join(base, 'dir')
  await mkdir(join(dir, 'sub'), { recursive: true })
  await writeFile(outside, 'has needle')
  await writeFile(join(dir, 'a.txt'), 'xx needle needle')
  await writeFile(join(dir, 'b.txt'), 'nothing here')
  await writeFile(join(dir, 'sub', 'c.txt'), 'needle')
  await symlink(outside, join(dir, 'link.txt'))
  const named = await hostObjectToken(dir)
  const result = done(
    await search(files(), dir, named, 'needle', { match: 'content', recursive: true }),
  )
  expect(result.hits.map(hit => [hit.path, hit.offsetBytes])).toEqual([
    [join(dir, 'a.txt'), 3],
    [join(dir, 'sub', 'c.txt'), 0],
  ])
})

it('stops at a budget and says the result is truncated', async () => {
  const base = await tree()
  const dir = join(base, 'dir')
  await mkdir(dir)
  for (const name of ['a', 'b', 'c', 'd']) await writeFile(join(dir, name), 'needle')
  await writeFile(join(dir, 'e-large'), 'needle'.repeat(20))
  const named = await hostObjectToken(dir)

  const entries = done(
    await search(files({ searchEntryBudget: 2 }), dir, named, 'needle', { match: 'content' }),
  )
  expect(entries.truncated).toBe(true)
  expect(entries.hits.length).toBeLessThan(5)

  const bytes = done(
    await search(files({ searchByteBudget: 12 }), dir, named, 'needle', { match: 'content' }),
  )
  expect(bytes.truncated).toBe(true)
  expect(bytes.hits.map(hit => hit.path)).toEqual([join(dir, 'a'), join(dir, 'b')])

  const large = done(
    await search(files({ searchFileBytes: 10 }), dir, named, 'needle', { match: 'content' }),
  )
  expect(large.truncated).toBe(true)
  expect(large.hits.map(hit => hit.path)).not.toContain(join(dir, 'e-large'))
  expect(large.hits).toHaveLength(4)
})

it('refuses search for an empty pattern, a missing start, a file start and the wrong name', async () => {
  const base = await tree()
  const file = join(base, 'file')
  await writeFile(file, 'x')
  const named = await hostObjectToken(base)
  const facility = files()
  expect(await search(facility, base, named, '', { requestId: 'empty' })).toEqual(
    refused('empty', 'invalidInput'),
  )
  expect(await search(facility, join(base, 'gone'), named, 'x', { requestId: 'gone' })).toEqual(
    refused('gone', 'notFound'),
  )
  expect(
    await search(facility, file, await hostObjectToken(file), 'x', { requestId: 'file' }),
  ).toEqual(refused('file', 'unsupported'))
  expect(
    await search(facility, base, await hostObjectToken(file), 'x', { requestId: 'wrong' }),
  ).toEqual(refused('wrong', 'conflict'))
  expect(await search(facility, base, named, 'x', { requestId: 'zero', limit: 0 })).toEqual(
    refused('zero', 'invalidInput'),
  )
})

it('answers unknown when the search fails half way', async () => {
  const base = await tree()
  await writeFile(join(base, 'x'), 'x')
  faults.rules.push({ fn: 'readdir', match: '/proc/self/fd/', code: 'EIO', times: 1 })
  const result = await search(files(), base, await hostObjectToken(base), 'x', { requestId: 'eio' })
  expect(result).toEqual({ kind: 'unknown', requestId: 'eio' })
})

it('creates a directory under the named parent and reports its identity', async () => {
  const base = await tree()
  const target = join(base, 'made')
  const result = done(
    await files().mkdir({ ...request(target, await hostObjectToken(base), 'mk'), parents: false }),
  )
  expect((await lstat(target)).isDirectory()).toBe(true)
  expect(result.object).toEqual(await hostObjectToken(target))
  expect(result.version).toBe(
    `${(await stat(target, { bigint: true })).mtimeMs}:${(await stat(target)).size}`,
  )
})

it('refuses mkdir for an existing target, a missing parent, a wrong or absent name', async () => {
  const base = await tree()
  await mkdir(join(base, 'there'))
  const named = await hostObjectToken(base)
  const facility = files()
  const make = (id: string, path: string, parent: ObjectToken | null, parents = false) =>
    facility.mkdir({ ...request(path, parent, id), parents })
  expect(await make('exists', join(base, 'there'), named)).toEqual(refused('exists', 'conflict'))
  expect(await make('orphan', join(base, 'no', 'deep'), named)).toEqual(
    refused('orphan', 'notFound'),
  )
  expect(await make('wrong', join(base, 'x'), await hostObjectToken(join(base, 'there')))).toEqual(
    refused('wrong', 'conflict'),
  )
  expect(await make('unnamed', join(base, 'x'), null)).toEqual(refused('unnamed', 'notAuthorized'))
  expect(await exists(join(base, 'x'))).toBe(false)
})

it('creates the missing chain below the named nearest ancestor when parents is true', async () => {
  const base = await tree()
  const named = await hostObjectToken(base)
  const target = join(base, 'a', 'b', 'c')
  const result = done(await files().mkdir({ ...request(target, named, 'chain'), parents: true }))
  expect(result.object).toEqual(await hostObjectToken(target))
  const wrong = await files().mkdir({
    ...request(join(base, 'x', 'y'), await hostObjectToken(join(base, 'a')), 'wrong'),
    parents: true,
  })
  expect(wrong).toEqual(refused('wrong', 'conflict'))
  expect(await exists(join(base, 'x'))).toBe(false)
  const again = await files().mkdir({ ...request(target, named, 'again'), parents: true })
  expect(again).toEqual(refused('again', 'conflict'))
})

it('answers unknown and leaves the directories already made when a later one fails', async () => {
  const base = await tree()
  faults.rules.push({ fn: 'mkdir', match: 'second', code: 'EIO', times: 1 })
  const result = await files().mkdir({
    ...request(join(base, 'first', 'second'), await hostObjectToken(base), 'half'),
    parents: true,
  })
  expect(result).toEqual({ kind: 'unknown', requestId: 'half' })
  expect((await lstat(join(base, 'first'))).isDirectory()).toBe(true)
  expect(await exists(join(base, 'first', 'second'))).toBe(false)
})

const remove = (
  facility: FileSystemFacility<unknown>,
  path: string,
  named: ObjectToken | null,
  id: string,
  extra: { recursive?: boolean; expectedVersion?: string } = {},
) => facility.remove({ ...request(path, named, id), recursive: extra.recursive ?? false, ...extra })

it('removes a file, a link without touching its target, and an empty directory', async () => {
  const base = await tree()
  await writeFile(join(base, 'file'), 'x')
  await writeFile(join(base, 'target'), 'kept')
  await symlink(join(base, 'target'), join(base, 'link'))
  await mkdir(join(base, 'empty'))
  const facility = files()
  const file = await hostObjectToken(join(base, 'file'))
  expect(done(await remove(facility, join(base, 'file'), file, 'f'))).toEqual({ removed: file })
  const linkToken = await hostObjectToken(join(base, 'link'))
  expect(done(await remove(facility, join(base, 'link'), linkToken, 'l'))).toEqual({
    removed: linkToken,
  })
  expect(await readFile(join(base, 'target'), 'utf8')).toBe('kept')
  const empty = await hostObjectToken(join(base, 'empty'))
  done(await remove(facility, join(base, 'empty'), empty, 'd'))
  expect(await readdir(base)).toEqual(['target'])
})

it('refuses remove for a missing object, a changed one, an old version and a non-empty directory', async () => {
  const base = await tree()
  await writeFile(join(base, 'file'), 'x')
  await mkdir(join(base, 'full'))
  await writeFile(join(base, 'full', 'inner'), 'x')
  const facility = files()
  const file = await hostObjectToken(join(base, 'file'))
  expect(await remove(facility, join(base, 'gone'), file, 'gone')).toEqual(
    refused('gone', 'notFound'),
  )
  expect(await remove(facility, join(base, 'file'), { token: '1:1' }, 'wrong')).toEqual(
    refused('wrong', 'conflict'),
  )
  expect(
    await remove(facility, join(base, 'file'), file, 'stale', { expectedVersion: '0:0' }),
  ).toEqual(refused('stale', 'conflict'))
  expect(await remove(facility, join(base, 'file'), null, 'unnamed')).toEqual(
    refused('unnamed', 'notAuthorized'),
  )
  expect(
    await remove(facility, join(base, 'full'), await hostObjectToken(join(base, 'full')), 'full'),
  ).toEqual(refused('full', 'conflict'))
  expect(await readdir(base)).toEqual(['file', 'full'])
})

it('removes a directory tree without entering links and leaves what the links point to', async () => {
  const base = await tree()
  const outside = join(base, 'outside')
  const dir = join(base, 'dir')
  await mkdir(outside)
  await writeFile(join(outside, 'secret'), 'secret')
  await mkdir(join(dir, 'sub', 'deep'), { recursive: true })
  await writeFile(join(dir, 'sub', 'deep', 'leaf'), 'x')
  await writeFile(join(dir, 'top'), 'x')
  await symlink(outside, join(dir, 'sub', 'out-link'))
  const result = await remove(files(), dir, await hostObjectToken(dir), 'tree', { recursive: true })
  expect(result.kind).toBe('done')
  expect(await exists(dir)).toBe(false)
  expect(await readFile(join(outside, 'secret'), 'utf8')).toBe('secret')
})

it('answers unknown when a recursive remove fails after it removed a part', async () => {
  const base = await tree()
  const dir = join(base, 'dir')
  await mkdir(dir)
  await writeFile(join(dir, 'a'), 'x')
  await writeFile(join(dir, 'b-stuck'), 'x')
  faults.rules.push({ fn: 'unlink', match: 'b-stuck', code: 'EIO', times: 1 })
  const result = await remove(files(), dir, await hostObjectToken(dir), 'half', { recursive: true })
  expect(result).toEqual({ kind: 'unknown', requestId: 'half' })
  expect(await readdir(dir)).toEqual(['b-stuck'])
})

const move = (
  facility: FileSystemFacility<unknown>,
  from: string,
  fromNamed: ObjectToken | null,
  to: string,
  toNamed: ObjectToken | null,
  id: string,
  extra: { replace?: boolean; expectedVersion?: string } = {},
) =>
  facility.move({
    ...request(from, fromNamed, id),
    target: { path: to, named: toNamed },
    replace: extra.replace ?? false,
    ...(extra.expectedVersion === undefined ? {} : { expectedVersion: extra.expectedVersion }),
  })

it('moves a file and a directory to a new name and reports both identities', async () => {
  const base = await tree()
  const parent = await hostObjectToken(base)
  await writeFile(join(base, 'file'), 'bytes')
  await mkdir(join(base, 'dir'))
  await writeFile(join(base, 'dir', 'inner'), 'x')
  const facility = files()
  const file = await hostObjectToken(join(base, 'file'))
  const moved = done(
    await move(facility, join(base, 'file'), file, join(base, 'file2'), parent, 'file'),
  )
  expect(moved.source).toEqual(file)
  expect(moved.target.object).toEqual(file)
  expect(await readFile(join(base, 'file2'), 'utf8')).toBe('bytes')
  expect(await exists(join(base, 'file'))).toBe(false)
  const dir = await hostObjectToken(join(base, 'dir'))
  done(await move(facility, join(base, 'dir'), dir, join(base, 'dir2'), parent, 'dir'))
  expect(await readFile(join(base, 'dir2', 'inner'), 'utf8')).toBe('x')
})

it('moves a link as a link, not what it points to', async () => {
  const base = await tree()
  await writeFile(join(base, 'target'), 'kept')
  await symlink(join(base, 'target'), join(base, 'link'))
  const link = await hostObjectToken(join(base, 'link'))
  done(
    await move(
      files(),
      join(base, 'link'),
      link,
      join(base, 'link2'),
      await hostObjectToken(base),
      'l',
    ),
  )
  expect((await lstat(join(base, 'link2'))).isSymbolicLink()).toBe(true)
  expect(await readFile(join(base, 'target'), 'utf8')).toBe('kept')
})

it('does not replace an existing target unless replace is true, and then replaces the named object', async () => {
  const base = await tree()
  const parent = await hostObjectToken(base)
  await writeFile(join(base, 'from'), 'from')
  await writeFile(join(base, 'to'), 'to')
  const facility = files()
  const from = await hostObjectToken(join(base, 'from'))
  const to = await hostObjectToken(join(base, 'to'))
  expect(await move(facility, join(base, 'from'), from, join(base, 'to'), parent, 'keep')).toEqual(
    refused('keep', 'conflict'),
  )
  expect(await readFile(join(base, 'to'), 'utf8')).toBe('to')
  expect(await readFile(join(base, 'from'), 'utf8')).toBe('from')
  expect(
    await move(facility, join(base, 'from'), from, join(base, 'to'), parent, 'unnamed', {
      replace: true,
    }),
  ).toEqual(refused('unnamed', 'conflict'))
  const replaced = done(
    await move(facility, join(base, 'from'), from, join(base, 'to'), to, 'replace', {
      replace: true,
    }),
  )
  expect(replaced.target.object).toEqual(from)
  expect(await readFile(join(base, 'to'), 'utf8')).toBe('from')
})

it('refuses move for a missing source, an old version, a wrong name and an absent target name', async () => {
  const base = await tree()
  const parent = await hostObjectToken(base)
  await writeFile(join(base, 'from'), 'from')
  const facility = files()
  const from = await hostObjectToken(join(base, 'from'))
  expect(await move(facility, join(base, 'gone'), from, join(base, 'x'), parent, 'gone')).toEqual(
    refused('gone', 'notFound'),
  )
  expect(
    await move(facility, join(base, 'from'), from, join(base, 'x'), parent, 'stale', {
      expectedVersion: '0:0',
    }),
  ).toEqual(refused('stale', 'conflict'))
  expect(await move(facility, join(base, 'from'), from, join(base, 'x'), from, 'wrong')).toEqual(
    refused('wrong', 'conflict'),
  )
  expect(await move(facility, join(base, 'from'), from, join(base, 'x'), null, 'unnamed')).toEqual(
    refused('unnamed', 'notAuthorized'),
  )
  expect(await move(facility, join(base, 'from'), from, 'relative', parent, 'rel')).toEqual(
    refused('rel', 'invalidInput'),
  )
  expect(await readdir(base)).toEqual(['from'])
})

it('answers unsupported when the move would cross devices', async () => {
  const other = await tree('/dev/shm')
  const base = await tree()
  if ((await lstat(other)).dev === (await lstat(base)).dev) return
  await writeFile(join(other, 'from'), 'x')
  const result = await move(
    files(),
    join(other, 'from'),
    await hostObjectToken(join(other, 'from')),
    join(base, 'to'),
    await hostObjectToken(base),
    'exdev',
  )
  expect(result).toEqual(refused('exdev', 'unsupported'))
  expect(await readFile(join(other, 'from'), 'utf8')).toBe('x')
  expect(await exists(join(base, 'to'))).toBe(false)
})

it('answers unknown with both names present when the old name cannot be removed after the new one exists', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'x')
  faults.rules.push({ fn: 'unlink', match: 'from', code: 'EIO', times: 1 })
  const result = await move(
    files(),
    join(base, 'from'),
    await hostObjectToken(join(base, 'from')),
    join(base, 'to'),
    await hostObjectToken(base),
    'both',
  )
  expect(result).toEqual({ kind: 'unknown', requestId: 'both' })
  expect(await readdir(base)).toEqual(['from', 'to'])
})

const copy = (
  facility: FileSystemFacility<unknown>,
  from: string,
  fromNamed: ObjectToken | null,
  to: string,
  toNamed: ObjectToken | null,
  id: string,
  extra: { replace?: boolean; expectedVersion?: string } = {},
) =>
  facility.copy({
    ...request(from, fromNamed, id),
    target: { path: to, named: toNamed },
    replace: extra.replace ?? false,
    ...(extra.expectedVersion === undefined ? {} : { expectedVersion: extra.expectedVersion }),
  })

it('copies a file under a new name and leaves the source and no temporary file behind', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'bytes')
  const from = await hostObjectToken(join(base, 'from'))
  const result = done(
    await copy(
      files(),
      join(base, 'from'),
      from,
      join(base, 'to'),
      await hostObjectToken(base),
      'c',
    ),
  )
  expect(result.source).toEqual(from)
  expect(result.target.object).toEqual(await hostObjectToken(join(base, 'to')))
  expect(result.target.object).not.toEqual(from)
  expect(await readFile(join(base, 'to'), 'utf8')).toBe('bytes')
  expect(await readdir(base)).toEqual(['from', 'to'])
})

it('replaces by writing a new file, so an earlier reader still sees the old bytes, and does not replace otherwise', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'new bytes')
  await writeFile(join(base, 'to'), 'old bytes')
  const from = await hostObjectToken(join(base, 'from'))
  const to = await hostObjectToken(join(base, 'to'))
  const parent = await hostObjectToken(base)
  const facility = files()
  expect(await copy(facility, join(base, 'from'), from, join(base, 'to'), parent, 'keep')).toEqual(
    refused('keep', 'conflict'),
  )
  expect(await readFile(join(base, 'to'), 'utf8')).toBe('old bytes')
  const reader = await openFile(join(base, 'to'), 'r')
  try {
    const replaced = done(
      await copy(facility, join(base, 'from'), from, join(base, 'to'), to, 'replace', {
        replace: true,
      }),
    )
    expect(replaced.target.object).not.toEqual(to)
    expect(await readFile(join(base, 'to'), 'utf8')).toBe('new bytes')
    const old = Buffer.alloc(9)
    await reader.read(old, 0, 9, 0)
    expect(old.toString()).toBe('old bytes')
  } finally {
    await reader.close()
  }
  expect(await readdir(base)).toEqual(['from', 'to'])
})

it('refuses copy for a directory, a link, an old version, a missing source and a wrong name', async () => {
  const base = await tree()
  const parent = await hostObjectToken(base)
  await mkdir(join(base, 'dir'))
  await writeFile(join(base, 'file'), 'x')
  await symlink(join(base, 'file'), join(base, 'link'))
  const facility = files()
  const file = await hostObjectToken(join(base, 'file'))
  const to = join(base, 'to')
  expect(
    await copy(
      facility,
      join(base, 'dir'),
      await hostObjectToken(join(base, 'dir')),
      to,
      parent,
      'dir',
    ),
  ).toEqual(refused('dir', 'unsupported'))
  expect(
    await copy(
      facility,
      join(base, 'link'),
      await hostObjectToken(join(base, 'link')),
      to,
      parent,
      'link',
    ),
  ).toEqual(refused('link', 'unsupported'))
  expect(
    await copy(facility, join(base, 'file'), file, to, parent, 'stale', { expectedVersion: '0:0' }),
  ).toEqual(refused('stale', 'conflict'))
  expect(await copy(facility, join(base, 'gone'), file, to, parent, 'gone')).toEqual(
    refused('gone', 'notFound'),
  )
  expect(await copy(facility, join(base, 'file'), parent, to, parent, 'wrong')).toEqual(
    refused('wrong', 'conflict'),
  )
  expect(await copy(facility, join(base, 'file'), file, to, null, 'unnamed')).toEqual(
    refused('unnamed', 'notAuthorized'),
  )
  expect(await exists(to)).toBe(false)
})

it('removes its temporary file and keeps the target when a replacing write fails', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'new')
  await writeFile(join(base, 'to'), 'old')
  faults.rules.push({ fn: 'write', match: '.omne-copy-', code: 'ENOSPC', times: 1 })
  const result = await copy(
    files(),
    join(base, 'from'),
    await hostObjectToken(join(base, 'from')),
    join(base, 'to'),
    await hostObjectToken(join(base, 'to')),
    'full',
    { replace: true },
  )
  expect(result).toEqual(refused('full', 'capacity'))
  expect(await readFile(join(base, 'to'), 'utf8')).toBe('old')
  expect(await readdir(base)).toEqual(['from', 'to'])
})

it('answers unknown and keeps the target when the temporary file cannot be removed after a failed write', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'new')
  await writeFile(join(base, 'to'), 'old')
  faults.rules.push({ fn: 'write', match: '.omne-copy-', code: 'EIO', times: 1 })
  faults.rules.push({ fn: 'unlink', match: '.omne-copy-', code: 'EIO', times: 1 })
  const result = await copy(
    files(),
    join(base, 'from'),
    await hostObjectToken(join(base, 'from')),
    join(base, 'to'),
    await hostObjectToken(join(base, 'to')),
    'stuck',
    { replace: true },
  )
  expect(result).toEqual({ kind: 'unknown', requestId: 'stuck' })
  expect(await readFile(join(base, 'to'), 'utf8')).toBe('old')
})

it('answers unknown and leaves the new file when a non-replacing write fails after the create', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'bytes')
  faults.rules.push({ fn: 'write', match: '/to', code: 'EIO', times: 1 })
  const result = await copy(
    files(),
    join(base, 'from'),
    await hostObjectToken(join(base, 'from')),
    join(base, 'to'),
    await hostObjectToken(base),
    'half',
  )
  expect(result).toEqual({ kind: 'unknown', requestId: 'half' })
  expect(await exists(join(base, 'to'))).toBe(true)
})

it('does not change the bytes of a hard link when the other name is replaced by a copy', async () => {
  const base = await tree()
  await writeFile(join(base, 'from'), 'new')
  await writeFile(join(base, 'a'), 'shared')
  await link(join(base, 'a'), join(base, 'b'))
  const result = await copy(
    files(),
    join(base, 'from'),
    await hostObjectToken(join(base, 'from')),
    join(base, 'a'),
    await hostObjectToken(join(base, 'a')),
    'hard',
    { replace: true },
  )
  expect(result.kind).toBe('done')
  expect(await readFile(join(base, 'b'), 'utf8')).toBe('shared')
})
