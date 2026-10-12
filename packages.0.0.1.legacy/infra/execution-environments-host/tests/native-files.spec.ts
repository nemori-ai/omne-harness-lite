// @module-tag slow
// Real host byte operations and original batch publication cuts.
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  planHostFileBatch,
  prepareHostFileBatch,
  publishHostFileBatch,
  recognizeHostFileBatch,
  clearHostBatchStages,
} from '../src/file-batch.ts'
import { readHostFile, listHostFiles, searchHostFiles } from '../src/file-query.ts'
import { defaultHostNativePolicy as policy } from '../src/native-policy.ts'
import { hostProviderFixture } from './host-provider-fixture.ts'
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'omne-native-files-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
const bytes = (value: string) => new TextEncoder().encode(value)

test(
  'durable provider supplies every file method with real bytes and original receipts',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture()
    try {
      const { lease } = await host.acquire('files-full'),
        files = lease.facilities.files!
      const directory = join(root, 'nested'),
        source = join(directory, 'a'),
        copied = join(directory, 'b'),
        moved = join(directory, 'c')
      expect(await files.mkdir({ path: directory, parents: false })).toEqual({
        kind: 'created',
        path: directory,
      })
      const written = await files.write({
        path: source,
        mode: 'create',
        data: bytes('hello 中文\n'),
      })
      expect(written.kind).toBe('written')
      const read = await files.read({ path: source, offsetBytes: 6, limitBytes: 6 })
      expect(read).toMatchObject({ kind: 'read', offsetBytes: 6, nextOffsetBytes: 12, eof: false })
      if (read.kind === 'read') expect(new TextDecoder().decode(read.data)).toBe('中文')
      const info = await files.stat(source)
      expect(info).toMatchObject({ kind: 'stat', value: { type: 'file', sizeBytes: 13 } })
      expect(
        await files.write({
          path: source,
          mode: 'replace',
          expectedVersion: 'stale',
          data: bytes('wrong'),
        }),
      ).toMatchObject({ kind: 'rejected', reason: 'conflict' })
      expect(await readFile(source, 'utf8')).toBe('hello 中文\n')
      expect(await files.copy({ source, target: copied, replace: false })).toEqual({
        kind: 'copied',
        source,
        target: copied,
      })
      expect(await files.move({ source: copied, target: moved, replace: false })).toEqual({
        kind: 'moved',
        source: copied,
        target: moved,
      })
      expect(await files.list({ path: directory, limit: 1 })).toMatchObject({
        kind: 'listed',
        nextOffset: 1,
      })
      expect(
        await files.search({ path: directory, pattern: '中文', match: 'content', recursive: true }),
      ).toMatchObject({
        kind: 'found',
        truncated: false,
        values: [
          { path: source, offsetBytes: 6 },
          { path: moved, offsetBytes: 6 },
        ],
      })
      expect(await files.remove({ path: moved, recursive: false })).toEqual({
        kind: 'removed',
        path: moved,
      })
      expect(await files.remove({ path: directory, recursive: true })).toEqual({
        kind: 'removed',
        path: directory,
      })
      expect((await lease.release()).kind).toBe('released')
      expect(host.events.filter(event => event.kind === 'planned')).toHaveLength(7)
      expect(host.events.filter(event => event.kind === 'confirmed')).toHaveLength(7)
    } finally {
      await host.close()
    }
  },
)

test(
  'whole-batch rejection changes no target and overlapping paths fail before stage allocation',
  { tags: ['slow'] },
  async () => {
    const path = join(root, 'exists')
    await writeFile(path, 'before')
    const entries = [
      { path: join(root, 'new'), data: bytes('new'), expectedVersion: null },
      { path, data: bytes('wrong'), expectedVersion: 'stale' },
    ]
    const manifest = planHostFileBatch(entries)
    expect(await prepareHostFileBatch(manifest, entries, policy)).toMatchObject({
      kind: 'rejected',
      reason: 'conflict',
    })
    expect(await readdir(root)).toEqual(['exists'])
    expect(await readFile(path, 'utf8')).toBe('before')
    expect(() =>
      planHostFileBatch([
        { path: join(root, 'a'), data: bytes('a'), expectedVersion: null },
        { path: join(root, 'a', 'b'), data: bytes('b'), expectedVersion: null },
      ]),
    ).toThrow()
  },
)

