import { constants } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { lstat, mkdtemp, open, realpath, rm, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, posix } from 'node:path'
import type {
  FacilityReason,
  FacilityResult,
  FileVersion,
  ObjectToken,
  ProviderFacts,
} from '@omne-harness/execution-environment-contract'

/**
 * Paths for the host files facility on Linux. Every object below a directory is reached through
 * `/proc/self/fd/<descriptor>/<name>`, which the kernel resolves against the directory object that
 * was opened, not against the name the directory had. A directory renamed or replaced by a link
 * after it was opened therefore changes nothing for a call that goes through its descriptor.
 *
 * With a host file root, every path is also walked from the root one segment at a time without
 * following links. Without a root, the path of the named object is opened as it always was and
 * only what lies below that object is reached by descriptor.
 */

export type FileStats = BigIntStats

/** Why a step did not complete. `unresolved` is a path with no object; `unknown` is an unmapped error. */
export type Failure = 'unresolved' | 'unknown' | FacilityReason

export type Outcome<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; failure: Failure }>

export type CloseHandle = (handle: FileHandle) => Promise<void>

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value })
export const fail = (failure: Failure): Outcome<never> => ({ ok: false, failure })

/** Node on Windows has no `O_NOFOLLOW`; this module serves a host only after P2 holds, which is Linux. */
const noFollow: number | undefined = constants.O_NOFOLLOW
const noFollowFlag = noFollow ?? 0
export const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | noFollowFlag

export const openCodes: Readonly<Record<string, Failure>> = {
  ENOENT: 'unresolved',
  ENOTDIR: 'unresolved',
  ELOOP: 'unsupported',
  EMLINK: 'unsupported',
  EISDIR: 'unsupported',
  EINVAL: 'invalidInput',
  EACCES: 'notAuthorized',
  EPERM: 'notAuthorized',
}

export const createCodes: Readonly<Record<string, FacilityReason>> = {
  EEXIST: 'conflict',
  ENOENT: 'notFound',
  ENOTDIR: 'notFound',
  ELOOP: 'unsupported',
  EMLINK: 'unsupported',
  EISDIR: 'unsupported',
  EINVAL: 'invalidInput',
  EACCES: 'notAuthorized',
  EPERM: 'notAuthorized',
}

/** Error codes of a single system call that changes the tree, when the call changed nothing. */
export const changeCodes: Readonly<Record<string, FacilityReason>> = {
  ...createCodes,
  ENOTEMPTY: 'conflict',
  EXDEV: 'unsupported',
  EOPNOTSUPP: 'unsupported',
  ENOSPC: 'capacity',
  EDQUOT: 'capacity',
  EROFS: 'notAuthorized',
  EBUSY: 'busy',
}

/** Error codes of a rename, which also reports a target of the wrong kind or a move into itself. */
export const renameCodes: Readonly<Record<string, FacilityReason>> = {
  ...changeCodes,
  ENOTDIR: 'conflict',
  EISDIR: 'unsupported',
  EINVAL: 'invalidInput',
}

export function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

export function mapped<T>(table: Readonly<Record<string, T>>, error: unknown): T | undefined {
  const code = errorCode(error)
  return code !== undefined && Object.hasOwn(table, code) ? table[code] : undefined
}

/** The failure of a system call that changes the tree: its mapped reason, else unknown. */
export function changeFailure(
  error: unknown,
  table: Readonly<Record<string, FacilityReason>> = changeCodes,
): Failure {
  return mapped(table, error) ?? 'unknown'
}

export function tokenOf(stat: FileStats): ObjectToken {
  return { token: `${stat.dev}:${stat.ino}` }
}

export function versionOf(stat: FileStats): FileVersion {
  return `${stat.mtimeMs}:${stat.size}`
}

export function reject(requestId: string, reason: FacilityReason): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason }
}

export function unknown(requestId: string): FacilityResult<never> {
  return { kind: 'unknown', requestId }
}

/** The result for a failed step; `unresolved` stays unresolved only where the contract allows it. */
export function failed(
  requestId: string,
  failure: Failure,
  unresolved: 'unresolved' | 'notFound',
): FacilityResult<never> {
  if (failure === 'unresolved')
    return unresolved === 'unresolved'
      ? { kind: 'unresolved', requestId }
      : reject(requestId, 'notFound')
  if (failure === 'unknown') return unknown(requestId)
  return reject(requestId, failure)
}

/** A host path is absolute and has no NUL byte; anything else is refused before the file system. */
export function isHostPath(path: string): boolean {
  return isAbsolute(path) && !path.includes('\0')
}

