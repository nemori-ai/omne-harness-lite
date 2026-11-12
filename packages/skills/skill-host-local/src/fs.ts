// The file system seam of the directory source. The source reads the file system only through a
// `DirectoryFs`, so a test can inject one that fails the way a real system would (for example
// EACCES, which a root process cannot provoke with chmod). The seam only does the input and
// output: it gives names and paths as the bytes that the file system stores, and it reports
// what kind of object it opened. `walk.ts` decides what each answer and each refusal means.
import { constants, lstat, open, readdir, realpath } from 'node:fs/promises'

/** What `lstat` tells: the kind of one file system object, without following a final link. */
export type EntryKind = Readonly<{
  isFile(): boolean
  isDirectory(): boolean
}>

/** What opening a path gave: the bytes of a regular file, or the kind of another object. */
export type Opened =
  | Readonly<{ kind: 'file'; bytes: Uint8Array }>
  | Readonly<{ kind: 'directory' | 'other' }>

/**
 * The four reads that the directory source makes. Each one rejects with an error that has a string
 * `code` (`ENOENT`, `EACCES`, `ELOOP`, ...) when the file system refuses. An error without a
 * string `code` is not a file system answer: the source throws it on to its caller.
 */
export type DirectoryFs = Readonly<{
  /** The names in a directory, as the bytes that the file system stores. */
  readdir(path: string): Promise<readonly Uint8Array[]>
  /** The kind of the object at `path`; a final link is not followed. */
  lstat(path: string): Promise<EntryKind>
  /** The absolute path with every link resolved, as bytes. */
  realpath(path: string): Promise<Uint8Array>
  /**
   * Opens `path` for reading without following a final link (a link there rejects with `ELOOP`)
   * and without waiting for a writer. It gives the bytes when the opened object is a regular file,
   * and only the kind otherwise.
   */
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

/** The seam over `node:fs/promises`. */
export function nodeFs(): DirectoryFs {
  return {
    readdir: path => readdir(path, { encoding: 'buffer' }),
    lstat: path => lstat(path),
    realpath: path => realpath(path, { encoding: 'buffer' }),
    readFile: openRegular,
  }
}
