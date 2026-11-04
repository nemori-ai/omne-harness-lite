// The only constructor of a Skill package snapshot. Consistency holds at construction: the paths
// are unique, no file is an ancestor directory of another path, every entry fact is computed from
// its bytes, and the package digest is computed from the entries.
//
// How "only the constructor makes it" holds: the brand of `SkillPackageSnapshot` has a module
// private key, so no code can write the type without a cast; and `register` puts every snapshot
// that `sealSnapshot` makes into a module private WeakSet, so `assertSealed` refuses a copy with
// the same fields. The registration is a credential of this process and this module instance.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest, digestOfSorted } from './digest.ts'
import { encodingOf, inferMediaType } from './media.ts'
import type {
  Bytes,
  PackageEntry,
  PackagePath,
  SkillPackageSnapshot,
  SnapshotShape,
} from './values.ts'

export type SnapshotDefect =
  | Readonly<{ kind: 'invalid-root-name' }>
  | Readonly<{ kind: 'duplicate-path'; path: PackagePath }>
  | Readonly<{ kind: 'prefix-conflict'; file: PackagePath; nested: PackagePath }>

const sealed = new WeakSet<object>()

/** Registers a snapshot that `sealSnapshot` built, and narrows it to the branded type. */
function register(snapshot: SnapshotShape): asserts snapshot is SkillPackageSnapshot {
  sealed.add(snapshot)
}

/** Whether `value` is a snapshot that `sealSnapshot` made in this process. It does not throw: a
 * service takes a source answer through it, and a forged snapshot there is a fault of the source. */
export function isSealedSnapshot(value: unknown): value is SkillPackageSnapshot {
  return typeof value === 'object' && value !== null && sealed.has(value)
}

/** Throws when `snapshot` was not made by `sealSnapshot`: a forged snapshot is a caller bug. */
export function assertSealed(snapshot: SkillPackageSnapshot): void {
  if (!isSealedSnapshot(snapshot)) throw new TypeError('the snapshot was not made by sealSnapshot')
}

/** UTF-16 code unit order. `<` and `<=` are equivalent here: the paths are already unique. */
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
 * Makes a snapshot from the files of one package. The root name comes from the source, must be
 * non-empty without `/`, and does not enter the digest. Sources must use this function.
 */
export function sealSnapshot(
  input: Readonly<{
    rootName: string
    files: readonly Readonly<{ path: PackagePath; bytes: Bytes }>[]
  }>,
): Outcome<SkillPackageSnapshot, SnapshotDefect> {
  if (input.rootName === '' || input.rootName.includes('/'))
    return fail({ kind: 'invalid-root-name' })
  const files = [...input.files].sort(byPath)
  const paths = new Map<string, PackagePath>()
  for (const file of files) {
    if (paths.has(file.path)) return fail({ kind: 'duplicate-path', path: file.path })
    paths.set(file.path, file.path)
  }
  const conflict = prefixConflict(paths)
  if (conflict !== undefined) return fail(conflict)
  const entries = Object.freeze(files.map(file => entryOf(file.path, file.bytes)))
  const snapshot: SnapshotShape = Object.freeze({
    rootName: input.rootName,
    entries,
    digest: digestOfSorted(entries),
  })
  register(snapshot)
  return succeed(snapshot)
}
