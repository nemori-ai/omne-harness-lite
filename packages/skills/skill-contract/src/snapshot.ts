// The only constructor of a Skill package snapshot. Consistency holds at construction: the paths
// are unique, no file is an ancestor directory of another path, every entry fact is computed from
// its bytes, and the package digest is computed from the entries.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest, digestOfSorted } from './digest.ts'
import { encodingOf, inferMediaType } from './media.ts'
import type { Bytes, PackageEntry, PackagePath, SkillPackageSnapshot } from './values.ts'

export type SnapshotDefect =
  | Readonly<{ kind: 'duplicate-path'; path: PackagePath }>
  | Readonly<{ kind: 'prefix-conflict'; file: PackagePath; nested: PackagePath }>

type SnapshotFields = Readonly<{
  rootName: string
  entries: readonly PackageEntry[]
  digest: SkillPackageSnapshot['digest']
}>

const sealed = new WeakSet<object>()

function isSealed(value: SnapshotFields): value is SkillPackageSnapshot {
  return sealed.has(value)
}

/** Throws when `snapshot` was not made by `sealSnapshot`: a forged snapshot is a caller bug. */
export function assertSealed(snapshot: SkillPackageSnapshot): void {
  if (!sealed.has(snapshot)) throw new TypeError('the snapshot was not made by sealSnapshot')
}

function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
}

function entryOf(path: PackagePath, bytes: Bytes): PackageEntry {
  const mediaType = inferMediaType(path, bytes)
  return Object.freeze({
    path,
    encoding: encodingOf(bytes),
    size: bytes.length,
    ...(mediaType === undefined ? {} : { mediaType }),
    digest: computeDigest(bytes),
  })
}

/** The first file that is an ancestor directory of another path, found level by level. */
function prefixConflict(paths: ReadonlyMap<string, PackagePath>): SnapshotDefect | undefined {
  for (const path of paths.values()) {
    const segments = path.split('/')
    for (let depth = 1; depth < segments.length; depth += 1) {
      const file = paths.get(segments.slice(0, depth).join('/'))
      if (file !== undefined) return { kind: 'prefix-conflict', file, nested: path }
    }
  }
  return undefined
}

/**
 * Makes a snapshot from the files of one package. The root name comes from the source and does
 * not enter the digest. Sources must use this function to give a snapshot.
 */
export function sealSnapshot(
  input: Readonly<{
    rootName: string
    files: readonly Readonly<{ path: PackagePath; bytes: Bytes }>[]
  }>,
): Outcome<SkillPackageSnapshot, SnapshotDefect> {
  const files = [...input.files].sort(byPath)
  const paths = new Map<string, PackagePath>()
  for (const file of files) {
    if (paths.has(file.path)) return fail({ kind: 'duplicate-path', path: file.path })
    paths.set(file.path, file.path)
  }
  const conflict = prefixConflict(paths)
  if (conflict !== undefined) return fail(conflict)
  const entries = Object.freeze(files.map(file => entryOf(file.path, file.bytes)))
  const snapshot: SnapshotFields = Object.freeze({
    rootName: input.rootName,
    entries,
    digest: digestOfSorted(entries),
  })
  sealed.add(snapshot)
  if (!isSealed(snapshot)) throw new Error('the snapshot was not registered')
  return succeed(snapshot)
}
