import { link, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))

it('reads the named object with exact bytes and closes only its issued generation', async () => {
  await withFiles(async ({ files, bytes, input, engine }) => {
    const result = await files.read(input)
    expect(result.kind).toBe('done')
    if (result.kind !== 'done') throw new Error(JSON.stringify(result))
    expect(Buffer.from(result.value.bytes)).toEqual(bytes)
    expect(result.value.object).toEqual(input.named)
    expect(result.value.eof).toBe(true)
    expect(await files.close({ ...input, handle: result.value.handle })).toEqual({
      kind: 'done',
      requestId: input.requestId,
      value: { handle: result.value.handle },
    })
    expect(
      (await engine.facilityFor('other').close({ ...input, handle: result.value.handle })).kind,
    ).toBe('unknown')
    const metadata = await files.stat(input)
    expect(metadata.kind).toBe('done')
    if (metadata.kind === 'done') {
      expect(metadata.value).not.toHaveProperty('name')
      expect(metadata.value.sizeBytes).toBe(bytes.length)
      expect(metadata.value.version).toBe(result.value.version)
    }
    expect(engine.openCount('owner')).toBe(0)
    engine.seal('owner')
    expect(await files.read(input)).toEqual({
      kind: 'rejected',
      requestId: input.requestId,
      reason: 'closed',
    })
  })
}, 30_000)

it('snapshots requests and keeps the original root identity across owners', async () => {
  await withFiles(async ({ files, root, bytes, input, engine }) => {
    const mutable = { ...input, named: { token: input.named?.token ?? '' } }
    const pending = files.read(mutable)
    mutable.named.token = 'changed'
    mutable.path = root + '/missing'
    const read = await pending
    expect(read.kind).toBe('done')
    if (read.kind === 'done') expect(Buffer.from(read.value.bytes)).toEqual(bytes)
    const moved = root + '-original'
    await rename(root, moved)
    try {
      await mkdir(root)
      await writeFile(join(root, '中文.txt'), 'replacement')
      expect(await engine.facilityFor('new-owner').read(input)).toEqual({
        kind: 'rejected',
        requestId: input.requestId,
        reason: 'notAuthorized',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rename(moved, root)
    }
  })
}, 30_000)

it('distinguishes a missing object from unavailable platform prerequisites', async () => {
  await withFiles(async ({ root }) => {
    const files = createHostFilesEngine().facilityFor('unrooted')
    const input = request(join(root, 'missing'), { token: 'unknown' })
    expect(await files.list(input)).toEqual({ kind: 'unresolved', requestId: input.requestId })
    expect(
      await files.search({ ...input, pattern: Buffer.from('a'), match: 'name', recursive: false }),
    ).toEqual({ kind: 'rejected', requestId: input.requestId, reason: 'notFound' })
    expect(
      await files.remove({ ...input, path: join(root, 'missing', 'child'), recursive: false }),
    ).toEqual({ kind: 'rejected', requestId: input.requestId, reason: 'notFound' })
  })
})

it('lists actual names in byte order and searches byte offsets within budgets', async () => {
  await withFiles(async ({ files, root, input }) => {
    await writeFile(join(root, 'a.txt'), 'abc')
    const directory = request(root, await hostObjectToken(root))
    const listing = await files.list({ ...directory, limit: 1 })
    expect(listing.kind).toBe('done')
    if (listing.kind === 'done') {
      expect(listing.value.entries.map(entry => entry.name)).toEqual(['a.txt'])
      expect(listing.value.nextOffset).toBe(1)
    }
    const next = await files.list({ ...directory, offset: 1 })
    expect(next.kind).toBe('done')
    if (next.kind === 'done')
      expect(next.value.entries.map(entry => entry.name)).toEqual(['中文.txt'])
    const search = await files.search({
      ...directory,
      pattern: Buffer.from('末行'),
      match: 'content',
      recursive: true,
    })
    expect(search.kind).toBe('done')
    if (search.kind === 'done')
      expect(search.value.hits).toEqual([
        {
          path: root + '/中文.txt',
          object: input.named,
          offsetBytes: Buffer.byteLength('中文\r\n'),
        },
      ])
    expect(await files.list(input)).toEqual({
      kind: 'rejected',
      requestId: input.requestId,
      reason: 'unsupported',
    })
  })
  await withFiles(
    async ({ files, root }) => {
      const search = await files.search({
        ...request(root, await hostObjectToken(root)),
        pattern: Buffer.from('末行'),
        match: 'content',
        recursive: true,
      })
      expect(search.kind).toBe('done')
      if (search.kind === 'done') {
        expect(search.value.hits).toEqual([])
        expect(search.value.truncated).toBe(true)
      }
    },
    { searchFileBytes: 1 },
  )
}, 30_000)

it('refuses wrong identity, traversal, junctions and hardlinked content without changing sentinels', async () => {
  await withFiles(async ({ files, root, path, input }) => {
    expect(await files.read({ ...input, named: { token: 'wrong' } })).toEqual({
      kind: 'rejected',
      requestId: input.requestId,
      reason: 'conflict',
    })
    expect(await files.read({ ...input, path: join(root, '..', 'outside') })).toEqual({
      kind: 'rejected',
      requestId: input.requestId,
      reason: 'notAuthorized',
    })
    const sibling = join(root, 'outside')
    await mkdir(sibling)
    await writeFile(join(sibling, 'sentinel'), 'unchanged')
    const junction = join(root, 'junction')
    await symlink(sibling, junction, 'junction')
    expect(
      await files.read(
        request(join(junction, 'sentinel'), await hostObjectToken(join(sibling, 'sentinel'))),
      ),
    ).toEqual({ kind: 'rejected', requestId: input.requestId, reason: 'notAuthorized' })
    await link(path, join(root, 'alias'))
    expect(await files.read(input)).toEqual({
      kind: 'rejected',
      requestId: input.requestId,
      reason: 'notAuthorized',
    })
    expect(await readFile(join(sibling, 'sentinel'), 'utf8')).toBe('unchanged')
  })
}, 30_000)