test(
  'lost publication receipt remains unknown; recognition is read-only and preserves external new writes',
  { tags: ['slow'] },
  async () => {
    const path = join(root, 'target'),
      entries = [{ path, data: bytes('prepared'), expectedVersion: null }],
      manifest = planHostFileBatch(entries)
    expect((await prepareHostFileBatch(manifest, entries, policy)).kind).toBe('prepared')
    const published = await publishHostFileBatch(manifest, policy, {
      open: () => true,
      record: async () => 'unavailable',
    })
    expect(published).toEqual({ kind: 'unknown', reason: 'unavailable', published: [] })
    expect(await readFile(path, 'utf8')).toBe('prepared')
    expect(
      await recognizeHostFileBatch(manifest, { published: [], complete: false }, policy),
    ).toMatchObject({ state: 'partial', matchingPrepared: [path] })
    await writeFile(path, 'external')
    expect(
      await recognizeHostFileBatch(manifest, { published: [], complete: false }, policy),
    ).toMatchObject({ state: 'conflict', conflicting: [path] })
    expect(await readFile(path, 'utf8')).toBe('external')
  },
)

test(
  'stage cleanup refuses a different file and path policy rejects symlinks without reading targets',
  { tags: ['slow'] },
  async () => {
    const path = join(root, 'target'),
      entries = [{ path, data: bytes('prepared'), expectedVersion: null }],
      manifest = planHostFileBatch(entries)
    await prepareHostFileBatch(manifest, entries, policy)
    await writeFile(manifest.targets[0]!.stage, 'replacement')
    expect(await clearHostBatchStages(manifest, policy)).toBe('pending')
    expect(await readFile(manifest.targets[0]!.stage, 'utf8')).toBe('replacement')
    await writeFile(path, 'secret')
    await symlink(path, join(root, 'link'))
    expect(await readHostFile({ path: join(root, 'link') }, policy)).toMatchObject({
      kind: 'rejected',
      reason: 'unsupported',
    })
  },
)

test(
  'directory budget is enforced during enumeration and content search reports a bounded prefix',
  { tags: ['slow'] },
  async () => {
    for (const name of ['a', 'b', 'c']) await writeFile(join(root, name), '123456789')
    expect(await listHostFiles({ path: root }, { ...policy, searchNodes: 2 })).toMatchObject({
      kind: 'rejected',
      reason: 'capacity',
    })
    expect(
      await searchHostFiles(
        { path: root, pattern: '9', match: 'content', recursive: true },
        { ...policy, fileReadBytes: 4 },
      ),
    ).toMatchObject({ kind: 'found', values: [], truncated: true })
  },
)

test(
  'content search uses literal UTF-8 bytes even when the source contains malformed text',
  { tags: ['slow'] },
  async () => {
    const path = join(root, 'binary')
    await writeFile(path, Buffer.concat([Buffer.from([255, 0]), Buffer.from('中文')]))
    expect(
      await searchHostFiles(
        { path: root, pattern: '中文', match: 'content', recursive: true },
        policy,
      ),
    ).toMatchObject({ kind: 'found', values: [{ path, offsetBytes: 2 }], truncated: false })
  },
)

test(
  'durable batch recovery remains readable after publication and stage cleanup, without cross-scope disclosure',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture()
    try {
      const { lease } = await host.acquire('batch-query'),
        files = lease.facilities.files!,
        path = join(root, 'durable')
      const result = await files.commitBatch({
        entries: [{ path, data: bytes('confirmed'), expectedVersion: null }],
      })
      if (result.kind !== 'committed') throw new Error(`Batch not committed ${result.kind}`)
      expect(await readdir(root)).toEqual(['durable'])
      expect(await files.recoverBatch(result.batch)).toMatchObject({
        kind: 'recognized',
        state: 'complete',
        published: [path],
        matchingPrepared: [path],
      })
      expect(await files.recoverBatch({ ...result.batch, generation: 'foreign' })).toMatchObject({
        kind: 'rejected',
        reason: 'notFound',
      })
      await writeFile(path, 'external-new-value')
      expect(await files.recoverBatch(result.batch)).toMatchObject({
        state: 'conflict',
        conflicting: [path],
      })
      expect(await readFile(path, 'utf8')).toBe('external-new-value')
      expect((await lease.release()).kind).toBe('released')
    } finally {
      await host.close()
    }
  },
)

