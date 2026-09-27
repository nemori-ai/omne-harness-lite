import { mkdir, open, readFile, rename, stat, unlink, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'

/** Internal IO seam: faults operate on the same real file handles as production. */
export class IoFailure extends Error {
  constructor(readonly stage: string) {
    super(`session log IO failed at ${stage}`)
  }
}
export function isIoFailure(error: unknown): boolean {
  return (
    error instanceof IoFailure ||
    (error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      (/^E[A-Z]+$/u.test(error.code) || error.code === 'ERR_SQLITE_ERROR'))
  )
}
export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
export interface RootIdentity {
  readonly dev: bigint
  readonly ino: bigint
}
export interface LogFile {
  readonly read: (offset: number, length: number) => Promise<Uint8Array>
  readonly write: (bytes: Uint8Array) => Promise<number>
  readonly size: () => Promise<number>
  readonly datasync: () => Promise<void>
  readonly sync: () => Promise<void>
  readonly truncate: (size: number) => Promise<void>
  readonly close: () => Promise<void>
}
function wrap(handle: FileHandle): LogFile {
  return {
    async read(offset, length) {
      const bytes = new Uint8Array(length)
      let done = 0
      while (done < length) {
        const read = await handle.read(bytes, done, length - done, offset + done)
        if (read.bytesRead === 0) throw new IoFailure('short-read')
        done += read.bytesRead
      }
      return bytes
    },
    async write(bytes) {
      return (await handle.write(bytes)).bytesWritten
    },
    async size() {
      const result = await handle.stat({ bigint: true })
      if (result.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new IoFailure('file-size')
      return Number(result.size)
    },
    datasync: () => handle.datasync(),
    sync: () => handle.sync(),
    truncate: size => handle.truncate(size),
    close: () => handle.close(),
  }
}
export interface FileIo {
  readonly mkdir: (dir: string) => Promise<string | undefined>
  readonly identity: (dir: string) => Promise<RootIdentity>
  readonly open: (path: string, flags: 'a+' | 'a-existing' | 'r' | 'w' | 'wx') => Promise<LogFile>
  readonly readFile: (path: string) => Promise<Uint8Array>
  readonly rename: (from: string, to: string) => Promise<void>
  readonly unlink: (path: string) => Promise<void>
  readonly readdir: (path: string) => Promise<string[]>
}
export const fileIo: FileIo = {
  mkdir: dir => mkdir(dir, { recursive: true }),
  async identity(dir) {
    const result = await stat(dir, { bigint: true })
    if (!result.isDirectory()) throw new IoFailure('root-type')
    return { dev: result.dev, ino: result.ino }
  },
  async open(path, flags) {
    return wrap(
      await open(path, flags === 'a-existing' ? constants.O_RDWR | constants.O_APPEND : flags),
    )
  },
  readFile,
  rename,
  unlink,
  readdir,
}
export async function syncDirectory(io: FileIo, dir: string): Promise<void> {
  const handle = await io.open(dir, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Every handle, including temporary index/directory handles, has the physical owner. */
export function trackFileIo(io: FileIo, live: Set<LogFile>): FileIo {
  return {
    ...io,
    async open(path, flags) {
      const actual = await io.open(path, flags)
      let closed = false
      const tracked: LogFile = {
        ...actual,
        async close() {
          if (closed) return
          await actual.close()
          closed = true
          live.delete(tracked)
        },
      }
      live.add(tracked)
      return tracked
    },
  }
}
