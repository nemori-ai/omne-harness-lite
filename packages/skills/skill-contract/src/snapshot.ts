import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest, digestOfEntries } from './digest.ts'
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

export function packageEntryOf(path: PackagePath, bytes: Bytes): PackageEntry {
  const mediaType = inferMediaType(path, bytes)
  return Object.freeze({
    path,
    encoding: encodingOf(bytes),
    size: bytes.length,
    ...(mediaType === undefined ? {} : { mediaType }),
    digest: computeDigest(bytes),
  })
}

function copyOf(entry: PackageEntry): PackageEntry {
  return Object.freeze({
    path: entry.path,
    encoding: entry.encoding,
    size: entry.size,
    ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
    digest: entry.digest,
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

export function sealEntries(
  input: Readonly<{ rootName: string; entries: readonly PackageEntry[] }>,
): Outcome<SkillPackageSnapshot, SnapshotDefect> {
  if (input.rootName === '' || input.rootName.includes('/'))
    return fail({ kind: 'invalid-root-name' })
  const sorted = [...input.entries].sort(byPath)
  const paths = new Map<string, PackagePath>()
  for (const entry of sorted) {
    if (paths.has(entry.path)) return fail({ kind: 'duplicate-path', path: entry.path })
    paths.set(entry.path, entry.path)
  }
  const conflict = prefixConflict(paths)
  if (conflict !== undefined) return fail(conflict)
  const entries = Object.freeze(sorted.map(copyOf))
  const snapshot: SnapshotShape = Object.freeze({
    rootName: input.rootName,
    entries,
    digest: digestOfEntries(entries),
  })
  register(snapshot)
  return succeed(snapshot)
}

export function sealSnapshot(
  input: Readonly<{
    rootName: string
    files: readonly Readonly<{ path: PackagePath; bytes: Bytes }>[]
  }>,
): Outcome<SkillPackageSnapshot, SnapshotDefect> {
  return sealEntries({
    rootName: input.rootName,
    entries: input.files.map(file => packageEntryOf(file.path, file.bytes)),
  })
}
