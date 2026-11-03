// Reads one package directory as it is now: the root, a recursive walk that follows links, and the
// classification of every file system refusal into the closed set of source failures. Whether a
// resolved path is inside the root is decided here, by whole path segments, for both `snapshot`
// and `open`.
import { basename, join, sep } from 'node:path'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isPackagePath, type Bytes, type PackagePath } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import { attempt, type DirectoryEntry, type DirectoryFs } from './fs.ts'

function codes(
  failure: SourceFailure,
  list: readonly string[],
): ReadonlyMap<string, SourceFailure> {
  return new Map(list.map(code => [code, failure]))
}

/** The root: absent, or not a directory. Any other refusal is `unavailable`. */
const ROOT = codes('package-not-found', ['ENOENT', 'ENOTDIR'])
/** A link and the object it resolves to: dangling, a cycle, or not readable. */
const LINK = codes('entry-unreadable', ['ELOOP', 'ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EIO'])
/** A file or a directory inside the package that is listed but cannot be read. An entry that
 * vanished after the listing (`ENOENT`) is a change in progress, so it stays `unavailable`. */
const READ = codes('entry-unreadable', ['EACCES', 'EPERM', 'EIO', 'EINVAL', 'ENXIO'])
/** `open`: the path names nothing, or names a directory, which is not an entry. */
const OPEN = codes('entry-not-found', ['ENOENT', 'ENOTDIR', 'EISDIR'])

/** One file of the package: its package path and all its bytes. */
export type PackageFile = Readonly<{ path: PackagePath; bytes: Bytes }>

/** What `collect` gives: the last segment of the resolved root and every file under it. */
export type Collected = Readonly<{ rootName: string; files: readonly PackageFile[] }>

/** Whether `target` is `root` or lies under it, compared by whole path segments. */
export function isWithin(root: string, target: string): boolean {
  const base = root.split(sep)
  const path = target.split(sep)
  return path.length >= base.length && base.every((segment, index) => path[index] === segment)
}

/**
 * The root with every link resolved. A root that resolves to the file system root has no name, so
 * no package can be there.
 */
async function resolveRoot(fs: DirectoryFs, root: string): Promise<Outcome<string, SourceFailure>> {
  const real = await attempt(() => fs.realpath(root), ROOT)
  if ('ok' in real && basename(real.ok) === '') return fail('package-not-found')
  return real
}

type Walk = Readonly<{ fs: DirectoryFs; root: string; files: PackageFile[] }>

/** A directory on the walk: its resolved path, its package path segments, and the resolved
 * directories from the root down to it, which a link must not enter again. */
type Place = Readonly<{ real: string; segments: readonly string[]; ancestors: ReadonlySet<string> }>

/** UTF-16 code unit order, so the first failure of a walk does not depend on listing order. */
function byName(left: DirectoryEntry, right: DirectoryEntry): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

async function read(walk: Walk, segments: readonly string[], real: string) {
  const path = segments.join('/')
  if (!isPackagePath(path)) return 'entry-unreadable'
  const bytes = await attempt(() => walk.fs.readFile(real), READ)
  if (!('ok' in bytes)) return bytes.failure
  walk.files.push({ path, bytes: bytes.ok })
  return undefined
}

async function descend(
  walk: Walk,
  place: Place,
  segments: readonly string[],
  real: string,
): Promise<SourceFailure | undefined> {
  if (place.ancestors.has(real)) return 'entry-unreadable'
  const listing = await attempt(() => walk.fs.readdir(real), READ)
  if (!('ok' in listing)) return listing.failure
  const ancestors = new Set([...place.ancestors, real])
  return walkListing(walk, { real, segments, ancestors }, listing.ok)
}

async function follow(walk: Walk, place: Place, segments: readonly string[], link: string) {
  const target = await attempt(() => walk.fs.realpath(link), LINK)
  if (!('ok' in target)) return target.failure
  if (!isWithin(walk.root, target.ok)) return 'outside-package'
  const kind = await attempt(() => walk.fs.lstat(target.ok), LINK)
  if (!('ok' in kind)) return kind.failure
  if (kind.ok.isDirectory()) return descend(walk, place, segments, target.ok)
  if (kind.ok.isFile()) return read(walk, segments, target.ok)
  return 'entry-unreadable'
}

async function walkEntry(walk: Walk, place: Place, entry: DirectoryEntry) {
  const segments = [...place.segments, entry.name]
  const path = join(place.real, entry.name)
  if (entry.isSymbolicLink()) return follow(walk, place, segments, path)
  if (entry.isDirectory()) return descend(walk, place, segments, path)
  if (entry.isFile()) return read(walk, segments, path)
  return 'entry-unreadable'
}

async function walkListing(
  walk: Walk,
  place: Place,
  listing: readonly DirectoryEntry[],
): Promise<SourceFailure | undefined> {
  for (const entry of [...listing].sort(byName)) {
    const failure = await walkEntry(walk, place, entry)
    if (failure !== undefined) return failure
  }
  return undefined
}

/**
 * Every file under `root`, read now. Directories are walked and are not entries. Links are
 * resolved and must stay inside the resolved root. The first failure in name order ends the walk.
 */
export async function collect(
  fs: DirectoryFs,
  root: string,
): Promise<Outcome<Collected, SourceFailure>> {
  const real = await resolveRoot(fs, root)
  if (!('ok' in real)) return real
  const listing = await attempt(() => fs.readdir(real.ok), ROOT)
  if (!('ok' in listing)) return listing
  const walk: Walk = { fs, root: real.ok, files: [] }
  const place: Place = { real: real.ok, segments: [], ancestors: new Set([real.ok]) }
  const failure = await walkListing(walk, place, listing.ok)
  if (failure !== undefined) return fail(failure)
  return succeed({ rootName: basename(real.ok), files: walk.files })
}

/** The bytes at `path` under `root` now. The path must resolve inside the resolved root. */
export async function readEntry(
  fs: DirectoryFs,
  root: string,
  path: PackagePath,
): Promise<Outcome<Bytes, SourceFailure>> {
  const real = await resolveRoot(fs, root)
  if (!('ok' in real)) return real
  const target = await attempt(() => fs.realpath(join(real.ok, path)), OPEN)
  if (!('ok' in target)) return target
  if (!isWithin(real.ok, target.ok)) return fail('outside-package')
  return attempt(() => fs.readFile(target.ok), OPEN)
}
