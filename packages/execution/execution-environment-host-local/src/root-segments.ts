import { lstat } from 'node:fs/promises'
import { win32 } from 'node:path'

/**
 * Where a host path lies below a host files root, judged without following any link. One judgment
 * for the Windows files backend and for a guard in front of a provider, so the two cannot disagree
 * about the position of a path (R2-D374, R2-D376).
 */

/** The segments of a Windows path. Empty and `.` segments are left out, as on POSIX. */
const splitWindows = (value: string) =>
  value
    .replaceAll('/', '\\')
    .split('\\')
    .filter(part => part !== '' && part !== '.')

/**
 * Why a Windows path is refused before IO: `form` for a spelling outside the supported range (no
 * drive letter as in UNC, `\\?\` and `\\.\`, a NUL, an alternate stream, a name with a trailing dot
 * or space, a device name), `parent` for a `..` segment.
 */
export type WindowsPathRefusal = 'form' | 'parent'

/**
 * The drive and the segments below it of an absolute Windows path, or why the path is refused
 * before IO. Empty and `.` segments are left out.
 */
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

/** The drive and the segments of a Windows path, or undefined for a form refused before IO. */
function windowsParts(path: string): readonly string[] | undefined {
  const parsed = windowsPathSegments(path)
  return parsed.ok ? [parsed.drive, ...parsed.segments] : undefined
}

/** Two names in one directory name the same entry: same volume and file index, links not followed. */
async function sameEntry(left: string, right: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([
      lstat(left, { bigint: true }),
      lstat(right, { bigint: true }),
    ])
    return a.ino !== 0n && a.dev === b.dev && a.ino === b.ino
  } catch {
    return false
  }
}

/**
 * Windows: the segments of `path` below `root`, or undefined when the path is not below the root
 * or has a form that `windowsPathSegments` refuses. A segment of the root spelled the same up to case
 * matches without IO. A segment spelled in another way matches only when it names the same
 * directory entry, for example the 8.3 short name of it. That segment is compared as an entry of
 * the parent that the root's own spelling reached, with links not followed, so a link of another
 * name never counts as a segment of the root. The drive is compared as text, so another drive
 * letter for the same volume (`subst`) is not below the root. The segments below the root are
 * returned as given, without empty and `.` segments.
 */
export async function windowsSegmentsBelow(
  root: string,
  path: string,
): Promise<readonly string[] | undefined> {
  const parts = windowsParts(path)
  if (parts === undefined) return undefined
  const base = splitWindows(root)
  const drive = base[0]
  if (drive === undefined || parts.length < base.length) return undefined
  if (drive.toLowerCase() !== parts[0]?.toLowerCase()) return undefined
  let parent = `${drive}\\`
  for (let index = 1; index < base.length; index += 1) {
    const own = base[index] ?? ''
    const given = parts[index] ?? ''
    if (
      own.toLowerCase() !== given.toLowerCase() &&
      !(await sameEntry(win32.join(parent, own), win32.join(parent, given)))
    )
      return undefined
    parent = win32.join(parent, own)
  }
  return parts.slice(base.length)
}

/** POSIX: the segments of `path` below `root` by text, or undefined. A `..` anywhere is outside. */
function posixSegmentsBelow(root: string, path: string): readonly string[] | undefined {
  if (!path.startsWith('/') || path.includes('\0')) return undefined
  const split = (value: string) => value.split('/').filter(part => part !== '' && part !== '.')
  const base = split(root)
  const parts = split(path)
  if (parts.includes('..') || parts.length < base.length) return undefined
  if (base.some((part, index) => parts[index] !== part)) return undefined
  return parts.slice(base.length)
}

/**
 * The segments of an absolute host path below a host files root, or undefined when the path does
 * not lie below the root. Nothing is followed: a path through a link that points into the root is
 * not below it, and a path below the root may still lead through a link out of it. The judgment is
 * about the position only and grants no access. Windows matches another spelling of a root segment
 * (8.3 short name, case) by its directory entry; POSIX compares text.
 */
export function hostSegmentsBelowRoot(
  root: string,
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<readonly string[] | undefined> {
  return platform === 'win32'
    ? windowsSegmentsBelow(root, path)
    : Promise.resolve(posixSegmentsBelow(root, path))
}
