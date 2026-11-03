// A `DirectoryFs` over the real file system whose reads a test can replace one by one, so a test
// can make a read fail with any error code. A root process cannot provoke EACCES with chmod, so
// the permission tests use this seam instead of file modes.
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import type { DirectoryFs } from '@omne-harness/skill-host-local'

/** The real file system, read the same way as the default seam of the source. */
export const realFs: DirectoryFs = {
  readdir: path => readdir(path, { withFileTypes: true }),
  lstat: path => lstat(path),
  realpath: path => realpath(path),
  readFile: path => readFile(path),
}

/** An error as the file system gives it: a message and a string `code`. */
export function refusal(code: string): Error {
  return Object.assign(new Error(`${code}: injected by the test`), { code })
}

/**
 * The real file system, except that `method` rejects with `error` for every path that `at`
 * accepts. Other calls read the real file system.
 */
export function failing(
  method: keyof DirectoryFs,
  at: (path: string) => boolean,
  error: Error,
): DirectoryFs {
  function guard<T>(name: keyof DirectoryFs, read: (path: string) => Promise<T>) {
    return async (path: string): Promise<T> => {
      if (name === method && at(path)) throw error
      return read(path)
    }
  }
  return {
    readdir: guard('readdir', realFs.readdir),
    lstat: guard('lstat', realFs.lstat),
    realpath: guard('realpath', realFs.realpath),
    readFile: guard('readFile', realFs.readFile),
  }
}
