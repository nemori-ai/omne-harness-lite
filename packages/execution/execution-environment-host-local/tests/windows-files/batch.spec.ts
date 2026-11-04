import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import * as manifests from '../../src/host-file-batch.ts'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))
it('copies bytes, preflights every batch entry and recognizes durable receipts without replay', async () => {
  await withFiles(async ({ root, path, bytes, input }) => {
    const stateDirectory = join(root, 'state')
    const files = createHostFilesEngine({ root, stateDirectory }).facilityFor('batch')
    const target = { path: join(root, 'copy.txt'), named: await hostObjectToken(root) }
    expect(await files.copy({ ...input, target, replace: false })).toMatchObject({ kind: 'done' })
    expect(await readFile(target.path)).toEqual(bytes)
    const stat = await files.stat(input)
    if (stat.kind !== 'done') throw new Error('stat')
    const first = {
      path,
      named: input.named,
      bytes: Buffer.from('批次\r\n末行'),
      expectedVersion: stat.value.version,
    }
    const second = {
      path: join(root, 'new.txt'),
      named: await hostObjectToken(root),
      bytes,
      expectedVersion: null,
    }
    expect(
      await files.commitBatch({
        ...input,
        entries: [first, { ...second, named: { token: 'wrong' } }],
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'conflict' })
    expect(await readFile(path)).toEqual(bytes)
    const result = await files.commitBatch({ ...input, entries: [first, second] })
    expect(result).toMatchObject({
      kind: 'done',
      value: { kind: 'committed', published: [path, second.path] },
    })
    if (result.kind !== 'done') throw new Error('batch')
    const cold = createHostFilesEngine({ root, stateDirectory }).facilityFor('cold')
    expect(
      await cold.recoverBatch({ ...request(path, null), batch: result.value.batch }),
    ).toMatchObject({ kind: 'done', value: { state: 'complete', published: [path, second.path] } })
    expect(await readFile(path)).toEqual(first.bytes)
    expect((await readdir(root)).filter(name => name.startsWith('.omne-'))).toEqual([])
  })
}, 60_000)

it('recognizes an uncertain publication without replaying it or overwriting a later writer', async () => {
  await withFiles(async ({ root, path, input }) => {
    const stateDirectory = join(root, 'state')
    const files = createHostFilesEngine({ root, stateDirectory }).facilityFor('batch')
    const stat = await files.stat(input)
    if (stat.kind !== 'done') throw new Error('stat')
    const original = manifests.writeManifest
    let calls = 0
    const spy = vi.spyOn(manifests, 'writeManifest').mockImplementation(async (...args) => {
      if (++calls === 3) throw new Error('receipt persistence failed')
      await original(...args)
    })
    const result = await files.commitBatch({
      ...input,
      entries: [
        {
          path,
          named: input.named,
          bytes: Buffer.from('prepared'),
          expectedVersion: stat.value.version,
        },
      ],
    })
    spy.mockRestore()
    expect(result).toMatchObject({
      kind: 'done',
      value: { kind: 'unknown', reason: 'effectUnknown', published: [] },
    })
    if (result.kind !== 'done') throw new Error('batch')
    const cold = createHostFilesEngine({ root, stateDirectory }).facilityFor('cold')
    expect(await cold.recoverBatch({ ...input, batch: result.value.batch })).toMatchObject({
      kind: 'done',
      value: { state: 'interrupted', matchingPrepared: [path], published: [] },
    })
    await writeFile(path, 'external later writer')
    expect(await cold.recoverBatch({ ...input, batch: result.value.batch })).toMatchObject({
      kind: 'done',
      value: { conflicting: [path], matchingPrepared: [] },
    })
    expect(await readFile(path, 'utf8')).toBe('external later writer')
  })
}, 30_000)