test(
  'an original owned partial stage can be disposed, but replacement inode is preserved',
  { tags: ['slow'] },
  async () => {
    const path = join(root, 'target'),
      entries = [{ path, data: bytes('whole'), expectedVersion: null }],
      manifest = planHostFileBatch(entries)
    const owners: import('../src/file-batch.ts').HostStageOwnership[] = []
    await prepareHostFileBatch(manifest, entries, policy, async owner => {
      owners.push(owner)
      return 'unavailable'
    })
    expect(await clearHostBatchStages(manifest, policy, owners)).toBe('cleared')
    expect(await readdir(root)).toEqual([])
    await prepareHostFileBatch(manifest, entries, policy, async owner => {
      owners.push(owner)
      return 'recorded'
    })
    await rm(manifest.targets[0]!.stage)
    await writeFile(manifest.targets[0]!.stage, 'external-replacement')
    expect(await clearHostBatchStages(manifest, policy, owners)).toBe('pending')
    expect(await readFile(manifest.targets[0]!.stage, 'utf8')).toBe('external-replacement')
  },
)

test(
  'lease release closes already queued batch publication and retains the original pending work',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture({ ...policy, stopDeadlineMs: 40 })
    const entered = Promise.withResolvers<void>(),
      permission = Promise.withResolvers<'confirmed'>()
    try {
      const { lease } = await host.acquire('file-close-cut', true, host.scope, {
        permit: async () => {
          entered.resolve()
          return permission.promise
        },
      })
      const files = lease.facilities.files!,
        first = join(root, 'a'),
        second = join(root, 'b')
      const one = files.commitBatch({
        entries: [{ path: first, data: bytes('first'), expectedVersion: null }],
      })
      await entered.promise
      const two = files.commitBatch({
        entries: [{ path: second, data: bytes('second'), expectedVersion: null }],
      })
      expect(await lease.release()).toMatchObject({ kind: 'pending' })
      permission.resolve('confirmed')
      expect((await one).kind).toBe('unknown')
      expect(await two).toMatchObject({ kind: 'rejected', reason: 'closed' })
      expect(await readdir(root)).toEqual([])
      expect(await lease.release()).toEqual({ kind: 'released' })
      expect(await files.read({ path: first })).toMatchObject({
        kind: 'rejected',
        reason: 'closed',
      })
    } finally {
      permission.resolve('confirmed')
      await host.close()
    }
  },
)

test(
  'raw copy returns complete staged output and a same-byte replacement stage is never owned',
  { tags: ['slow'] },
  async () => {
    const { copyHostFile, mkdirHostPath, removeHostPath } = await import('../src/file-mutation.ts')
    const source = join(root, 'source'),
      target = join(root, 'target')
    await writeFile(source, 'source-bytes')
    expect(await copyHostFile({ source, target, replace: false }, policy)).toEqual({
      kind: 'copied',
      source,
      target,
    })
    expect(await readFile(target, 'utf8')).toBe('source-bytes')
    expect(await copyHostFile({ source, target, replace: false }, policy)).toMatchObject({
      kind: 'rejected',
      reason: 'conflict',
    })
    const entries = [{ path: join(root, 'batch'), data: bytes('same'), expectedVersion: null }],
      manifest = planHostFileBatch(entries)
    const prepared = await prepareHostFileBatch(manifest, entries, policy)
    if (prepared.kind !== 'prepared') throw new Error('Expected prepared stage')
    await rm(manifest.targets[0]!.stage)
    await writeFile(manifest.targets[0]!.stage, 'same')
    expect(await clearHostBatchStages(manifest, policy, prepared.stages)).toBe('pending')
    expect(await readFile(manifest.targets[0]!.stage, 'utf8')).toBe('same')
    const nested = join(root, 'one', 'two')
    expect(await mkdirHostPath({ path: nested, parents: true }, policy)).toEqual({
      kind: 'created',
      path: nested,
    })
    expect(await mkdirHostPath({ path: source, parents: true }, policy)).toMatchObject({
      kind: 'rejected',
      reason: 'conflict',
    })
    expect(
      await removeHostPath({ path: join(root, 'absent'), recursive: false }, policy),
    ).toMatchObject({ kind: 'rejected', reason: 'notFound' })
  },
)
