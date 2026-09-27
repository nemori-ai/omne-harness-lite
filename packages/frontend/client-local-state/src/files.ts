import { constants } from 'node:fs'
import { mkdir, open, type FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { ClientStateOpenFailure } from './surface.ts'

export function ioCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}
export function unavailableIo(error: unknown): boolean {
  return [
    'EIO',
    'ENOSPC',
    'EDQUOT',
    'EMFILE',
    'ENFILE',
    'EACCES',
    'EPERM',
    'EROFS',
    'ENOENT',
    'EBUSY',
    'EINTR',
  ].includes(ioCode(error) ?? '')
}

async function checkedDirectory(path: string, privateRoot: boolean): Promise<FileHandle> {
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const stat = await fd.stat()
    const uid = process.getuid?.()
    const privateOk = stat.uid === uid && (stat.mode & 0o777) === 0o700
    // A root-owned sticky temporary directory prevents another UID replacing our child.
    const ancestorOk =
      (stat.uid === uid || stat.uid === 0) &&
      ((stat.mode & 0o022) === 0 || (stat.uid === 0 && (stat.mode & 0o1000) !== 0))
    if (!stat.isDirectory() || uid === undefined || !(privateRoot ? privateOk : ancestorOk))
      throw new ClientStateOpenFailure('unsafe-path')
    return fd
  } catch (error) {
    await fd.close()
    throw error
  }
}

async function checkFile(file: string): Promise<void> {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await fd.stat()
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600)
      throw new ClientStateOpenFailure('unsafe-path')
  } finally {
    await fd.close()
  }
}

export async function checkSideFiles(file: string): Promise<void> {
  await checkFile(file)
  for (const suffix of ['-wal', '-shm']) {
    try {
      await checkFile(file + suffix)
    } catch (error) {
      if (ioCode(error) !== 'ENOENT') throw error
    }
  }
}

export interface PrivateFiles {
  readonly file: string
  readonly creator: boolean
  sync(): Promise<void>
  close(): Promise<void>
}

export async function prepareFiles(directory: string): Promise<PrivateFiles> {
  if (!isAbsolute(directory) || resolve(directory) !== directory)
    throw new ClientStateOpenFailure('invalid-directory')
  let root: FileHandle | undefined
  try {
    const parent = dirname(directory)
    const volume = parse(parent).root
    let at = volume
    const rootAncestor = await checkedDirectory(at, false)
    await rootAncestor.close()
    for (const part of parent.slice(volume.length).split('/').filter(Boolean)) {
      at = join(at, part)
      const ancestor = await checkedDirectory(at, false)
      await ancestor.close()
    }
    const parentFd = await checkedDirectory(parent, false)
    try {
      try {
        await mkdir(directory, { mode: 0o700 })
      } catch (error) {
        if (ioCode(error) !== 'EEXIST') throw error
      }
      root = await checkedDirectory(directory, true)
      await parentFd.sync()
    } finally {
      await parentFd.close()
    }
    const file = join(directory, 'client.sqlite')
    let creator = false
    try {
      const fd = await open(
        file,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
        0o600,
      )
      creator = true
      await fd.close()
    } catch (error) {
      if (ioCode(error) !== 'EEXIST') throw error
    }
    await checkSideFiles(file)
    const owned = root
    return { file, creator, sync: () => owned.sync(), close: () => owned.close() }
  } catch (error) {
    await root?.close()
    if (error instanceof ClientStateOpenFailure) throw error
    if (['ELOOP', 'ENOTDIR'].includes(ioCode(error) ?? ''))
      throw new ClientStateOpenFailure('unsafe-path')
    if (unavailableIo(error)) throw new ClientStateOpenFailure('unavailable')
    throw error
  }
}
