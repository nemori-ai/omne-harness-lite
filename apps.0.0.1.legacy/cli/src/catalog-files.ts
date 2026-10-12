import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { prepareStateDirectory, resolveStateHome } from './state-layout.ts'
import { checkedDirectory, checkPrivateFile, ioCode, rethrowIo } from './state-layout-files.ts'

export interface CatalogFiles {
  readonly file: string
  readonly creator: boolean
  sync(): Promise<void>
  close(): Promise<void>
}
async function checkPath(file: string): Promise<void> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    await checkPrivateFile(handle)
  } finally {
    await handle.close()
  }
}
export async function checkCatalogFiles(file: string): Promise<void> {
  await checkPath(file)
  for (const suffix of ['-wal', '-shm']) {
    try {
      await checkPath(file + suffix)
    } catch (error) {
      if (ioCode(error) !== 'ENOENT') rethrowIo(error)
    }
  }
}
async function claimFile(file: string): Promise<boolean> {
  try {
    const fd = await open(
      file,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await checkPrivateFile(fd)
    } finally {
      await fd.close()
    }
    return true
  } catch (error) {
    if (ioCode(error) !== 'EEXIST') throw error
    return false
  }
}
export async function prepareCatalogFiles(home: string): Promise<CatalogFiles> {
  const root = resolveStateHome({ explicitHome: home, osHome: home })
  await prepareStateDirectory(root)
  let directory: FileHandle | undefined
  try {
    directory = await checkedDirectory(root, true)
    const file = join(root, 'config.sqlite')
    const creator = await claimFile(file)
    await checkCatalogFiles(file)
    const owned = directory
    return { file, creator, sync: () => owned.sync(), close: () => owned.close() }
  } catch (error) {
    try {
      await directory?.close()
    } catch (failure) {
      throw new AggregateError(
        [error, failure],
        'omne-catalog: file preparation and cleanup failed',
      )
    }
    rethrowIo(error)
  }
}
