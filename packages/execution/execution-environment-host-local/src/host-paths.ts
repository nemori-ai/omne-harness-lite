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

export type FileStats = BigIntStats

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

export function isHostPath(path: string): boolean {
  return isAbsolute(path) && !path.includes('\0')
}

export function pathWithoutTrailingSlash(path: string): string {
  let current = path
  while (current.length > 1 && current.endsWith('/')) current = current.slice(0, -1)
  return current
}

export function fdDir(directory: FileHandle): string {
  return `/proc/self/fd/${directory.fd}`
}

export function fdPath(directory: FileHandle, name: string): string {
  return `${fdDir(directory)}/${name}`
}

export async function probeHostFilesPrerequisite(
  directory: string = tmpdir(),
): Promise<ProviderFacts['prerequisites']> {
  if (process.platform === 'darwin') {
    const { probeMacosFilesPrerequisite } = await import('./macos-files/prerequisite.ts')
    return probeMacosFilesPrerequisite(directory)
  }
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

export type Located = Readonly<{
  parent: FileHandle
  name: string
  isRoot: boolean
}>

export type Ancestor = Readonly<{ ancestor: FileHandle; rest: readonly string[] }>

export type HostPaths = Readonly<{
  rooted: boolean
  available(): Promise<boolean>
  checkPath(path: string): Promise<Failure | undefined>
  openDirectory(path: string, role: DirectoryRole): Promise<Outcome<FileHandle>>
  locate(path: string): Promise<Outcome<Located>>
  nearestAncestor(path: string): Promise<Outcome<Ancestor>>
}>

export type HostPathsCore = Readonly<{
  rooted: boolean
  bind(close: CloseHandle): HostPaths
}>

export type HostPathsOptions = Readonly<{
  root?: string | undefined
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

function belowRoot(binding: RootBinding, path: string): readonly string[] | 'outside' {
  const segments = segmentsOf(path)
  if (segments.includes('..')) return 'outside'
  if (segments.length < binding.segments.length) return 'outside'
  for (const [index, segment] of binding.segments.entries())
    if (segments[index] !== segment) return 'outside'
  return segments.slice(binding.segments.length)
}

function splitLast(path: string): Readonly<{ directory: string; name: string }> | undefined {
  const stripped = pathWithoutTrailingSlash(path)
  const name = posix.basename(stripped)
  if (name === '' || name === '.' || name === '..') return undefined
  return { directory: posix.dirname(stripped), name }
}

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

    const crossStep = async (
      current: FileHandle,
      next: FileHandle,
      dev: bigint,
    ): Promise<Outcome<FileHandle>> => {
      let nextDev: bigint
      try {
        nextDev = (await next.stat({ bigint: true })).dev
      } catch {
        await close(next)
        await close(current)
        return fail('unknown')
      }
      await close(current)
      if (nextDev === dev) return ok(next)
      await close(next)
      return fail('notAuthorized')
    }

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
        const stepped = await crossStep(current, next, dev)
        if (!stepped.ok) return stepped
        current = stepped.value
      }
      return ok(current)
    }

    /** Judged against the recorded root first, so a path outside the root or with `..` is refused
     *  before the prerequisite probe makes anything in the state directory. */
    const checkPath = async (path: string): Promise<Failure | undefined> => {
      if (process.platform !== 'linux') return 'unavailable'
      const recorded = await rootBinding()
      if (recorded === undefined) return 'unavailable'
      if (belowRoot(recorded, path) === 'outside') return 'notAuthorized'
      return (await prerequisite()) === 'satisfied' ? undefined : 'unavailable'
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

    const ancestorFailure = async (
      parent: FileHandle,
      name: string,
      error: unknown,
      last: boolean,
    ): Promise<Failure> => {
      const code = errorCode(error)
      if (code === 'EACCES' || code === 'EPERM') return 'notAuthorized'
      if (code !== 'ENOTDIR' && code !== 'ELOOP') return 'unknown'
      const entry = await lstat(fdPath(parent, name)).catch(() => undefined)
      if (entry === undefined) return 'unresolved'
      return last || !entry.isSymbolicLink() ? 'conflict' : 'notAuthorized'
    }

    const nearestUnrooted = async (path: string): Promise<Outcome<Ancestor>> => {
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

    const climb = async (
      start: FileHandle,
      dev: bigint,
      below: readonly string[],
    ): Promise<Outcome<Ancestor>> => {
      let current = start
      for (const [index, name] of below.entries()) {
        let next: FileHandle
        try {
          next = await open(fdPath(current, name), directoryFlags)
        } catch (error) {
          if (errorCode(error) === 'ENOENT')
            return ok({ ancestor: current, rest: below.slice(index) })
          const failure = await ancestorFailure(current, name, error, index === below.length - 1)
          await close(current)
          return fail(failure)
        }
        const stepped = await crossStep(current, next, dev)
        if (!stepped.ok) return stepped
        current = stepped.value
      }
      return ok({ ancestor: current, rest: [] })
    }

    const nearestAncestor = async (path: string): Promise<Outcome<Ancestor>> => {
      if (!rooted) return nearestUnrooted(path)
      const recorded = await rootBinding()
      if (recorded === undefined) return fail('unavailable')
      const below = belowRoot(recorded, path)
      if (below === 'outside') return fail('notAuthorized')
      const root = await openRoot()
      if (!root.ok) return root
      return climb(root.value.handle, root.value.dev, below)
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
