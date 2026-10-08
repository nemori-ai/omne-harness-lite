import { constants, type Stats } from 'node:fs'
import { mkdir, open, type FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'
import { StateLayoutFailure, checkedTenantBinding } from './state-layout-values.ts'

function ioCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}
function rethrowIo(error: unknown): never {
  const code = ioCode(error)
  if (code === 'ELOOP' || code === 'ENOTDIR') throw new StateLayoutFailure('unsafe-path')
  if (
    [
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
    ].includes(code ?? '')
  )
    throw new StateLayoutFailure('unavailable')
  throw error
}

async function checkedDirectory(path: string, privateRequired: boolean): Promise<FileHandle> {
  const file = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    const uid = process.getuid?.()
    const ownPrivate = uid !== undefined && stat.uid === uid && (stat.mode & 0o777) === 0o700
    const safeAncestor = uid !== undefined && trustedAncestor(stat, uid)
    if (!stat.isDirectory() || !(privateRequired ? ownPrivate : safeAncestor))
      throw new StateLayoutFailure('unsafe-path')
    return file
  } catch (error) {
    await file.close()
    throw error
  }
}

function trustedAncestor(stat: Stats, uid: number): boolean {
  const trustedOwner = stat.uid === uid || stat.uid === 0
  const protectedEntries =
    (stat.mode & 0o022) === 0 || (stat.uid === 0 && (stat.mode & 0o1000) !== 0)
  return trustedOwner && protectedEntries
}

export async function preparePrivateDirectory(
  path: string,
  create: boolean,
  privateRequired: boolean,
): Promise<void> {
  try {
    if (create) {
      const parent = await checkedDirectory(dirname(path), false)
      try {
        try {
          await mkdir(path, { mode: 0o700 })
        } catch (error) {
          if (ioCode(error) !== 'EEXIST') throw error
        }
        const directory = await checkedDirectory(path, privateRequired)
        await directory.close()
        await parent.sync()
      } finally {
        await parent.close()
      }
    } else {
      const directory = await checkedDirectory(path, privateRequired)
      await directory.close()
    }
  } catch (error) {
    rethrowIo(error)
  }
}

async function checkBindingFile(file: FileHandle): Promise<void> {
  const stat = await file.stat()
  if (
    !stat.isFile() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.nlink !== 1
  )
    throw new StateLayoutFailure('unsafe-path')
}

async function readBinding(file: FileHandle, maxBytes: number): Promise<Buffer> {
  if ((await file.stat()).size > maxBytes) throw new StateLayoutFailure('invalid-binding')
  const buffer = Buffer.alloc(maxBytes + 1)
  let size = 0
  for (;;) {
    const { bytesRead } = await file.read(buffer, size, buffer.length - size, null)
    if (bytesRead === 0) return buffer.subarray(0, size)
    size += bytesRead
    if (size > maxBytes) throw new StateLayoutFailure('invalid-binding')
  }
}

function checkExistingBinding(bytes: Buffer, expected: Buffer): void {
  let decoded: unknown
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes))
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError)
      throw new StateLayoutFailure('invalid-binding')
    throw error
  }
  const binding = checkedTenantBinding(decoded)
  // A machine-owned canonical encoding also rejects duplicate JSON keys.
  if (!bytes.equals(Buffer.from(JSON.stringify(binding) + '\n')))
    throw new StateLayoutFailure('invalid-binding')
  if (!bytes.equals(expected)) throw new StateLayoutFailure('binding-mismatch')
}

export async function installTenantBinding(
  path: string,
  expected: Buffer,
  maxBytes: number,
): Promise<void> {
  let file: FileHandle | undefined
  try {
    let created = false
    try {
      file = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
        0o600,
      )
      created = true
    } catch (error) {
      if (ioCode(error) !== 'EEXIST') throw error
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    }
    await checkBindingFile(file)
    if (created) {
      await file.writeFile(expected)
      await file.sync()
    } else checkExistingBinding(await readBinding(file, maxBytes), expected)
    const directory = await checkedDirectory(dirname(path), true)
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } catch (error) {
    rethrowIo(error)
  } finally {
    await file?.close()
  }
}
