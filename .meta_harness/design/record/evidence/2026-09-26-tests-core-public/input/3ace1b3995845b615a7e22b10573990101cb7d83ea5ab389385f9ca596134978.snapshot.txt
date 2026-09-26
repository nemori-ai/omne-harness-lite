// 升级守卫的文件操作：删除、改名与内容都要「落盘之后才算」，目录项的变化以目录 fsync 落盘。
import { open, rm, stat } from 'node:fs/promises'

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  )
}

/** 让目录项（创建、删除、改名）落盘。Linux 上对目录 fsync 是这件事的唯一手段。 */
export async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** 让文件内容落盘。 */
export async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** 删一个文件；本来不在 ⇒ false；其余失败原样抛出。 */
export async function removeIfExists(path: string): Promise<boolean> {
  try {
    await rm(path)
    return true
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

/** 文件在不在；「不在」之外的失败原样抛出（看不清不当作「不在」）。 */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

/** 读文件开头至多 `length` 字节。 */
export async function readHead(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}
