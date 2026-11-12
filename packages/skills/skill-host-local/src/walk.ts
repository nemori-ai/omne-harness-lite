// Reads one package directory as it is now: the root, a recursive walk that resolves every entry
// before it reads it, and the classification of every file system answer into the closed set of
// source failures. All classification is in this file. Whether a resolved path is inside the root
// is decided here, by whole path segments, for both `snapshot` and `open`.
import { basename, join, sep } from 'node:path'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isPackagePath, type Bytes, type PackagePath } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import type { DirectoryFs, Opened } from './fs.ts'

/**
 * The most names that one walk visits, counted over every listing, also when links reach one
 * directory many times. Links without a cycle can still multiply the visits: two links per level
 * to the next level give 2^n visits at depth n.
 */
const VISIT_BUDGET = 65_536

type Table = ReadonlyMap<string, SourceFailure>

function codes(failure: SourceFailure, list: readonly string[]): Table {
  return new Map(list.map(code => [code, failure]))
}

/** The root: absent, or not a directory. */
const ROOT = codes('package-not-found', ['ENOENT', 'ENOTDIR'])
/** Resolving an entry, or reading the kind of what it resolves to: a cycle, a path through a
 * file, or no permission. `ENOENT` of a resolution is decided in `resolveEntry`. */
const RESOLVE = codes('entry-unreadable', ['ELOOP', 'ENOTDIR', 'EACCES', 'EPERM', 'EIO'])
/** Listing a directory or opening a file inside the package: no permission, a link put in its
 * place after the resolution (`ELOOP`), or a socket (`ENXIO`). */
const READ = codes('entry-unreadable', ['EACCES', 'EPERM', 'EIO', 'ELOOP', 'ENXIO'])
/** `open`: the path names nothing. */
const OPEN = codes('entry-not-found', ['ENOENT', 'ENOTDIR'])
/** An opened object that is not a regular file. In a walk, a directory there means the tree
 * changed after the source read the kind. For `open`, a directory is not an entry. */
const NOT_REGULAR_IN_WALK = {
  directory: 'unavailable',
  other: 'entry-unreadable',
} as const satisfies Record<Exclude<Opened['kind'], 'file'>, SourceFailure>
const NOT_REGULAR_IN_OPEN = {
  directory: 'entry-not-found',
  other: 'unavailable',
} as const satisfies Record<Exclude<Opened['kind'], 'file'>, SourceFailure>

/** The failure that `table` gives for `code`. A code that the table does not list is `unavailable`. */
function classify(table: Table, code: string): SourceFailure {
  return table.get(code) ?? 'unavailable'
}

/** The `code` of a file system error. Any other error is thrown again unchanged. */
function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string') return code
  }
  throw error
}

/** Runs one read of the seam. A refusal comes back as its code. */
async function attempt<T>(read: () => Promise<T>): Promise<Outcome<T, string>> {
  try {
    return succeed(await read())
  } catch (error) {
    return fail(codeOf(error))
  }
}

