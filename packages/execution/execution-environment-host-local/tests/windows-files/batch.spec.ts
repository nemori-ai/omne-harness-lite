import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as manifests from '../../src/host-file-batch.ts'
import type { HostFileDiagnostic } from '../../src/host-file-batch.ts'
import * as windows from '../../src/windows-files/facility.ts'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))
afterEach(() => vi.restoreAllMocks())

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

/** The staged writes and removals of a batch, with failures put in for the entries named. */
function stagingFailures(failures: { write?: number; remove?: number }) {
  const create = windows.createWindowsFiles
  return vi.spyOn(windows, 'createWindowsFiles').mockImplementation(options => {
    const files = create(options)
    const write = files.write
    const remove = files.remove
    const staged = (path: string, index: number | undefined) =>
      index !== undefined && new RegExp(`\\.omne-batch-[0-9a-f-]{36}-${index}$`, 'u').test(path)
    files.write = async current =>
      staged(current.path, failures.write)
        ? { kind: 'rejected', requestId: current.requestId, reason: 'capacity' }
        : write(current)
    files.remove = async current =>
      staged(current.path, failures.remove)
        ? { kind: 'rejected', requestId: current.requestId, reason: 'busy' }
        : remove(current)
    return files
  })
}

async function manifestFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { recursive: true })).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
}

it('refuses a batch whose staging fails once every staged file is removed again', async () => {
  await withFiles(async ({ root, path, bytes, input }) => {
    stagingFailures({ write: 1 })
    const stateDirectory = join(root, 'state')
    const files = createHostFilesEngine({ root, stateDirectory }).facilityFor('batch')
    const parent = await hostObjectToken(root)
    const entries = ['one.txt', 'two.txt'].map(name => ({
      path: join(root, name),
      named: parent,
      bytes: Buffer.from(name),
      expectedVersion: null,
    }))
    expect(await files.commitBatch({ ...input, entries })).toMatchObject({
      kind: 'rejected',
      reason: 'capacity',
    })
    expect((await readdir(root)).sort()).toEqual(['state', '中文.txt'])
    expect(await manifestFiles(stateDirectory)).toEqual([])
    expect(await readFile(path)).toEqual(bytes)
  })
}, 30_000)

it('answers unknown and names the staged file that stays when staging fails and its removal fails', async () => {
  await withFiles(async ({ root, input }) => {
    stagingFailures({ write: 1, remove: 0 })
    const seen: HostFileDiagnostic[] = []
    const stateDirectory = join(root, 'state')
    const files = createHostFilesEngine({
      root,
      stateDirectory,
      diagnose: diagnostic => seen.push(diagnostic),
    }).facilityFor('batch')
    const parent = await hostObjectToken(root)
    const entries = ['one.txt', 'two.txt'].map(name => ({
      path: join(root, name),
      named: parent,
      bytes: Buffer.from(name),
      expectedVersion: null,
    }))
    expect(await files.commitBatch({ ...input, entries })).toEqual({
      kind: 'unknown',
      requestId: input.requestId,
    })
    const remaining = (await readdir(root)).filter(name => name.startsWith('.omne-batch-'))
    expect(remaining).toHaveLength(1)
    expect(seen).toEqual([
      {
        kind: 'temporaryFileRemains',
        batch: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        path: join(root, 'one.txt'),
        temporary: remaining[0],
        code: 'busy',
      },
    ])
    expect(remaining[0]).toBe(`.omne-batch-${seen[0]?.batch}-0`)
  })
}, 30_000)

it('lists a target that became a directory or a junction as conflicting, entry by entry', async () => {
  await withFiles(async ({ root, path, input }) => {
    const stateDirectory = join(root, 'state')
    const files = createHostFilesEngine({ root, stateDirectory }).facilityFor('batch')
    const other = join(root, 'other.txt')
    await writeFile(other, 'other')
    const versionOf = async (target: string) => {
      const found = await files.stat(request(target, await hostObjectToken(target)))
      if (found.kind !== 'done') throw new Error('stat')
      return found.value.version
    }
    const entries = [
      { path, named: input.named, bytes: Buffer.from('a'), expectedVersion: await versionOf(path) },
      {
        path: other,
        named: await hostObjectToken(other),
        bytes: Buffer.from('b'),
        expectedVersion: await versionOf(other),
      },
    ]
    const original = manifests.writeManifest
    let calls = 0
    const spy = vi.spyOn(manifests, 'writeManifest').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('publishing state not persisted')
      await original(...args)
    })
    const result = await files.commitBatch({ ...input, entries })
    spy.mockRestore()
    expect(result).toMatchObject({ kind: 'done', value: { kind: 'unknown', published: [] } })
    if (result.kind !== 'done') throw new Error('batch')
    await rm(path)
    await mkdir(path)
    const elsewhere = join(root, 'elsewhere')
    await mkdir(elsewhere)
    await rm(other)
    await symlink(elsewhere, other, 'junction')
    const cold = createHostFilesEngine({ root, stateDirectory }).facilityFor('cold')
    expect(await cold.recoverBatch({ ...input, batch: result.value.batch })).toMatchObject({
      kind: 'done',
      value: { matchingPrepared: [], conflicting: [path, other] },
    })
  })
}, 30_000)
