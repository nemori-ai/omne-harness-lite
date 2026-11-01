import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, rename, rmdir, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import type {
  EnvironmentBinding,
  FacilityResult,
  FileIdentity,
  FileInformation,
  FileRequest,
  FileSystemFacility,
  FileTarget,
  FileVersion,
  HandleGeneration,
  ObjectToken,
} from '@omne-harness/execution-environment-contract'
import {
  changeFailure,
  directoryFlags,
  errorCode,
  fail,
  failed,
  fdDir,
  fdPath,
  gate,
  isHostPath,
  mapped,
  ok,
  openCodes,
  reject,
  renameCodes,
  tokenOf,
  unknown,
  versionOf,
  type CloseHandle,
  type Failure,
  type FileStats,
  type HostPaths,
  type Located,
  type Outcome,
} from './host-paths.ts'

/** Bounds of listing and searching. Their values are configuration; these are the initial values. */
export type HostFilesLimits = Readonly<{
  /** The most entries one `list` or `search` page returns. */
  listPageLimit: number
  /** The most directory entries one `search` looks at. */
  searchEntryBudget: number
  /** The most content bytes one `search` reads. */
  searchByteBudget: number
  /** The largest file one `search` reads; a larger file is skipped. */
  searchFileBytes: number
}>

export const defaultHostFilesLimits: HostFilesLimits = Object.freeze({
  listPageLimit: 1000,
  searchEntryBudget: 10_000,
  searchByteBudget: 64 * 1024 * 1024,
  searchFileBytes: 8 * 1024 * 1024,
})

