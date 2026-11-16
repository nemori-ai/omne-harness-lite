import { basename, join, sep } from 'node:path'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isPackagePath, type Bytes, type PackagePath } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import type { DirectoryFs, Opened } from './fs.ts'

const VISIT_BUDGET = 65_536

type Table = ReadonlyMap<string, SourceFailure>

function codes(failure: SourceFailure, list: readonly string[]): Table {
  return new Map(list.map(code => [code, failure]))
}

const ROOT = codes('package-not-found', ['ENOENT', 'ENOTDIR'])
const RESOLVE = codes('entry-unreadable', ['ELOOP', 'ENOTDIR', 'EACCES', 'EPERM', 'EIO'])
const READ = codes('entry-unreadable', ['EACCES', 'EPERM', 'EIO', 'ELOOP', 'ENXIO'])
const OPEN = codes('entry-not-found', ['ENOENT', 'ENOTDIR'])
const NOT_REGULAR_IN_WALK = {
  directory: 'unavailable',
  other: 'entry-unreadable',
} as const satisfies Record<Exclude<Opened['kind'], 'file'>, SourceFailure>
const NOT_REGULAR_IN_OPEN = {
  directory: 'entry-not-found',
  other: 'unavailable',
} as const satisfies Record<Exclude<Opened['kind'], 'file'>, SourceFailure>

function classify(table: Table, code: string): SourceFailure {
  return table.get(code) ?? 'unavailable'
}

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string') return code
  }
  throw error
}

async function attempt<T>(read: () => Promise<T>): Promise<Outcome<T, string>> {
  try {
    return succeed(await read())
  } catch (error) {
    return fail(codeOf(error))
  }
}

async function step<T>(read: () => Promise<T>, table: Table): Promise<Outcome<T, SourceFailure>> {
  const answer = await attempt(read)
  return 'ok' in answer ? answer : fail(classify(table, answer.failure))
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function decode(bytes: Uint8Array): string | undefined {
  try {
    return decoder.decode(bytes)
  } catch {
    return undefined
  }
}

export type PackageFile = Readonly<{ path: PackagePath; bytes: Bytes }>

export type Collected = Readonly<{ rootName: string; files: readonly PackageFile[] }>

export function isWithin(root: string, target: string): boolean {
  const base = root.split(sep)
  const path = target.split(sep)
  return path.length >= base.length && base.every((segment, index) => path[index] === segment)
}

async function resolveRoot(fs: DirectoryFs, root: string): Promise<Outcome<string, SourceFailure>> {
  const resolved = await step(() => fs.realpath(root), ROOT)
  if (!('ok' in resolved)) return resolved
  const real = decode(resolved.ok)
  if (real === undefined || basename(real) === '') return fail('package-not-found')
  const kind = await step(() => fs.lstat(real), ROOT)
  if (!('ok' in kind)) return kind
  return kind.ok.isDirectory() ? succeed(real) : fail('package-not-found')
}

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
