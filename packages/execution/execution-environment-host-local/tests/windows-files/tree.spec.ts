import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))

it('creates directories, refuses overwrite and version conflicts, moves and removes by handle', async () => {
  await withFiles(async ({ files, root, path, bytes, input }) => {
    const folder = join(root, 'made', 'nested')
    const made = await files.mkdir({
      ...request(folder, await hostObjectToken(root)),
      parents: true,
    })
    expect(made.kind).toBe('done')
    const movedPath = join(folder, 'moved.txt')
    const target = { path: movedPath, named: await hostObjectToken(folder) }
    expect(
      await files.move({ ...input, target, replace: false, expectedVersion: 'wrong' }),
    ).toEqual({ kind: 'rejected', requestId: input.requestId, reason: 'conflict' })
    await writeFile(movedPath, 'sentinel')
    expect(
      await files.move({
        ...input,
        target: { path: movedPath, named: await hostObjectToken(movedPath) },
        replace: false,
      }),
    ).toEqual({ kind: 'rejected', requestId: input.requestId, reason: 'conflict' })
    expect(await readFile(movedPath, 'utf8')).toBe('sentinel')
    const moved = await files.move({
      ...input,
      target: { path: movedPath, named: await hostObjectToken(movedPath) },
      replace: true,
    })
    expect(moved.kind).toBe('done')
    expect(await readFile(movedPath)).toEqual(bytes)
    const movedBack = await files.move({
      ...input,
      path: movedPath,
      target: { path, named: await hostObjectToken(root) },
      replace: false,
    })
    expect(movedBack.kind).toBe('done')
    expect(
      (
        await files.remove({
          ...request(join(root, 'made'), await hostObjectToken(join(root, 'made'))),
          recursive: true,
        })
      ).kind,
    ).toBe('done')
    expect(await readFile(path)).toEqual(bytes)
  })
}, 30_000)