export function pathWithoutTrailingSlash(path: string): string {
  let current = path
  while (current.length > 1 && current.endsWith('/')) current = current.slice(0, -1)
  return current
}

/** `/proc/self/fd/<descriptor>`, the directory object a descriptor stands for. */
export function fdDir(directory: FileHandle): string {
  return `/proc/self/fd/${directory.fd}`
}

/** A name below an opened directory; the name has no slash. */
export function fdPath(directory: FileHandle, name: string): string {
  return `${fdDir(directory)}/${name}`
}

/**
 * Prerequisite P2: this host resolves a name below an opened directory through its descriptor.
 * The probe makes a temporary directory, opens it, creates and removes a file through
 * `/proc/self/fd/<descriptor>/<name>`, and removes the directory. `unsatisfied` is a host that has
 * no such path; `unknown` is a probe that could not run.
 */
export async function probeHostFilesPrerequisite(
  directory: string = tmpdir(),
): Promise<ProviderFacts['prerequisites']> {
  if (process.platform !== 'linux') return 'unsatisfied'
  let made: string
  try {
    made = await mkdtemp(join(directory, 'omne-probe-'))
  } catch {
    return 'unknown'
  }
  try {
    const opened = await open(made, constants.O_RDONLY | constants.O_DIRECTORY)
    try {
      const file = fdPath(opened, 'probe')
      const created = await open(
        file,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag,
        0o600,
      )
      await created.close()
      await unlink(file)
      return 'satisfied'
    } catch (error) {
      const code = errorCode(error)
      return code === 'ENOENT' || code === 'ENOTDIR' ? 'unsatisfied' : 'unknown'
    } finally {
      await opened.close().catch(() => undefined)
    }
  } catch {
    return 'unknown'
  } finally {
    await rm(made, { recursive: true, force: true }).catch(() => undefined)
  }
}

export type DirectoryRole = 'target' | 'parent'

/** The directory that holds the last segment of a path, and that segment. */
export type Located = Readonly<{
  parent: FileHandle
  name: string
  /** The path is the host file root itself; `name` is `.` and nothing may be changed. */
  isRoot: boolean
}>

/** The nearest existing directory on a path and the segments below it that do not exist yet. */
export type Ancestor = Readonly<{ ancestor: FileHandle; rest: readonly string[] }>

export type HostPaths = Readonly<{
  rooted: boolean
  /** False when this host cannot serve (P2 unsatisfied or the root unusable): answer `unavailable`. */
  available(): Promise<boolean>
  /** Rooted only: the part of the check that needs no file system. Undefined when the path may go on. */
  checkPath(path: string): Promise<Failure | undefined>
  /** The directory at `path`. The caller closes it. */
  openDirectory(path: string, role: DirectoryRole): Promise<Outcome<FileHandle>>
  /** The directory that holds the last segment of `path`. The caller closes `parent`. */
  locate(path: string): Promise<Outcome<Located>>
  /** The nearest existing directory on `path`. The caller closes `ancestor`. */
  nearestAncestor(path: string): Promise<Outcome<Ancestor>>
}>

export type HostPathsCore = Readonly<{
  rooted: boolean
  /** Paths whose handles that fail to close go to `close`. */
  bind(close: CloseHandle): HostPaths
}>

export type HostPathsOptions = Readonly<{
  root?: string | undefined
  /** Where the P2 probe makes its temporary directory. */
  probeDirectory?: string | undefined
}>

type RootBinding = Readonly<{
  path: string
  segments: readonly string[]
  dev: bigint
  ino: bigint
}>

function segmentsOf(path: string): readonly string[] {
  return path.split('/').filter(segment => segment !== '' && segment !== '.')
}

async function bindRoot(root: string): Promise<RootBinding | undefined> {
  try {
    const real = await realpath(root)
    const opened = await open(real, constants.O_RDONLY | constants.O_DIRECTORY)
    try {
      const stat = await opened.stat({ bigint: true })
      return { path: real, segments: segmentsOf(real), dev: stat.dev, ino: stat.ino }
    } finally {
      await opened.close().catch(() => undefined)
    }
  } catch {
    return undefined
  }
}

/** The segments of `path` below the root, or `outside`. A `..` anywhere is outside. */
function belowRoot(binding: RootBinding, path: string): readonly string[] | 'outside' {
  const segments = segmentsOf(path)
  if (segments.includes('..')) return 'outside'
  if (segments.length < binding.segments.length) return 'outside'
  for (const [index, segment] of binding.segments.entries())
    if (segments[index] !== segment) return 'outside'
  return segments.slice(binding.segments.length)
}

