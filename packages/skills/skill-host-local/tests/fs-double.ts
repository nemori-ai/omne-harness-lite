import type { DirectoryFs } from '@omne-harness/skill-host-local'
import { nodeFs } from '../src/fs.ts'

export const realFs: DirectoryFs = nodeFs()

export function refusal(code: string): Error {
  return Object.assign(new Error(`${code}: injected by the test`), { code })
}

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
