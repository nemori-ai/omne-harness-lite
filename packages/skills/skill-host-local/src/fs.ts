import { constants, lstat, open, readdir, realpath } from 'node:fs/promises'

export type EntryKind = Readonly<{
  isFile(): boolean
  isDirectory(): boolean
}>

export type Opened =
  | Readonly<{ kind: 'file'; bytes: Uint8Array }>
  | Readonly<{ kind: 'directory' | 'other' }>

// Each read rejects with an error that has a string `code` when the file system refuses. An error
// without a string `code` is not a file system answer: the source throws it on to its caller.
export type DirectoryFs = Readonly<{
  readdir(path: string): Promise<readonly Uint8Array[]>
  lstat(path: string): Promise<EntryKind>
  realpath(path: string): Promise<Uint8Array>
  readFile(path: string): Promise<Opened>
}>

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK

async function openRegular(path: string): Promise<Opened> {
  const handle = await open(path, READ_FLAGS)
  try {
    const stats = await handle.stat()
    if (stats.isDirectory()) return { kind: 'directory' }
    if (!stats.isFile()) return { kind: 'other' }
    const bytes = await handle.readFile()
    return { kind: 'file', bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
  } finally {
    await handle.close()
  }
}

export function nodeFs(): DirectoryFs {
  return {
    readdir: path => readdir(path, { encoding: 'buffer' }),
    lstat: path => lstat(path),
    realpath: path => realpath(path, { encoding: 'buffer' }),
    readFile: openRegular,
  }
}