/** The limits with the overrides applied. Every limit must be a positive safe integer. */
export function hostFilesLimits(overrides: Partial<HostFilesLimits> = {}): HostFilesLimits {
  const limits = { ...defaultHostFilesLimits, ...overrides }
  for (const [name, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new RangeError(`${name} must be a positive safe integer`)
  return Object.freeze(limits)
}

/** What the tree operations need from the engine that owns the facade. */
export type FileTreeEnvironment = Readonly<{
  paths: HostPaths
  limits: HostFilesLimits
  /** Closes a descriptor; one that fails to close stays with the owner of the facade. */
  close: CloseHandle
  /** Registers an object in the handle table of the engine. */
  issue(object: ObjectToken): HandleGeneration
  /** Retries the failed closes of the facade's owner. */
  drain(): Promise<void>
}>

export type FileTree = Pick<
  FileSystemFacility<unknown>,
  'list' | 'search' | 'mkdir' | 'remove' | 'move' | 'copy'
>

type Page = Readonly<{ offset: number; limit: number }>

function pageOf(
  offset: number | undefined,
  limit: number | undefined,
  max: number,
): Page | undefined {
  const start = offset ?? 0
  const size = limit ?? max
  if (!Number.isSafeInteger(start) || start < 0) return undefined
  if (!Number.isSafeInteger(size) || size < 1 || size > max) return undefined
  return { offset: start, limit: size }
}

const byBytes = (left: string, right: string) =>
  Buffer.compare(Buffer.from(left), Buffer.from(right))

/**
 * The names in a directory in byte order. A name that is not valid UTF-8 cannot be written in a
 * path of this contract; it is left out and `lossy` says so.
 */
async function entryNames(
  directory: FileHandle,
): Promise<Readonly<{ names: string[]; lossy: boolean }>> {
  const raw = await readdir(fdDir(directory), { encoding: 'buffer' })
  const names: string[] = []
  let lossy = false
  for (const entry of raw) {
    const text = entry.toString('utf8')
    if (Buffer.from(text, 'utf8').equals(entry)) names.push(text)
    else lossy = true
  }
  return { names: names.sort(byBytes), lossy }
}

function typeOf(stat: FileStats): FileInformation['type'] {
  if (stat.isSymbolicLink()) return 'symlink'
  return stat.isDirectory() ? 'directory' : 'file'
}

/** A path with no trailing slash, for naming entries below it. */
function directoryPrefix(path: string): string {
  let current = path
  while (current.length > 1 && current.endsWith('/')) current = current.slice(0, -1)
  return current === '/' ? '' : current
}

/** The tree operations of the host files facility: list, search, mkdir, remove, move and copy. */
export function createHostFileTree(env: FileTreeEnvironment): FileTree {
  const { paths, limits } = env

  const identityOf = (stat: FileStats): FileIdentity => {
    const object = tokenOf(stat)
    return { object, handle: env.issue(object), version: versionOf(stat) }
  }

  const informationOf = (stat: FileStats): FileInformation => ({
    ...identityOf(stat),
    type: typeOf(stat),
    sizeBytes: Number(stat.size),
    modifiedMs: Number(stat.mtimeMs),
  })

  /** The checks every operation makes before it opens anything. */
  async function begin(
    requestId: string,
    bindingKind: EnvironmentBinding['kind'],
    targets: readonly string[],
    nameds: readonly (ObjectToken | null)[],
  ): Promise<FacilityResult<never> | undefined> {
    if (bindingKind !== 'host_machine') return reject(requestId, 'unsupported')
    if (!targets.every(isHostPath)) return reject(requestId, 'invalidInput')
    if (nameds.some(named => named === null || named.token === ''))
      return reject(requestId, 'notAuthorized')
    await env.drain()
    return gate(paths, requestId, targets)
  }

  async function entryAt(
    directory: FileHandle,
    name: string,
  ): Promise<Outcome<FileStats | undefined>> {
    try {
      return ok(await lstat(fdPath(directory, name), { bigint: true }))
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return ok(undefined)
      return fail(mapped(openCodes, error) ?? 'unknown')
    }
  }

  async function identityAt(
    directory: FileHandle,
    name: string,
  ): Promise<FileIdentity | undefined> {
    try {
      return identityOf(await lstat(fdPath(directory, name), { bigint: true }))
    } catch {
      return undefined
    }
  }

  async function list(
    request: Parameters<FileSystemFacility<unknown>['list']>[0],
  ): ReturnType<FileSystemFacility<unknown>['list']> {
    const { requestId } = request
    const early = await begin(requestId, request.binding.kind, [request.path], [request.named])
    if (early !== undefined) return early
    const page = pageOf(request.offset, request.limit, limits.listPageLimit)
    if (page === undefined) return reject(requestId, 'invalidInput')
    const opened = await paths.openDirectory(request.path, 'target')
    if (!opened.ok) return failed(requestId, opened.failure, 'unresolved')
    const directory = opened.value
    try {
      const stat = await directory.stat({ bigint: true })
      if (tokenOf(stat).token !== request.named?.token) return reject(requestId, 'conflict')
      const { names } = await entryNames(directory)
      const slice = names.slice(page.offset, page.offset + page.limit)
      const entries: FileInformation[] = []
      for (const name of slice)
        entries.push(informationOf(await lstat(fdPath(directory, name), { bigint: true })))
      const next = page.offset + slice.length
      return {
        kind: 'done',
        requestId,
        value: {
          directory: identityOf(stat),
          entries,
          ...(next < names.length ? { nextOffset: next } : {}),
        },
      }
    } catch {
      return unknown(requestId)
    } finally {
      await env.close(directory)
    }
  }

  type Hit = { path: string; object: ObjectToken; offsetBytes?: number }
  type Walk = 'continue' | 'enough' | 'budget' | Failure

  async function search(
    request: Parameters<FileSystemFacility<unknown>['search']>[0],
  ): ReturnType<FileSystemFacility<unknown>['search']> {
    const { requestId } = request
    const early = await begin(requestId, request.binding.kind, [request.path], [request.named])
    if (early !== undefined) return early
    const page = pageOf(request.offset, request.limit, limits.listPageLimit)
    if (page === undefined || request.pattern.byteLength === 0)
      return reject(requestId, 'invalidInput')
    const opened = await paths.openDirectory(request.path, 'target')
    if (!opened.ok) return failed(requestId, opened.failure, 'notFound')
    const start = opened.value
    try {
      const startStat = await start.stat({ bigint: true })
      if (tokenOf(startStat).token !== request.named?.token) return reject(requestId, 'conflict')

      const pattern = Buffer.from(request.pattern)
      const want = page.offset + page.limit + 1
      const hits: Hit[] = []
      const spent = { entries: 0, bytes: 0, truncated: false }

      /** Reads a file for the pattern, within the budgets; a hit is added to `hits`. */
      const readFor = async (
        directory: FileHandle,
        name: string,
        entryPath: string,
        info: FileStats,
      ): Promise<Walk> => {
        if (info.size > BigInt(limits.searchFileBytes)) {
          spent.truncated = true
          return 'continue'
        }
        if (spent.bytes + Number(info.size) > limits.searchByteBudget) {
          spent.truncated = true
          return 'budget'
        }
        let file: FileHandle
        try {
          file = await open(
            fdPath(directory, name),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          )
        } catch (error) {
          const code = errorCode(error)
          return code === 'ELOOP' || code === 'ENOENT' ? 'continue' : 'unknown'
        }
        try {
          const stat = await file.stat({ bigint: true })
          if (!stat.isFile()) return 'continue'
          if (paths.rooted && stat.nlink > 1n) return 'notAuthorized'
          const bytes = await file.readFile()
          spent.bytes += bytes.byteLength
          const at = bytes.indexOf(pattern)
          if (at >= 0) hits.push({ path: entryPath, object: tokenOf(info), offsetBytes: at })
          return 'continue'
        } catch {
          return 'unknown'
        } finally {
          await env.close(file)
        }
      }

      const visit = async (directory: FileHandle, prefix: string): Promise<Walk> => {
        let names: string[]
        try {
          names = (await entryNames(directory)).names
        } catch {
          return 'unknown'
        }
        for (const name of names) {
          if (++spent.entries > limits.searchEntryBudget) {
            spent.truncated = true
            return 'budget'
          }
          let info: FileStats
          try {
            info = await lstat(fdPath(directory, name), { bigint: true })
          } catch {
            return 'unknown'
          }
          const entryPath = `${prefix}/${name}`
          if (request.match === 'name') {
            if (Buffer.from(name).includes(pattern))
              hits.push({ path: entryPath, object: tokenOf(info) })
          } else if (info.isFile()) {
            const read = await readFor(directory, name, entryPath, info)
            if (read !== 'continue') return read
          }
          if (hits.length >= want) return 'enough'
          if (request.recursive && info.isDirectory() && info.dev === startStat.dev) {
            let child: FileHandle
            try {
              child = await open(fdPath(directory, name), directoryFlags)
            } catch (error) {
              const code = errorCode(error)
              if (code === 'ENOTDIR' || code === 'ELOOP' || code === 'ENOENT') continue
              return 'unknown'
            }
            try {
              const inner = await visit(child, entryPath)
              if (inner !== 'continue') return inner
            } finally {
              await env.close(child)
            }
          }
        }
        return 'continue'
      }

      const walked = await visit(start, directoryPrefix(request.path))
      if (walked !== 'continue' && walked !== 'enough' && walked !== 'budget')
        return failed(requestId, walked, 'notFound')
      const end = page.offset + page.limit
      return {
        kind: 'done',
        requestId,
        value: {
          root: identityOf(startStat),
          hits: hits.slice(page.offset, end),
          ...(hits.length > end ? { nextOffset: end } : {}),
          truncated: spent.truncated,
        },
      }
    } catch {
      return unknown(requestId)
    } finally {
      await env.close(start)
    }
  }

  /** The new directory below `parent`, opened without following a link, as an identity. */
  async function newDirectoryIdentity(
    parent: FileHandle,
    name: string,
  ): Promise<FileIdentity | undefined> {
    let made: FileHandle
    try {
      made = await open(fdPath(parent, name), directoryFlags)
    } catch {
      return undefined
    }
    try {
      return identityOf(await made.stat({ bigint: true }))
    } catch {
      return undefined
    } finally {
      await env.close(made)
    }
  }

  async function mkdirOne(
    request: Parameters<FileSystemFacility<unknown>['mkdir']>[0],
  ): ReturnType<FileSystemFacility<unknown>['mkdir']> {
    const { requestId } = request
    const located = await paths.locate(request.path)
    if (!located.ok) return failed(requestId, located.failure, 'notFound')
    const { parent, name, isRoot } = located.value
    try {
      if (isRoot) return reject(requestId, 'conflict')
      if (tokenOf(await parent.stat({ bigint: true })).token !== request.named?.token)
        return reject(requestId, 'conflict')
      try {
        await mkdir(fdPath(parent, name))
      } catch (error) {
        return failed(requestId, changeFailure(error), 'notFound')
      }
      const made = await newDirectoryIdentity(parent, name)
      return made === undefined ? unknown(requestId) : { kind: 'done', requestId, value: made }
    } catch {
      return unknown(requestId)
    } finally {
      await env.close(parent)
    }
  }

  async function mkdirChain(
    request: Parameters<FileSystemFacility<unknown>['mkdir']>[0],
  ): ReturnType<FileSystemFacility<unknown>['mkdir']> {
    const { requestId } = request
    const found = await paths.nearestAncestor(request.path)
    if (!found.ok) return failed(requestId, found.failure, 'notFound')
    let current = found.value.ancestor
    let made = 0
    try {
      if (tokenOf(await current.stat({ bigint: true })).token !== request.named?.token)
        return reject(requestId, 'conflict')
      if (found.value.rest.length === 0) return reject(requestId, 'conflict')
      for (const name of found.value.rest) {
        try {
          await mkdir(fdPath(current, name))
        } catch (error) {
          return made === 0
            ? failed(requestId, changeFailure(error), 'notFound')
            : unknown(requestId)
        }
        made++
        const next = await open(fdPath(current, name), directoryFlags)
        await env.close(current)
        current = next
      }
      return { kind: 'done', requestId, value: identityOf(await current.stat({ bigint: true })) }
    } catch {
      return unknown(requestId)
    } finally {
      await env.close(current)
    }
  }

  async function mkdirRequest(
    request: Parameters<FileSystemFacility<unknown>['mkdir']>[0],
  ): ReturnType<FileSystemFacility<unknown>['mkdir']> {
    const early = await begin(
      request.requestId,
      request.binding.kind,
      [request.path],
      [request.named],
    )
    if (early !== undefined) return early
    return request.parents ? mkdirChain(request) : mkdirOne(request)
  }

  /** Checks a whole subtree can be removed: no entry on another device, no name that cannot be written. */
  async function verifyTree(directory: FileHandle, dev: bigint): Promise<Failure | undefined> {
    let listing: Awaited<ReturnType<typeof entryNames>>
    try {
      listing = await entryNames(directory)
    } catch {
      return 'unknown'
    }
    if (listing.lossy) return 'unsupported'
    for (const name of listing.names) {
      let info: FileStats
      try {
        info = await lstat(fdPath(directory, name), { bigint: true })
      } catch {
        return 'unknown'
      }
      if (!info.isDirectory()) continue
      if (info.dev !== dev) return 'notAuthorized'
      let child: FileHandle
      try {
        child = await open(fdPath(directory, name), directoryFlags)
      } catch {
        return 'unknown'
      }
      try {
        const inner = await verifyTree(child, dev)
        if (inner !== undefined) return inner
      } finally {
        await env.close(child)
      }
    }
    return undefined
  }

  /** Removes everything below a directory, leaves first; throws at the first error. */
  async function deleteTree(directory: FileHandle, dev: bigint): Promise<boolean> {
    for (const name of (await entryNames(directory)).names) {
      const info = await lstat(fdPath(directory, name), { bigint: true })
      if (!info.isDirectory()) {
        await unlink(fdPath(directory, name))
        continue
      }
      if (info.dev !== dev) return false
      const child = await open(fdPath(directory, name), directoryFlags)
      try {
        if (!(await deleteTree(child, dev))) return false
      } finally {
        await env.close(child)
      }
      await rmdir(fdPath(directory, name))
    }
    return true
  }

  async function remove(
    request: Parameters<FileSystemFacility<unknown>['remove']>[0],
  ): ReturnType<FileSystemFacility<unknown>['remove']> {
    const { requestId } = request
    const early = await begin(requestId, request.binding.kind, [request.path], [request.named])
    if (early !== undefined) return early
    const located = await paths.locate(request.path)
    if (!located.ok) return failed(requestId, located.failure, 'notFound')
    const { parent, name, isRoot } = located.value
    try {
      if (isRoot) return reject(requestId, 'notAuthorized')
      const entry = await entryAt(parent, name)
      if (!entry.ok) return failed(requestId, entry.failure, 'notFound')
      const stat = entry.value
      if (stat === undefined) return reject(requestId, 'notFound')
      const object = tokenOf(stat)
      if (object.token !== request.named?.token) return reject(requestId, 'conflict')
      if (request.expectedVersion !== undefined && versionOf(stat) !== request.expectedVersion)
        return reject(requestId, 'conflict')
      const target = fdPath(parent, name)

      if (!stat.isDirectory()) {
        try {
          await unlink(target)
        } catch (error) {
          return failed(requestId, changeFailure(error), 'notFound')
        }
        return { kind: 'done', requestId, value: { removed: object } }
      }
      if (!request.recursive) {
        try {
          await rmdir(target)
        } catch (error) {
          return failed(requestId, changeFailure(error), 'notFound')
        }
        return { kind: 'done', requestId, value: { removed: object } }
      }

      let directory: FileHandle
      try {
        directory = await open(target, directoryFlags)
      } catch (error) {
        return failed(requestId, mapped(openCodes, error) ?? 'unknown', 'notFound')
      }
      try {
        if (tokenOf(await directory.stat({ bigint: true })).token !== object.token)
          return reject(requestId, 'conflict')
        const refusal = await verifyTree(directory, stat.dev)
        if (refusal !== undefined) return failed(requestId, refusal, 'notFound')
        if (!(await deleteTree(directory, stat.dev))) return unknown(requestId)
      } catch {
        return unknown(requestId)
      } finally {
        await env.close(directory)
      }
      try {
        await rmdir(target)
      } catch {
        return unknown(requestId)
      }
      return { kind: 'done', requestId, value: { removed: object } }
    } catch {
      return unknown(requestId)
    } finally {
      await env.close(parent)
    }
  }

  type Endpoints = Readonly<{
    source: Located
    sourceStat: FileStats
    target: Located
    /** The object at the target name, when there is one. */
    targetStat: FileStats | undefined
    release(): Promise<void>
  }>
  type Opened =
    | Readonly<{ kind: 'opened'; endpoints: Endpoints }>
    | Readonly<{ kind: 'refused'; result: FacilityResult<never> }>

  /**
   * Opens the directories of the source and of the target of a move or copy and checks what the
   * request names: the source object and version, and either the target object (when it exists and
   * `replace` is true) or the target's parent directory (when it does not). A refusal has already
   * closed what it opened; an opened pair is released by the operation that uses it.
   */
  async function openEndpoints(
    request: FileRequest<unknown> & {
      readonly target: FileTarget
      readonly replace: boolean
      readonly expectedVersion?: FileVersion
    },
  ): Promise<Opened> {
    const { requestId } = request
    const held: FileHandle[] = []
    const releaseAll = async () => {
      for (const handle of held.splice(0)) await env.close(handle)
    }
    const refused = async (result: FacilityResult<never>): Promise<Opened> => {
      await releaseAll()
      return { kind: 'refused', result }
    }
    const source = await paths.locate(request.path)
    if (!source.ok) return refused(failed(requestId, source.failure, 'notFound'))
    held.push(source.value.parent)
    try {
      if (source.value.isRoot) return await refused(reject(requestId, 'notAuthorized'))
      const sourceEntry = await entryAt(source.value.parent, source.value.name)
      if (!sourceEntry.ok) return await refused(failed(requestId, sourceEntry.failure, 'notFound'))
      const sourceStat = sourceEntry.value
      if (sourceStat === undefined) return await refused(reject(requestId, 'notFound'))
      if (tokenOf(sourceStat).token !== request.named?.token)
        return await refused(reject(requestId, 'conflict'))
      if (
        request.expectedVersion !== undefined &&
        versionOf(sourceStat) !== request.expectedVersion
      )
        return await refused(reject(requestId, 'conflict'))

      const target = await paths.locate(request.target.path)
      if (!target.ok) return await refused(failed(requestId, target.failure, 'notFound'))
      held.push(target.value.parent)
      if (target.value.isRoot) return await refused(reject(requestId, 'notAuthorized'))
      const targetEntry = await entryAt(target.value.parent, target.value.name)
      if (!targetEntry.ok) return await refused(failed(requestId, targetEntry.failure, 'notFound'))
      const targetStat = targetEntry.value
      const named = request.target.named?.token
      if (targetStat !== undefined) {
        if (!request.replace) return await refused(reject(requestId, 'conflict'))
        if (tokenOf(targetStat).token !== named) return await refused(reject(requestId, 'conflict'))
      } else if (tokenOf(await target.value.parent.stat({ bigint: true })).token !== named) {
        return await refused(reject(requestId, 'conflict'))
      }
      return {
        kind: 'opened',
        endpoints: {
          source: source.value,
          sourceStat,
          target: target.value,
          targetStat,
          release: releaseAll,
        },
      }
    } catch {
      return refused(unknown(requestId))
    }
  }

  async function move(
    request: Parameters<FileSystemFacility<unknown>['move']>[0],
  ): ReturnType<FileSystemFacility<unknown>['move']> {
    const { requestId } = request
    const early = await begin(
      requestId,
      request.binding.kind,
      [request.path, request.target.path],
      [request.named, request.target.named],
    )
    if (early !== undefined) return early
    const opened = await openEndpoints(request)
    if (opened.kind === 'refused') return opened.result
    const { source, target, sourceStat } = opened.endpoints
    const from = fdPath(source.parent, source.name)
    const to = fdPath(target.parent, target.name)
    try {
      if (request.replace || sourceStat.isDirectory()) {
        try {
          await rename(from, to)
        } catch (error) {
          return failed(requestId, changeFailure(error, renameCodes), 'notFound')
        }
      } else {
        // `link` fails when the target exists, so a file is never replaced; then the old name goes.
        try {
          await link(from, to)
        } catch (error) {
          return failed(requestId, changeFailure(error), 'notFound')
        }
        try {
          await unlink(from)
        } catch {
          return unknown(requestId)
        }
      }
      const identity = await identityAt(target.parent, target.name)
      if (identity === undefined) return unknown(requestId)
      return { kind: 'done', requestId, value: { source: tokenOf(sourceStat), target: identity } }
    } catch {
      return unknown(requestId)
    } finally {
      await opened.endpoints.release()
    }
  }

  /** Copies the bytes of one open file into another, a chunk at a time. */
  async function pump(from: FileHandle, to: FileHandle): Promise<void> {
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let position = 0
    for (;;) {
      const { bytesRead } = await from.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) return
      let written = 0
      while (written < bytesRead) {
        const { bytesWritten } = await to.write(buffer, written, bytesRead - written)
        if (bytesWritten <= 0) throw new Error('a write made no progress')
        written += bytesWritten
      }
      position += bytesRead
    }
  }

  const createFlags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW

  async function copy(
    request: Parameters<FileSystemFacility<unknown>['copy']>[0],
  ): ReturnType<FileSystemFacility<unknown>['copy']> {
    const { requestId } = request
    const early = await begin(
      requestId,
      request.binding.kind,
      [request.path, request.target.path],
      [request.named, request.target.named],
    )
    if (early !== undefined) return early
    const opened = await openEndpoints(request)
    if (opened.kind === 'refused') return opened.result
    const { source, target, sourceStat, targetStat } = opened.endpoints
    try {
      if (!sourceStat.isFile()) return reject(requestId, 'unsupported')
      if (targetStat?.isDirectory()) return reject(requestId, 'unsupported')

      let input: FileHandle
      try {
        input = await open(
          fdPath(source.parent, source.name),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        )
      } catch (error) {
        return failed(requestId, mapped(openCodes, error) ?? 'unknown', 'notFound')
      }
      try {
        const stat = await input.stat({ bigint: true })
        if (!stat.isFile() || tokenOf(stat).token !== tokenOf(sourceStat).token)
          return reject(requestId, 'conflict')
        if (paths.rooted && stat.nlink > 1n) return reject(requestId, 'notAuthorized')
        const mode = Number(stat.mode & 0o777n)
        const result = request.replace
          ? await copyReplacing(requestId, input, target, mode)
          : await copyNew(requestId, input, target, mode)
        if (result !== undefined) return result
        const identity = await identityAt(target.parent, target.name)
        if (identity === undefined) return unknown(requestId)
        return { kind: 'done', requestId, value: { source: tokenOf(sourceStat), target: identity } }
      } catch {
        return unknown(requestId)
      } finally {
        await env.close(input)
      }
    } finally {
      await opened.endpoints.release()
    }
  }

  /** Writes the target exclusively; undefined is success. */
  async function copyNew(
    requestId: string,
    input: FileHandle,
    target: Located,
    mode: number,
  ): Promise<FacilityResult<never> | undefined> {
    let output: FileHandle
    try {
      output = await open(fdPath(target.parent, target.name), createFlags, mode)
    } catch (error) {
      return failed(requestId, changeFailure(error), 'notFound')
    }
    try {
      await pump(input, output)
      return undefined
    } catch {
      // The target name exists and holds a part of the bytes.
      return unknown(requestId)
    } finally {
      await env.close(output)
    }
  }

  /** Writes a temporary file beside the target, then renames it over the target; undefined is success. */
  async function copyReplacing(
    requestId: string,
    input: FileHandle,
    target: Located,
    mode: number,
  ): Promise<FacilityResult<never> | undefined> {
    const temporary = fdPath(target.parent, `.omne-copy-${randomUUID()}`)
    let output: FileHandle
    try {
      output = await open(temporary, createFlags, mode)
    } catch (error) {
      return failed(requestId, changeFailure(error), 'notFound')
    }
    /** The temporary file is gone and the target is as it was, or the state is not known. */
    const discard = async (error: unknown): Promise<FacilityResult<never>> => {
      try {
        await unlink(temporary)
      } catch {
        return unknown(requestId)
      }
      return failed(requestId, changeFailure(error), 'notFound')
    }
    try {
      await pump(input, output)
      await output.sync()
    } catch (error) {
      await env.close(output)
      return discard(error)
    }
    await env.close(output)
    try {
      await rename(temporary, fdPath(target.parent, target.name))
    } catch (error) {
      return discard(error)
    }
    return undefined
  }

  return Object.freeze({ list, search, mkdir: mkdirRequest, remove, move, copy })
}
