import { lstat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { segmentsBelow, windowsPathSegments } from '@omne-harness/execution-environment-contract'

/** Where a host path lies below a host files root, without following links. Whether it lies below is the
 *  judgment of the contract; the Windows files backend and a guard in front of a provider use it here. */

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

/** A segment of the path that names the entry of the root's segment by another name, such as a short
 *  name, is read as the root's segment before the contract judges the path. */
export async function windowsSegmentsBelow(
  root: string,
  path: string,
): Promise<readonly string[] | undefined> {
  const base = windowsPathSegments(root)
  const given = windowsPathSegments(path)
  if (!base.ok || !given.ok) return undefined
  const segments = [...given.segments]
  let parent = `${base.drive}\\`
  for (const [index, own] of base.segments.entries()) {
    const segment = segments[index]
    if (segment === undefined) break
    if (
      segment.toLowerCase() !== own.toLowerCase() &&
      (await sameEntry(win32.join(parent, own), win32.join(parent, segment)))
    )
      segments[index] = own
    parent = win32.join(parent, own)
  }
  return segmentsBelow(root, `${given.drive}\\${segments.join('\\')}`, 'win32')
}

export function hostSegmentsBelowRoot(
  root: string,
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<readonly string[] | undefined> {
  return platform === 'win32'
    ? windowsSegmentsBelow(root, path)
    : Promise.resolve(segmentsBelow(root, path, platform))
}
