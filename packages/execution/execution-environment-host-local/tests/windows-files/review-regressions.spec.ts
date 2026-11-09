import { readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import * as windows from '../../src/windows-files/facility.ts'
import { request, withFiles } from './fixture.ts'

/** A marker no request frame carries: JSON escapes the NUL character. */
const noFrame = '\u0000'
/** Holds the request frame that carries `marker` before the files helper reads it. */
const hold = vi.hoisted(() => ({
  marker: '\u0000',
  entered: () => {},
  released: () => Promise.resolve(),
}))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { holdNativeInput } = await import('./native-control.ts')
  return {
    ...actual,
    spawn(...args: Parameters<typeof actual.spawn>) {
      const child = actual.spawn(...args)
      holdNativeInput(child, {
        get marker() {
          return hold.marker
        },
        entered: () => hold.entered(),
        released: () => hold.released(),
      })
      return child
    },
  }
})

beforeEach(context => context.skip(process.platform !== 'win32'))
afterEach(() => {
  vi.restoreAllMocks()
  hold.marker = noFrame
})

it.each(['/', '\\'])(
  'refuses trailing separator %s without creating or replacing a file',
  async separator => {
    await withFiles(async ({ files, root, input, path, bytes }) => {
      const created = request(join(root, 'new.txt') + separator, await hostObjectToken(root))
      expect(await files.write({ ...created, bytes, mode: 'create' })).toMatchObject({
        kind: 'rejected',
        reason: 'invalidInput',
      })
      expect(
        await files.write({
          ...input,
          path: path + separator,
          bytes: Buffer.from('changed'),
          mode: 'replace',
        }),
      ).toMatchObject({
        kind: 'unresolved',
      })
      expect(await readFile(path)).toEqual(bytes)
      expect(await hostObjectToken(path)).toEqual(input.named)
      expect(await readdir(root)).toEqual(['中文.txt'])
    })
  },
  30_000,
)

it.each(['write', 'remove', 'move'] as const)(
  'rejects an explicitly empty version for %s without changing either name',
  async operation => {
    await withFiles(async ({ files, root, path, input, bytes }) => {
      const target = { path: join(root, 'destination.txt'), named: await hostObjectToken(root) }
      const conditional = { ...input, expectedVersion: '' }
      const result =
        operation === 'write'
          ? await files.write({ ...conditional, mode: 'replace', bytes: Buffer.from('changed') })
          : operation === 'remove'
            ? await files.remove({ ...conditional, recursive: false })
            : await files.move({ ...conditional, target, replace: false })
      expect(result).toMatchObject({ kind: 'rejected', reason: 'conflict' })
      expect(await readFile(path)).toEqual(bytes)
      expect(await readdir(root)).toEqual(['中文.txt'])
      expect(await hostObjectToken(path)).toEqual(input.named)
    })
  },
  30_000,
)

it('stops publication when the owner seals during the final target stat', async () => {
  await withFiles(async ({ root, path, input, bytes }) => {
    const reached = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const create = windows.createWindowsFiles
    const move = vi.fn<ReturnType<typeof create>['move']>()
    vi.spyOn(windows, 'createWindowsFiles').mockImplementation(options => {
      const files = create(options)
      const stat = files.stat
      let targetStats = 0
      files.stat = async current => {
        const result = await stat(current)
        if (current.path === path && ++targetStats === 2) {
          reached.resolve()
          await resume.promise
        }
        return result
      }
      move.mockImplementation(files.move)
      files.move = move
      return files
    })
    const engine = createHostFilesEngine({ root, stateDirectory: join(root, 'state') })
    const files = engine.facilityFor('batch-owner')
    const initial = await createHostFilesEngine({ root }).facilityFor('observer').stat(input)
    if (initial.kind !== 'done') throw new Error('initial stat')
    const pending = files.commitBatch({
      ...input,
      entries: [
        {
          path,
          named: input.named,
          bytes: Buffer.from('changed'),
          expectedVersion: initial.value.version,
        },
      ],
    })
    await reached.promise
    engine.seal('batch-owner')
    resume.resolve()
    expect(await pending).toMatchObject({
      kind: 'done',
      value: { kind: 'unknown', reason: 'closed', published: [] },
    })
    expect(move).not.toHaveBeenCalled()
    expect(await readFile(path)).toEqual(bytes)
    expect((await readdir(root)).filter(name => name.startsWith('.omne-'))).toEqual([])
  })
}, 30_000)

