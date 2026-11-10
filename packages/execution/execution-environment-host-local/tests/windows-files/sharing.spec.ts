// Delete, rename and replacement against objects that another process holds open. A handle opened
// by Node allows reading, writing and deleting; libuv's `UV_FS_O_EXLOCK` opens it without sharing.
import { constants } from 'node:fs'
import { mkdir, open, readFile, readdir, writeFile, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))

/** libuv's `UV_FS_O_EXLOCK`: Node accepts it on Windows but does not export it in `fs.constants`. */
const exclusiveLock = 0x1000_0000
const exclusive = (path: string) => open(path, constants.O_RDONLY | exclusiveLock)

async function holding<T>(handle: Promise<FileHandle>, run: () => Promise<T>): Promise<T> {
  const held = await handle
  try {
    return await run()
  } finally {
    await held.close()
  }
}

async function oldBytes(handle: FileHandle, length: number): Promise<Buffer> {
  const { buffer, bytesRead } = await handle.read(Buffer.alloc(length), 0, length, 0)
  return buffer.subarray(0, bytesRead)
}

it('removes a file another process holds with delete sharing: the name goes at once, the holder still reads', async () => {
  await withFiles(async ({ files, root, path, bytes, input }) => {
    const holder = await open(path, 'r')
    try {
      expect(await files.remove({ ...input, recursive: false })).toMatchObject({ kind: 'done' })
      expect(await readdir(root)).toEqual([])
      expect(await oldBytes(holder, bytes.length)).toEqual(bytes)
    } finally {
      await holder.close()
    }
  })
}, 30_000)

it('replaces a file another process holds with delete sharing, by write and by move', async () => {
  await withFiles(async ({ files, root, path, bytes, input }) => {
    const holder = await open(path, 'r')
    try {
      const written = await files.write({ ...input, mode: 'replace', bytes: Buffer.from('new') })
      expect(written).toMatchObject({ kind: 'done', value: { writeEffect: 'replaced' } })
      expect(await readFile(path, 'utf8')).toBe('new')
      expect(await oldBytes(holder, bytes.length)).toEqual(bytes)
    } finally {
      await holder.close()
    }
    const source = join(root, 'source.txt')
    await writeFile(source, 'moved')
    const second = await open(path, 'r')
    try {
      const moved = await files.move({
        ...request(source, await hostObjectToken(source)),
        target: { path, named: await hostObjectToken(path) },
        replace: true,
      })
      expect(moved).toMatchObject({ kind: 'done' })
      expect(await readFile(path, 'utf8')).toBe('moved')
      expect(await oldBytes(second, 3)).toEqual(Buffer.from('new'))
    } finally {
      await second.close()
    }
    expect(await readdir(root)).toEqual(['中文.txt'])
  })
}, 30_000)

it('answers busy for remove, replacement and move of a file held without sharing, and changes nothing', async () => {
  await withFiles(async ({ files, root, path, bytes, input }) => {
    const target = { path: join(root, 'moved.txt'), named: await hostObjectToken(root) }
    await holding(exclusive(path), async () => {
      expect(await files.remove({ ...input, recursive: false })).toMatchObject({
        kind: 'rejected',
        reason: 'busy',
      })
      expect(
        await files.write({ ...input, mode: 'replace', bytes: Buffer.from('changed') }),
      ).toMatchObject({ kind: 'rejected', reason: 'busy' })
      expect(await files.move({ ...input, target, replace: false })).toMatchObject({
        kind: 'rejected',
        reason: 'busy',
      })
    })
    expect(await readFile(path)).toEqual(bytes)
    expect(await readdir(root)).toEqual(['中文.txt'])
    expect(await hostObjectToken(path)).toEqual(input.named)
  })
}, 30_000)

it('answers busy for a move of a directory whose subtree holds an open file', async () => {
  await withFiles(async ({ files, root }) => {
    const folder = join(root, 'folder')
    await mkdir(join(folder, 'inner'), { recursive: true })
    const inside = join(folder, 'inner', 'open.txt')
    await writeFile(inside, 'open')
    const named = await hostObjectToken(folder)
    const target = { path: join(root, 'renamed'), named: await hostObjectToken(root) }
    await holding(open(inside, 'r'), async () => {
      expect(await files.move({ ...request(folder, named), target, replace: false })).toMatchObject(
        { kind: 'rejected', reason: 'busy' },
      )
    })
    expect((await readdir(root)).sort()).toEqual(['folder', '中文.txt'])
    expect(await files.move({ ...request(folder, named), target, replace: false })).toMatchObject({
      kind: 'done',
    })
  })
}, 30_000)
