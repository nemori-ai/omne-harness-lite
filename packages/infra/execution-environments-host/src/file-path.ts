import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'
import { isAbsolute, normalize, parse, relative, resolve } from 'node:path'
import type { FacilityFailure, FileInformation } from '@omne-harness-lite/execution-environments'

export class HostFileFailure extends Error {
  constructor(readonly reason: FacilityFailure['reason']) {
    super(reason)
  }
}
export function fileFailure(error: unknown): FacilityFailure {
  if (error instanceof HostFileFailure) return { kind: 'rejected', reason: error.reason }
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const reasons: Readonly<Record<string, FacilityFailure['reason']>> = {
    ENOENT: 'notFound',
    ENOTDIR: 'invalidInput',
    EEXIST: 'conflict',
    ENOTEMPTY: 'conflict',
    EACCES: 'notAuthorized',
    EPERM: 'notAuthorized',
    EXDEV: 'unsupported',
    ENOTSUP: 'unsupported',
    EOPNOTSUPP: 'unsupported',
    ELOOP: 'unsupported',
  }
  return {
    kind: 'rejected',
    reason: typeof code === 'string' ? (reasons[code] ?? 'unavailable') : 'unavailable',
  }
}
export function absoluteHostPath(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
    throw new HostFileFailure('invalidInput')
  return normalize(path)
}
async function inspectPart(path: string, missing: boolean) {
  try {
    return await lstat(path, { bigint: true })
  } catch (error) {
    if (missing && fileFailure(error).reason === 'notFound') return undefined
    throw error
  }
}
function checkPart(stat: BigIntStats, final: boolean, allowLink: boolean) {
  if (stat.isSymbolicLink() && !(final && allowLink)) throw new HostFileFailure('unsupported')
  if (!final && !stat.isDirectory()) throw new HostFileFailure('invalidInput')
}
export async function inspectHostPath(
  rawPath: string,
  allowMissing = false,
  allowLink = false,
): Promise<BigIntStats | undefined> {
  const path = absoluteHostPath(rawPath),
    root = parse(path).root
  const parts = relative(root, path).split('/').filter(Boolean)
  let cursor = root
  for (let index = 0; index < parts.length; index++) {
    cursor = resolve(cursor, parts[index]!)
    const final = index === parts.length - 1
    const stat = await inspectPart(cursor, final && allowMissing)
    if (!stat) return undefined
    checkPart(stat, final, allowLink)
    if (final) return stat
  }
  return lstat(root, { bigint: true })
}
export function hostFileVersion(stat: BigIntStats): string {
  return ['metadata-v1', stat.mode, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(
    ':',
  )
}
export function hostFileInformation(path: string, stat: BigIntStats): FileInformation {
  let type: FileInformation['type']
  if (stat.isFile()) type = 'file'
  else if (stat.isDirectory()) type = 'directory'
  else if (stat.isSymbolicLink()) type = 'symlink'
  else throw new HostFileFailure('unsupported')
  if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new HostFileFailure('capacity')
  return {
    path,
    type,
    sizeBytes: Number(stat.size),
    modifiedMs: Number(stat.mtimeNs) / 1e6,
    version: hostFileVersion(stat),
  }
}
export async function openHostRegularFile(
  path: string,
): Promise<{ handle: FileHandle; stat: BigIntStats }> {
  const checked = await inspectHostPath(path)
  if (!checked?.isFile()) throw new HostFileFailure('unsupported')
  const handle = await open(
    absoluteHostPath(path),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = await handle.stat({ bigint: true })
    if (!stat.isFile() || hostFileVersion(stat) !== hostFileVersion(checked))
      throw new HostFileFailure('conflict')
    return { handle, stat }
  } catch (error) {
    await handle.close()
    throw error
  }
}
export async function syncHostDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
