import { readFileSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { readVersions, VERSIONS_DIR } from '@omne-harness/assembly-cordis'

/** The file a version is started by: the `bin` of its own package. */
export function entryOfVersion(root: string, version: string): string {
  const directory = join(root, VERSIONS_DIR, version)
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    bin?: unknown
  }
  const { bin } = manifest
  const entry = typeof bin === 'string' ? bin : (bin as Record<string, unknown>)?.['harness-server']
  if (typeof entry !== 'string') throw new Error(`version ${version} names no harness-server bin`)
  return resolve(directory, entry)
}

/** Why the build started by `entry` is not the one to run under the install root, or null when the pointer names it. */
export function refusedByPointer(root: string, entry: string): string | null {
  let named: string | undefined
  let own: string | undefined
  try {
    named = readVersions(root).pointer?.current
    const under = relative(join(realpathSync(root), VERSIONS_DIR), realpathSync(entry)).split(sep)
    own = under.length > 1 && under[0] !== '..' ? under[0] : undefined
  } catch (error) {
    return `version-pointer-unreadable: ${error instanceof Error ? error.message : String(error)}`
  }
  if (named !== undefined && named === own) return null
  return `version-not-current: the pointer under ${root} names ${named ?? 'no version'}; this build is ${own ?? 'not a version under it'}`
}
