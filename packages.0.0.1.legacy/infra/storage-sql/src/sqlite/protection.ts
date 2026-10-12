import { lstatSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { StorageDefect } from '@omne-harness-lite/storage'

export const ISOLATION_MARKER = '.omne-isolated'
export const ISOLATION_CONTENT = 'omne-isolated/1\n'

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * D055: every production open checks the real ancestry before opening SQLite.
 * A marker of any kind refuses entry; malformed protection is not permission.
 * The filesystem owner must not move/remove protection or race path resolution.
 */
export function assertProductionStoragePath(file: string): string {
  const absolute = resolve(file)
  let canonical: string
  try {
    const info = lstatSync(absolute)
    if (info.isSymbolicLink()) throw new StorageDefect('storage file must not be a symbolic link')
    canonical = realpathSync(absolute)
  } catch (error) {
    if (!isMissing(error)) throw error
    // Only the database itself may be new. A missing parent never becomes a new root.
    canonical = join(realpathSync(dirname(absolute)), basename(absolute))
  }
  for (let directory = dirname(canonical); ; directory = dirname(directory)) {
    try {
      lstatSync(join(directory, ISOLATION_MARKER))
    } catch (error) {
      if (!isMissing(error)) throw error
      if (directory === dirname(directory)) break
      continue
    }
    throw new StorageDefect('isolated maintenance data cannot be opened as production storage')
  }
  return canonical
}
