import { lstat } from 'node:fs/promises'
import { win32 } from 'node:path'

/** Where a host path lies below a host files root, without following links. The Windows files backend
 *  and a guard in front of a provider share this one judgment, so they cannot disagree. */

const splitWindows = (value: string) =>
  value
    .replaceAll('/', '\\')
    .split('\\')
    .filter(part => part !== '' && part !== '.')

export type WindowsPathRefusal = 'form' | 'parent'

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

function windowsParts(path: string): readonly string[] | undefined {
  const parsed = windowsPathSegments(path)
  return parsed.ok ? [parsed.drive, ...parsed.segments] : undefined
}

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

function posixSegmentsBelow(root: string, path: string): readonly string[] | undefined {
  if (!path.startsWith('/') || path.includes('\0')) return undefined
  const split = (value: string) => value.split('/').filter(part => part !== '' && part !== '.')
  const base = split(root)
  const parts = split(path)
  if (parts.includes('..') || parts.length < base.length) return undefined
  if (base.some((part, index) => parts[index] !== part)) return undefined
  return parts.slice(base.length)
}

export function hostSegmentsBelowRoot(
  root: string,
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<readonly string[] | undefined> {
  return platform === 'win32'
    ? windowsSegmentsBelow(root, path)
    : Promise.resolve(posixSegmentsBelow(root, path))
}