it.each([true, false])(
  'rejects create with a missing parent (rooted=%s)',
  async rooted => {
    await withFiles(async ({ root, bytes }) => {
      const files = createHostFilesEngine(rooted ? { root } : {}).facilityFor('creator')
      const missing = request(join(root, 'missing-parent', 'new.txt'), await hostObjectToken(root))
      expect(await files.write({ ...missing, mode: 'create', bytes })).toMatchObject({
        kind: 'rejected',
        reason: 'notFound',
      })
      expect(await readdir(root)).toEqual(['中文.txt'])
    })
  },
  30_000,
)

it.each(['source', 'target-parent'] as const)(
  'rejects copy with a missing %s',
  async missing => {
    await withFiles(async ({ files, root, input, path, bytes }) => {
      const parent = await hostObjectToken(root)
      const source = missing === 'source' ? request(join(root, 'absent.txt'), parent) : input
      const target = {
        path: join(root, ...(missing === 'source' ? ['copy.txt'] : ['missing-parent', 'copy.txt'])),
        named: parent,
      }
      expect(await files.copy({ ...source, target, replace: false })).toMatchObject({
        kind: 'rejected',
        reason: 'notFound',
      })
      expect(await readFile(path)).toEqual(bytes)
      expect(await readdir(root)).toEqual(['中文.txt'])
    })
  },
  30_000,
)

it('rejects copy when its existing target disappears before replacement', async () => {
  await withFiles(async ({ root, path, input, bytes }) => {
    const targetPath = join(root, 'copy.txt')
    await writeFile(targetPath, 'original target')
    const target = { path: targetPath, named: await hostObjectToken(targetPath) }
    const files = createHostFilesEngine({ root }).facilityFor('copier')
    // The copy is staged; its publication waits until the target is gone.
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    Object.assign(hold, {
      marker: '"operation":"publish"',
      entered: () => entered.resolve(),
      released: () => released.promise,
    })
    const copied = files.copy({ ...input, target, replace: true })
    await entered.promise
    await unlink(targetPath)
    released.resolve()
    expect(await copied).toMatchObject({
      kind: 'rejected',
      reason: 'notFound',
    })
    expect(await readFile(path)).toEqual(bytes)
    expect(await readdir(root)).toEqual(['中文.txt'])
  })
}, 30_000)

it.each(['replace', 'create'] as const)(
  'rejects batch %s when the required object is missing',
  async mode => {
    await withFiles(async ({ root, input, path, bytes }) => {
      const files = createHostFilesEngine({
        root,
        stateDirectory: join(root, 'state'),
      }).facilityFor('batch')
      const absent = join(
        root,
        ...(mode === 'replace' ? ['absent.txt'] : ['missing-parent', 'new.txt']),
      )
      expect(
        await files.commitBatch({
          ...input,
          entries: [
            {
              path: absent,
              named: await hostObjectToken(root),
              bytes,
              expectedVersion: mode === 'create' ? null : 'expected',
            },
          ],
        }),
      ).toMatchObject({ kind: 'rejected', reason: 'notFound' })
      expect(await readFile(path)).toEqual(bytes)
      expect(await readdir(root)).toEqual(['中文.txt'])
    })
  },
  30_000,
)

it('preserves unresolved for read, stat, list and replacement of an absent object', async () => {
  await withFiles(async ({ files, root, bytes }) => {
    const absent = request(join(root, 'absent.txt'), await hostObjectToken(root))
    expect(await files.read(absent)).toMatchObject({ kind: 'unresolved' })
    expect(await files.stat(absent)).toMatchObject({ kind: 'unresolved' })
    expect(await files.list(absent)).toMatchObject({ kind: 'unresolved' })
    expect(await files.write({ ...absent, mode: 'replace', bytes })).toMatchObject({
      kind: 'unresolved',
    })
  })
}, 30_000)
