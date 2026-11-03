// The file system seam of the directory source. The source reads the file system only through a
// `DirectoryFs`, so a test can inject one that fails the way a real system would (for example
// EACCES, which a root process cannot provoke with chmod). Failures are classified by the `code`
// field of the thrown error, never by its message text.
import { constants, lstat, open, readdir, realpath } from 'node:fs/promises'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'

/** What `lstat` tells: the kind of one file system object, without following a final link. */
export type EntryKind = Readonly<{
  isFile(): boolean
  isDirectory(): boolean
}>

/** One name in a directory listing and its kind, as `readdir` with file types gives it. */
export type DirectoryEntry = EntryKind &
  Readonly<{
    name: string
    isSymbolicLink(): boolean
  }>

/**
 * The four reads that the directory source makes. Each one rejects with an error that has a string
 * `code` (`ENOENT`, `EACCES`, `ELOOP`, ...) when the file system refuses. An error without a
 * string `code` is not a file system answer: the source throws it on to its caller.
 */
export type DirectoryFs = Readonly<{
  /** The names in a directory, with their kinds. */
  readdir(path: string): Promise<readonly DirectoryEntry[]>
  /** The kind of the object at `path`; a final link is not followed. */
  lstat(path: string): Promise<EntryKind>
  /** The absolute path with every link resolved. */
  realpath(path: string): Promise<string>
  /** All bytes of the regular file at `path`. */
  readFile(path: string): Promise<Uint8Array>
}>

/**
 * Reads a regular file. It opens without blocking and checks the opened object, so a pipe that
 * replaced a file after the listing is refused with `EINVAL` instead of blocking the read forever.
 */
async function readRegularFile(path: string): Promise<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) {
      const code = stats.isDirectory() ? 'EISDIR' : 'EINVAL'
      throw Object.assign(new Error(`${code}: not a regular file: ${path}`), { code })
    }
    const bytes = await handle.readFile()
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  } finally {
    await handle.close()
  }
}

/** The seam over `node:fs/promises`. */
export function nodeFs(): DirectoryFs {
  return {
    readdir: path => readdir(path, { withFileTypes: true }),
    lstat: path => lstat(path),
    realpath: path => realpath(path),
    readFile: readRegularFile,
  }
}

/** The `code` of a file system error. Any other error is thrown again unchanged. */
function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string') return code
  }
  throw error
}

/**
 * Runs one file system read. A refusal becomes the source failure that `classification` gives for
 * its code, or `unavailable` for a code that it does not list.
 */
export async function attempt<T>(
  read: () => Promise<T>,
  classification: ReadonlyMap<string, SourceFailure>,
): Promise<Outcome<T, SourceFailure>> {
  try {
    return succeed(await read())
  } catch (error) {
    return fail(classification.get(codeOf(error)) ?? 'unavailable')
  }
}