/** Where a path is split for a call that works on the last segment: the directory and the name. */
function splitLast(path: string): Readonly<{ directory: string; name: string }> | undefined {
  const stripped = pathWithoutTrailingSlash(path)
  const name = posix.basename(stripped)
  if (name === '' || name === '.' || name === '..') return undefined
  return { directory: posix.dirname(stripped), name }
}

/**
 * The platform state shared by every facade of one engine: the configured root and its recorded
 * identity, and the P2 probe. A failed root binding and an unknown probe are tried again by the
 * next request; a settled probe is kept.
 */
export function createHostPathsCore(options: HostPathsOptions): HostPathsCore {
  const rootPath = options.root
  const rooted = rootPath !== undefined
  let binding: Promise<RootBinding | undefined> | undefined
  let probe: Promise<ProviderFacts['prerequisites']> | undefined

  const rootBinding = async (): Promise<RootBinding | undefined> => {
    if (rootPath === undefined) return undefined
    binding ??= bindRoot(rootPath)
    const found = await binding
    if (found === undefined) binding = undefined
    return found
  }

  const prerequisite = async (): Promise<ProviderFacts['prerequisites']> => {
    if (process.platform !== 'linux') return 'unsatisfied'
    probe ??= probeHostFilesPrerequisite(options.probeDirectory)
    const found = await probe
    if (found === 'unknown') probe = undefined
    return found
  }

  const bind = (close: CloseHandle): HostPaths => {
    /** Opens the root again and checks that it is the directory recorded at the start. */
    const openRoot = async (): Promise<
      Outcome<Readonly<{ handle: FileHandle; dev: bigint; binding: RootBinding }>>
    > => {
      const recorded = await rootBinding()
      if (recorded === undefined) return fail('unavailable')
      let handle: FileHandle
      try {
        handle = await open(recorded.path, constants.O_RDONLY | constants.O_DIRECTORY)
      } catch (error) {
        const code = errorCode(error)
        return fail(code === 'ENOENT' || code === 'ENOTDIR' ? 'notAuthorized' : 'unknown')
      }
      try {
        const stat = await handle.stat({ bigint: true })
        if (stat.dev === recorded.dev && stat.ino === recorded.ino)
          return ok({ handle, dev: stat.dev, binding: recorded })
      } catch {
        await close(handle)
        return fail('unknown')
      }
      await close(handle)
      return fail('notAuthorized')
    }

    /** Why a directory step failed, found while its parent is still open. */
    const directoryFailure = async (
      parent: FileHandle,
      name: string,
      error: unknown,
      targetEnd: boolean,
    ): Promise<Failure> => {
      const code = errorCode(error)
      if (code === 'ENOTDIR' || code === 'ELOOP') {
        try {
          const entry = await lstat(fdPath(parent, name))
          if (targetEnd) return 'unsupported'
          return entry.isSymbolicLink() ? 'notAuthorized' : 'unresolved'
        } catch (inner) {
          return errorCode(inner) === 'ENOENT' ? 'unresolved' : 'unknown'
        }
      }
      if (code === 'ENOENT') return 'unresolved'
      if (code === 'EACCES' || code === 'EPERM') return 'notAuthorized'
      return 'unknown'
    }

    /** Opens `names` one below the other from `start`, never following a link. Closes `start`. */
    const descend = async (
      start: FileHandle,
      dev: bigint,
      names: readonly string[],
      role: DirectoryRole,
    ): Promise<Outcome<FileHandle>> => {
      let current = start
      for (const [index, name] of names.entries()) {
        const targetEnd = role === 'target' && index === names.length - 1
        let next: FileHandle
        try {
          next = await open(fdPath(current, name), directoryFlags)
        } catch (error) {
          const failure = await directoryFailure(current, name, error, targetEnd)
          await close(current)
          return fail(failure)
        }
        let nextDev: bigint
        try {
          nextDev = (await next.stat({ bigint: true })).dev
        } catch {
          await close(next)
          await close(current)
          return fail('unknown')
        }
        await close(current)
        if (nextDev !== dev) {
          await close(next)
          return fail('notAuthorized')
        }
        current = next
      }
      return ok(current)
    }

    const checkPath = async (path: string): Promise<Failure | undefined> => {
      if ((await prerequisite()) !== 'satisfied') return 'unavailable'
      const recorded = await rootBinding()
      if (recorded === undefined) return 'unavailable'
      return belowRoot(recorded, path) === 'outside' ? 'notAuthorized' : undefined
    }

    const openDirectory = async (
      path: string,
      role: DirectoryRole,
    ): Promise<Outcome<FileHandle>> => {
      if (!rooted) {
        const opening = pathWithoutTrailingSlash(path)
        try {
          return ok(await open(opening, directoryFlags))
        } catch (error) {
          if (errorCode(error) === 'ENOTDIR' && role === 'target') {
            // The path leads through directories to an entry that is not one, or to nothing.
            try {
              await lstat(opening)
              return fail('unsupported')
            } catch {
              return fail('unresolved')
            }
          }
          return fail(mapped(openCodes, error) ?? 'unknown')
        }
      }
      const recorded = await rootBinding()
      if (recorded === undefined) return fail('unavailable')
      const below = belowRoot(recorded, path)
      if (below === 'outside') return fail('notAuthorized')
      const root = await openRoot()
      if (!root.ok) return root
      return descend(root.value.handle, root.value.dev, below, role)
    }

    const locate = async (path: string): Promise<Outcome<Located>> => {
      if (!rooted) {
        const split = splitLast(path)
        if (split === undefined) return fail('invalidInput')
        const parent = await openDirectory(split.directory, 'parent')
        if (!parent.ok) return parent
        return ok({ parent: parent.value, name: split.name, isRoot: false })
      }
      const recorded = await rootBinding()
      if (recorded === undefined) return fail('unavailable')
      const below = belowRoot(recorded, path)
      if (below === 'outside') return fail('notAuthorized')
      const root = await openRoot()
      if (!root.ok) return root
      const name = below.at(-1)
      if (name === undefined) return ok({ parent: root.value.handle, name: '.', isRoot: true })
      const parent = await descend(root.value.handle, root.value.dev, below.slice(0, -1), 'parent')
      if (!parent.ok) return parent
      return ok({ parent: parent.value, name, isRoot: false })
    }

    const nearestAncestor = async (path: string): Promise<Outcome<Ancestor>> => {
      if (!rooted) {
        const split = splitLast(path)
        if (split === undefined) return fail('invalidInput')
        const rest = [split.name]
        let directory = split.directory
        for (;;) {
          const opened = await openDirectory(directory, 'parent')
          if (opened.ok) return ok({ ancestor: opened.value, rest })
          if (opened.failure !== 'unresolved' || directory === '/') return opened
          const up = splitLast(directory)
          if (up === undefined) return fail('invalidInput')
          rest.unshift(up.name)
          directory = up.directory
        }
      }
      const recorded = await rootBinding()
      if (recorded === undefined) return fail('unavailable')
      const below = belowRoot(recorded, path)
      if (below === 'outside') return fail('notAuthorized')
      const root = await openRoot()
      if (!root.ok) return root
      let current = root.value.handle
      for (const [index, name] of below.entries()) {
        let next: FileHandle
        try {
          next = await open(fdPath(current, name), directoryFlags)
        } catch (error) {
          const code = errorCode(error)
          if (code === 'ENOENT') return ok({ ancestor: current, rest: below.slice(index) })
          const last = index === below.length - 1
          let failure: Failure = 'unknown'
          if (code === 'ENOTDIR' || code === 'ELOOP') {
            const entry = await lstat(fdPath(current, name)).catch(() => undefined)
            failure =
              entry === undefined
                ? 'unresolved'
                : last
                  ? 'conflict'
                  : entry.isSymbolicLink()
                    ? 'notAuthorized'
                    : 'conflict'
          } else if (code === 'EACCES' || code === 'EPERM') failure = 'notAuthorized'
          await close(current)
          return fail(failure)
        }
        let nextDev: bigint
        try {
          nextDev = (await next.stat({ bigint: true })).dev
        } catch {
          await close(next)
          await close(current)
          return fail('unknown')
        }
        await close(current)
        if (nextDev !== root.value.dev) {
          await close(next)
          return fail('notAuthorized')
        }
        current = next
      }
      return ok({ ancestor: current, rest: [] })
    }

    return Object.freeze({
      rooted,
      async available() {
        if ((await prerequisite()) !== 'satisfied') return false
        return !rooted || (await rootBinding()) !== undefined
      },
      checkPath,
      openDirectory,
      locate,
      nearestAncestor,
    })
  }

  return Object.freeze({ rooted, bind })
}

/**
 * What every operation checks last before it opens anything: a rooted path must lie below the
 * root (no file system call beyond binding the root), then the host must be able to serve at all.
 * Undefined means the operation may go on.
 */
export async function gate(
  paths: HostPaths,
  requestId: string,
  targets: readonly string[],
): Promise<FacilityResult<never> | undefined> {
  if (paths.rooted)
    for (const target of targets) {
      const refusal = await paths.checkPath(target)
      if (refusal !== undefined) return failed(requestId, refusal, 'notFound')
    }
  return (await paths.available()) ? undefined : reject(requestId, 'unavailable')
}
