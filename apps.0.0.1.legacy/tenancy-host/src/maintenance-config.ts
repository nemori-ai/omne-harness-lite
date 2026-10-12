import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { HostConfig } from './config.ts'
import { HostStartupFailure } from './failure.ts'

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Read-only canonical path and privacy checks. Printing must not create directories. */
export async function resolveBackupDirectory(config: HostConfig): Promise<string> {
  if (config.storage.dialect !== 'sqlite')
    throw new HostStartupFailure('config', 'bounded governance requires SQLite')
  try {
    const file = resolve(config.storage.file)
    const source = join(await realpath(dirname(file)), basename(file))
    // Final-component symlinks must not turn the default into a second source identity.
    try {
      const info = await lstat(source)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('source is not a regular file')
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error
    }
    const requested = config.backupDirectory ?? `${source}.backups`
    if (!isAbsolute(requested)) throw new Error('backup directory is not absolute')
    const parent = await realpath(dirname(resolve(requested)))
    const path = join(parent, basename(resolve(requested)))
    if (path === parent) throw new Error('backup directory must have an existing parent')
    try {
      await assertPrivateDirectory(path)
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error
    }
    return path
  } catch (error) {
    throw backupFailure(error)
  }
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path)
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0
  )
    throw new Error('backup directory is not private')
}
function backupFailure(error: unknown): HostStartupFailure {
  return new HostStartupFailure('config', 'backup directory cannot be prepared durably', {
    item: 'OMNE_TENANCY_BACKUP_DIR',
    cause: error,
  })
}

/** Execute only after static tree/policy preparation; recheck the same canonical identity. */
export async function prepareBackupDirectory(
  config: HostConfig,
  expected?: string,
): Promise<string> {
  const path = await resolveBackupDirectory(config)
  try {
    if (expected !== undefined && path !== expected)
      throw new Error('backup directory identity changed')
    const parent = dirname(path)
    try {
      await mkdir(path, { mode: 0o700 })
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error
    }
    await assertPrivateDirectory(path)
    await syncDirectory(path)
    await syncDirectory(parent)
    return path
  } catch (error) {
    throw backupFailure(error)
  }
}
