import type { FileSystemFacility } from './facilities/files.ts'

/** Where the file requests of one acquisition may read and where they may write. A side left out is not limited. */
export type FilesScope = Readonly<{ read?: string; write?: string }>

export type FileEffect = 'read' | 'write'

/** The files operations a scope limits; closing a handle neither reads nor writes. */
export type ScopedFileOperation = Exclude<keyof FileSystemFacility<unknown>, 'close'>

const reads = Object.freeze({ path: 'read' as const })
const writes = Object.freeze({ path: 'write' as const })
const transfers = Object.freeze({ path: 'read' as const, target: 'write' as const })

/** The effect of each operation on its path and on its target: a move or copy reads its source and writes its target. */
export const fileEffects = Object.freeze({
  read: reads,
  stat: reads,
  list: reads,
  search: reads,
  recoverBatch: reads,
  write: writes,
  mkdir: writes,
  remove: writes,
  commitBatch: writes,
  move: transfers,
  copy: transfers,
}) satisfies Readonly<
  Record<ScopedFileOperation, Readonly<{ path: FileEffect; target?: FileEffect }>>
>

export type WindowsPathRefusal = 'form' | 'parent'

const splitWindows = (value: string) =>
  value
    .replaceAll('/', '\\')
    .split('\\')
    .filter(part => part !== '' && part !== '.')

/** The drive and segments of an absolute Windows path, refused when it is not one or climbs with `..`. */
export function windowsPathSegments(
  path: string,
):
  | Readonly<{ ok: true; drive: string; segments: readonly string[] }>
  | Readonly<{ ok: false; refusal: WindowsPathRefusal }> {
  if (!/^[a-z]:[\\/]/iu.test(path) || path.includes('\0')) return { ok: false, refusal: 'form' }
  const [drive = '', ...segments] = splitWindows(path)
  if (segments.includes('..')) return { ok: false, refusal: 'parent' }
  if (
    segments.some(
      part =>
        part.includes(':') ||
        /[. ]$/u.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part),
    )
  )
    return { ok: false, refusal: 'form' }
  return { ok: true, drive, segments }
}

function partsOf(path: string, platform: NodeJS.Platform): readonly string[] | undefined {
  if (platform === 'win32') {
    const parsed = windowsPathSegments(path)
    return parsed.ok ? [parsed.drive, ...parsed.segments] : undefined
  }
  if (!path.startsWith('/') || path.includes('\0')) return undefined
  const parts = path.split('/').filter(part => part !== '' && part !== '.')
  return parts.includes('..') ? undefined : parts
}

/** The segments of a path below a root, by segments only (Windows ignores case). Undefined: not below it. */
export function segmentsBelow(
  root: string,
  path: string,
  platform: NodeJS.Platform = process.platform,
): readonly string[] | undefined {
  const base = partsOf(root, platform)
  const parts = partsOf(path, platform)
  if (base === undefined || parts === undefined) return undefined
  const same = (left: string, right: string | undefined) =>
    platform === 'win32' ? left.toLowerCase() === right?.toLowerCase() : left === right
  if (base.some((part, index) => !same(part, parts[index]))) return undefined
  return parts.slice(base.length)
}

/** Whether a path lies below the root of its effect; a side with no root is not limited. */
export function withinScope(
  scope: FilesScope,
  effect: FileEffect,
  path: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const root = scope[effect]
  return root === undefined || segmentsBelow(root, path, platform) !== undefined
}