/** Runs one read of the seam. A refusal comes back as the failure that `table` gives. */
async function step<T>(read: () => Promise<T>, table: Table): Promise<Outcome<T, SourceFailure>> {
  const answer = await attempt(read)
  return 'ok' in answer ? answer : fail(classify(table, answer.failure))
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Strict UTF-8, a leading byte order mark kept. Undefined for bytes that are not UTF-8. */
function decode(bytes: Uint8Array): string | undefined {
  try {
    return decoder.decode(bytes)
  } catch {
    return undefined
  }
}

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
 * The root with every link resolved, checked to be a directory with a name. A root that resolves
 * to the file system root has no name, and a root that is a file holds no package. A resolved
 * root that is not UTF-8 cannot be named as a path, so no package of this source is there.
 */
async function resolveRoot(fs: DirectoryFs, root: string): Promise<Outcome<string, SourceFailure>> {
  const resolved = await step(() => fs.realpath(root), ROOT)
  if (!('ok' in resolved)) return resolved
  const real = decode(resolved.ok)
  if (real === undefined || basename(real) === '') return fail('package-not-found')
  const kind = await step(() => fs.lstat(real), ROOT)
  if (!('ok' in kind)) return kind
  return kind.ok.isDirectory() ? succeed(real) : fail('package-not-found')
}

/**
 * An entry with every link resolved. When the resolution finds nothing, the entry dangles if it is
 * still there, and it vanished after the listing if it is not.
 */
async function resolveEntry(fs: DirectoryFs, at: string): Promise<Outcome<string, SourceFailure>> {
  const resolved = await attempt(() => fs.realpath(at))
  if ('ok' in resolved) {
    const real = decode(resolved.ok)
    return real === undefined ? fail('entry-unreadable') : succeed(real)
  }
  if (resolved.failure !== 'ENOENT') return fail(classify(RESOLVE, resolved.failure))
  const still = await attempt(() => fs.lstat(at))
  return fail('ok' in still ? 'entry-unreadable' : classify(RESOLVE, still.failure))
}

/**
 * The private state of one `collect` call. Only `collect` makes one, and nothing outside the call
 * sees it before the call returns.
 */
type Walk = {
  readonly fs: DirectoryFs
  readonly root: string
  readonly files: PackageFile[]
  visits: number
}

/** A directory on the walk: its resolved path, its package path segments, and the resolved
 * directories from the root down to it, which a link must not enter again. */
type Place = Readonly<{ real: string; segments: readonly string[]; ancestors: ReadonlySet<string> }>

/** UTF-16 code unit order, so the first failure of a walk does not depend on listing order. */
function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function read(
  walk: Walk,
  segments: readonly string[],
  real: string,
): Promise<SourceFailure | undefined> {
  const path = segments.join('/')
  if (!isPackagePath(path)) return 'entry-unreadable'
  const opened = await step(() => walk.fs.readFile(real), READ)
  if (!('ok' in opened)) return opened.failure
  if (opened.ok.kind !== 'file') return NOT_REGULAR_IN_WALK[opened.ok.kind]
  walk.files.push({ path, bytes: opened.ok.bytes })
  return undefined
}

async function descend(
  walk: Walk,
  place: Place,
  segments: readonly string[],
  real: string,
): Promise<SourceFailure | undefined> {
  if (place.ancestors.has(real)) return 'entry-unreadable'
  const listing = await step(() => walk.fs.readdir(real), READ)
  if (!('ok' in listing)) return listing.failure
  const ancestors = new Set([...place.ancestors, real])
  return walkListing(walk, { real, segments, ancestors }, listing.ok)
}

/**
 * One name of a listing. Every entry takes the same path, whatever kind the listing reported:
 * resolve it, check that it is inside the root, read the kind of what it resolves to, then walk
 * or read that. A file is opened without following a final link, so an entry that another
 * writer replaces by a link after the check is refused.
 */
async function visit(walk: Walk, place: Place, name: string): Promise<SourceFailure | undefined> {
  walk.visits += 1
  if (walk.visits > VISIT_BUDGET) return 'entry-unreadable'
  const segments = [...place.segments, name]
  const resolved = await resolveEntry(walk.fs, join(place.real, name))
  if (!('ok' in resolved)) return resolved.failure
  const target = resolved.ok
  if (!isWithin(walk.root, target)) return 'outside-package'
  const kind = await step(() => walk.fs.lstat(target), RESOLVE)
  if (!('ok' in kind)) return kind.failure
  if (kind.ok.isDirectory()) return descend(walk, place, segments, target)
  if (kind.ok.isFile()) return read(walk, segments, target)
  return 'entry-unreadable'
}

/** The names of one listing, in code unit order. A name that is not UTF-8 makes the listing
 * unreadable before any of its entries is visited. */
async function walkListing(
  walk: Walk,
  place: Place,
  listing: readonly Uint8Array[],
): Promise<SourceFailure | undefined> {
  const names: string[] = []
  for (const raw of listing) {
    const name = decode(raw)
    if (name === undefined) return 'entry-unreadable'
    names.push(name)
  }
  for (const name of names.sort(byCodeUnit)) {
    const failure = await visit(walk, place, name)
    if (failure !== undefined) return failure
  }
  return undefined
}

/**
 * Every file under `root`, read now. Directories are walked and are not entries. Every entry is
 * resolved and must stay inside the resolved root. The walk is depth first; inside each directory
 * it takes the names in code unit order, and the first failure ends it.
 */
export async function collect(
  fs: DirectoryFs,
  root: string,
): Promise<Outcome<Collected, SourceFailure>> {
  const real = await resolveRoot(fs, root)
  if (!('ok' in real)) return real
  const listing = await step(() => fs.readdir(real.ok), ROOT)
  if (!('ok' in listing)) return listing
  const walk: Walk = { fs, root: real.ok, files: [], visits: 0 }
  const place: Place = { real: real.ok, segments: [], ancestors: new Set([real.ok]) }
  const failure = await walkListing(walk, place, listing.ok)
  if (failure !== undefined) return fail(failure)
  return succeed({ rootName: basename(real.ok), files: walk.files })
}

/**
 * The bytes at `path` under `root` now. The path must resolve inside the resolved root, and the
 * resolved file is opened without following a final link. A resolved path that is not UTF-8
 * names no entry.
 */
export async function readEntry(
  fs: DirectoryFs,
  root: string,
  path: PackagePath,
): Promise<Outcome<Bytes, SourceFailure>> {
  const real = await resolveRoot(fs, root)
  if (!('ok' in real)) return real
  const resolved = await step(() => fs.realpath(join(real.ok, path)), OPEN)
  if (!('ok' in resolved)) return resolved
  const target = decode(resolved.ok)
  if (target === undefined) return fail('entry-not-found')
  if (!isWithin(real.ok, target)) return fail('outside-package')
  const opened = await step(() => fs.readFile(target), OPEN)
  if (!('ok' in opened)) return opened
  return opened.ok.kind === 'file'
    ? succeed(opened.ok.bytes)
    : fail(NOT_REGULAR_IN_OPEN[opened.ok.kind])
}
