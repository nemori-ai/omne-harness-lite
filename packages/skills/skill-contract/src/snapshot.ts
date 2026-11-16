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

const sealed: Readonly<{ add(value: object): unknown; has(value: unknown): boolean }> =
  new WeakSet<object>()

function register(snapshot: SnapshotShape): asserts snapshot is SkillPackageSnapshot {
  sealed.add(snapshot)
}

export function isSealedSnapshot(value: unknown): value is SkillPackageSnapshot {
  return sealed.has(value)
}

export function assertSealed(snapshot: SkillPackageSnapshot): void {
  if (!isSealedSnapshot(snapshot)) throw new TypeError('the snapshot was not made by sealSnapshot')
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
