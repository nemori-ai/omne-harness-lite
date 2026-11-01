import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type {
  EnvironmentBinding,
  FacilityResult,
  FileIdentity,
  FileSystemFacility,
  FileVersion,
  HandleGeneration,
  ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { createHostFileBatch } from './host-file-batch.ts'
import { createHostFileTree, hostFilesLimits, type HostFilesLimits } from './host-file-tree.ts'
import {
  createCodes,
  createHostPathsCore,
  openCodes,
  failed,
  fdPath,
  gate,
  isHostPath,
  errorCode,
  mapped,
  pathWithoutTrailingSlash,
  reject,
  tokenOf,
  unknown,
  versionOf,
  type FileStats,
} from './host-paths.ts'

export type { HostFilesLimits } from './host-file-tree.ts'

export async function hostObjectToken(path: string): Promise<ObjectToken> {
  const stat = await lstat(path, { bigint: true })
  return { token: `${stat.dev}:${stat.ino}` }
}

/**
 * `O_NOFOLLOW` where the host has it. Node on Windows has none, and its `open` follows a final
 * link; there `finalEntryIsOpened` refuses the link after the open instead.
 */
const noFollow: number | undefined = constants.O_NOFOLLOW

/**
 * For a host without `O_NOFOLLOW`: after the open, the final entry of the path must be the opened
 * object itself. A link answers `unsupported`, as `ELOOP` does on POSIX; another object answers
 * `conflict`, because the path no longer names what was opened. A path that ends in `.` or `..`
 * ends in no link on POSIX and resolves only through a directory; Windows folds such a path
 * before the lookup, so here it must have opened a directory, else it is `unresolved` as
 * `ENOTDIR` is on POSIX.
 */
async function finalEntryIsOpened(
  path: string,
  opened: FileStats,
): Promise<'opened' | 'unresolved' | 'unsupported' | 'conflict'> {
  const last = path.split(/[\\/]/u).findLast(segment => segment !== '')
  if (last === '.' || last === '..') return opened.isDirectory() ? 'opened' : 'unresolved'
  const entry = await lstat(path, { bigint: true })
  if (entry.isSymbolicLink()) return 'unsupported'
  return entry.dev === opened.dev && entry.ino === opened.ino ? 'opened' : 'conflict'
}

/** The refusal a host without `O_NOFOLLOW` owes after the open, or none when the final entry is the opened object. */
async function refusalAfterOpen(
  requestId: string,
  path: string,
  opened: FileStats,
): Promise<
  { readonly kind: 'unresolved'; readonly requestId: string } | FacilityResult<never> | undefined
> {
  if (noFollow !== undefined) return undefined
  const final = await finalEntryIsOpened(path, opened)
  if (final === 'opened') return undefined
  return final === 'unresolved' ? { kind: 'unresolved', requestId } : reject(requestId, final)
}

function openFailure(requestId: string, error: unknown): FacilityResult<never> {
  return failed(requestId, mapped(openCodes, error) ?? 'unknown', 'unresolved')
}

function isByteCount(value: number | undefined): boolean {
  return value === undefined || (Number.isSafeInteger(value) && value >= 0)
}

function issuedKey(handle: HandleGeneration): string {
  return `${handle.object.token}\0${handle.generation}`
}

const internalState = new WeakMap<
  FileSystemFacility<unknown>,
  { readonly pendingCloseCount: () => number }
>()

/**
 * Exposes internal state for tests only. Not part of the public package contract.
 * @internal
 */
export function __unsafeHostFilesState(files: FileSystemFacility<unknown>): {
  readonly pendingCloseCount: number
} {
  const state = internalState.get(files)
  return { pendingCloseCount: state?.pendingCloseCount() ?? 0 }
}

/**
 * The shared host files engine. Every issued handle and every descriptor kept after a failed close
 * carries the owner the facade gave; a request cannot rewrite it. Handle generations are unique in
 * the engine, so two owners never collide on the same object token.
 */
export type HostFilesEngine = Readonly<{
  /** A facility whose handles and failed closes belong to `owner`. */
  facilityFor(owner: string): FileSystemFacility<unknown>
  /** Retries every failed close of `owner`; answers how many descriptors are still open. */
  closeOwned(owner: string): Promise<number>
  /** Descriptors of `owner` still open after a failed close. */
  openCount(owner: string): number
  /** Whether a host file root is configured: every request is then bound to it. */
  readonly hasRoot: boolean
  /**
   * Closes the facade of `owner` to new operations and stops its running batches before the next
   * publication. The facade registry calls it when a release begins.
   */
  seal(owner: string): void
}>

/** The configuration of the host files engine. Without options the engine behaves as it always did. */
export type HostFilesEngineOptions = Readonly<{
  /** An absolute path. When given, every path of every operation must lie below it. */
  root?: string
  /** An absolute path where the manifests of file batches are kept. Without it batches answer `unavailable`. */
  stateDirectory?: string
}>

/**
 * The host `files` facility. Every operation acts on the object the request names. Without a
 * Linux host the eight operations beyond `read`, `stat`, `write` and `close` answer `unavailable`
 * without touching the file system.
 */
export function createHostFiles(): FileSystemFacility<unknown> {
  return createHostFilesEngine().facilityFor('host-files')
}

function absolutePath(name: string, value: string | undefined): void {
  if (value !== undefined && (!isAbsolute(value) || value.includes('\0')))
    throw new TypeError(`${name} must be an absolute path`)
}

/**
 * Creates the shared engine of host file use. The provider gives each acquisition its own owner.
 * `limits` overrides the bounds of listing and searching; they are configuration, the defaults
 * only initial values.
 */
export function createHostFilesEngine(
  options: HostFilesEngineOptions = {},
  limits?: Partial<HostFilesLimits>,
): HostFilesEngine {
  absolutePath('root', options.root)
  absolutePath('stateDirectory', options.stateDirectory)
  const bounds = hostFilesLimits(limits)
  const core = createHostPathsCore({
    root: options.root,
    probeDirectory: options.stateDirectory,
  })
  /** The process instance of this engine; batches name it, so another process can tell they are not its own. */
  const generation = randomUUID()
  const running = new Set<string>()
  const sealed = new Set<string>()

  /** Issued handles with their owner. A missing key means the handle was never issued.
   *  `live: undefined` means the descriptor was already closed successfully.
   *  A `FileHandle` means the previous close attempt failed and the descriptor is still open.
   */
  const handles = new Map<string, { readonly owner: string; live: FileHandle | undefined }>()

  /** Opened descriptors that could not be closed on error paths, with their owner. */
  const pendingClose = new Map<FileHandle, string>()

  let nextGeneration = 1

  const openCount = (owner: string): number => {
    let count = 0
    for (const entry of handles.values()) if (entry.owner === owner && entry.live) count++
    for (const holder of pendingClose.values()) if (holder === owner) count++
    return count
  }

  /** Retries the failed closes of one owner, issued handles and error paths alike. */
  const closeOwned = async (owner: string): Promise<number> => {
    for (const [handle, holder] of pendingClose) {
      if (holder !== owner) continue
      try {
        await handle.close()
        pendingClose.delete(handle)
      } catch {
        // remains with its owner for the next retry
      }
    }
    for (const entry of handles.values()) {
      const live = entry.live
      if (entry.owner !== owner || live === undefined) continue
      try {
        await live.close()
        entry.live = undefined
      } catch {
        // remains open under its issued generation
      }
    }
    return openCount(owner)
  }

  const facilityFor = (owner: string): FileSystemFacility<unknown> => {
    const issue = (object: ObjectToken): HandleGeneration => {
      const handle = { object, generation: String(nextGeneration++) }
      handles.set(issuedKey(handle), { owner, live: undefined })
      return handle
    }

    const closeOrTrack = async (handle: FileHandle): Promise<void> => {
      try {
        await handle.close()
      } catch {
        pendingClose.set(handle, owner)
      }
    }

    /** Closes the descriptor; a failed close keeps it under the issued generation for an explicit close. */
    const closeIssued = async (opened: FileHandle, issued: HandleGeneration): Promise<void> => {
      try {
        await opened.close()
      } catch {
        handles.set(issuedKey(issued), { owner, live: opened })
      }
    }

    const drainPendingClose = async (): Promise<void> => {
      for (const [handle, holder] of pendingClose) {
        if (holder !== owner) continue
        try {
          await handle.close()
          pendingClose.delete(handle)
        } catch {
          // remain in pendingClose for next drain
        }
      }
    }

    const paths = core.bind(closeOrTrack)
    const tree = createHostFileTree({
      paths,
      limits: bounds,
      close: closeOrTrack,
      issue: object => {
        const handle = { object, generation: String(nextGeneration++) }
        handles.set(issuedKey(handle), { owner, live: undefined })
        return handle
      },
      drain: drainPendingClose,
    })
    const batch = createHostFileBatch({
      paths,
      stateDirectory: options.stateDirectory,
      generation,
      running,
      sealed: () => sealed.has(owner),
      close: closeOrTrack,
      drain: drainPendingClose,
    })

    /** Opens `opening` below the root without following a link; a failure is already a result. */
    async function openBelowRoot(
      requestId: string,
      opening: string,
      flags: number,
    ): Promise<FileHandle | FacilityResult<never>> {
      const located = await paths.locate(opening)
      if (!located.ok) return failed(requestId, located.failure, 'unresolved')
      try {
        return await open(
          fdPath(located.value.parent, located.value.name),
          flags | constants.O_NOFOLLOW,
        )
      } catch (error) {
        return openFailure(requestId, error)
      } finally {
        await closeOrTrack(located.value.parent)
      }
    }

    async function openNamed(
      requestId: string,
      path: string,
      namedToken: string,
      bindingKind: EnvironmentBinding['kind'],
      flags: number,
      content = false,
    ): Promise<
      | {
          readonly kind: 'handle'
          readonly handle: FileHandle
          readonly object: ObjectToken
          readonly stat: FileStats
        }
      | FacilityResult<never>
    > {
      if (bindingKind !== 'host_machine') return reject(requestId, 'unsupported')
      if (!isHostPath(path)) return reject(requestId, 'invalidInput')
      if (namedToken === '') return reject(requestId, 'notAuthorized')

      const opening = pathWithoutTrailingSlash(path)
      let handle: FileHandle
      if (paths.rooted) {
        const refusal = await gate(paths, requestId, [path])
        if (refusal !== undefined) return refusal
        const below = await openBelowRoot(requestId, opening, flags)
        if ('kind' in below) return below
        handle = below
      } else {
        try {
          handle = await open(opening, flags | (noFollow ?? 0))
        } catch (error) {
          return openFailure(requestId, error)
        }
      }

      try {
        const stat = await handle.stat({ bigint: true })
        const object = tokenOf(stat)

        const refused = await refusalAfterOpen(requestId, opening, stat)
        if (refused !== undefined) {
          await closeOrTrack(handle)
          return refused
        }

        if (path.length > 1 && path.endsWith('/') && !stat.isDirectory()) {
          await closeOrTrack(handle)
          return { kind: 'unresolved', requestId }
        }

        if (object.token !== namedToken) {
          await closeOrTrack(handle)
          return reject(requestId, 'conflict')
        }
        // A file with a second name may be the same file as one outside the root. The count is read
        // from the descriptor that is open, so the check cannot race with the open.
        if (paths.rooted && content && stat.isFile() && stat.nlink > 1n) {
          await closeOrTrack(handle)
          return reject(requestId, 'notAuthorized')
        }
        return { kind: 'handle', handle, object, stat }
      } catch {
        await closeOrTrack(handle)
        return unknown(requestId)
      }
    }

    async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<boolean> {
      let offset = 0
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await handle.write(bytes, offset)
        if (bytesWritten <= 0) return false
        offset += bytesWritten
      }
      return true
    }

    async function readRange(
      handle: FileHandle,
      offsetBytes: number,
      limitBytes: number | undefined,
    ): Promise<{ readonly bytes: Uint8Array; readonly eof: boolean }> {
      const chunks: Uint8Array[] = []
      let total = 0
      let position = offsetBytes
      let eof = false
      while (limitBytes === undefined || total < limitBytes) {
        const want = limitBytes === undefined ? 64 * 1024 : Math.min(64 * 1024, limitBytes - total)
        const buffer = new Uint8Array(want)
        const { bytesRead } = await handle.read(buffer, 0, want, position)
        if (bytesRead === 0) {
          eof = true
          break
        }
        chunks.push(buffer.subarray(0, bytesRead))
        total += bytesRead
        position += bytesRead
      }
      if (!eof) eof = position >= Number((await handle.stat({ bigint: true })).size)
      const bytes = new Uint8Array(total)
      let at = 0
      for (const chunk of chunks) {
        bytes.set(chunk, at)
        at += chunk.byteLength
      }
      return { bytes, eof }
    }

    async function replace(
      requestId: string,
      path: string,
      namedToken: string,
      bindingKind: EnvironmentBinding['kind'],
      bytes: Uint8Array,
      expectedVersion: FileVersion | undefined,
    ): Promise<FacilityResult<FileIdentity>> {
      const opened = await openNamed(
        requestId,
        path,
        namedToken,
        bindingKind,
        constants.O_RDWR,
        true,
      )
      if (opened.kind !== 'handle') return opened

      if (expectedVersion !== undefined && versionOf(opened.stat) !== expectedVersion) {
        await closeOrTrack(opened.handle)
        return reject(requestId, 'conflict')
      }
      try {
        await opened.handle.truncate(0)
        if (!(await writeAll(opened.handle, bytes))) {
          await closeOrTrack(opened.handle)
          return unknown(requestId)
        }
        const version = versionOf(await opened.handle.stat({ bigint: true }))
        const handle = issue(opened.object)
        await closeIssued(opened.handle, handle)
        return { kind: 'done', requestId, value: { object: opened.object, handle, version } }
      } catch {
        await closeOrTrack(opened.handle)
        return unknown(requestId)
      }
    }

    /** Writes into a file just created, then issues its handle. The file stays on a failed write. */
    async function finishCreate(
      requestId: string,
      created: FileHandle,
      bytes: Uint8Array,
      parentStillNamed: () => Promise<boolean>,
    ): Promise<FacilityResult<FileIdentity>> {
      try {
        if (!(await parentStillNamed())) {
          await closeOrTrack(created)
          return unknown(requestId)
        }
        if (!(await writeAll(created, bytes))) {
          await closeOrTrack(created)
          return unknown(requestId)
        }
        const stat = await created.stat({ bigint: true })
        const object = tokenOf(stat)
        const handle = issue(object)
        await closeIssued(created, handle)
        return { kind: 'done', requestId, value: { object, handle, version: versionOf(stat) } }
      } catch {
        await closeOrTrack(created)
        return unknown(requestId)
      }
    }

    /**
     * Create below a host file root: the parent directory is reached by descriptor, checked
     * against the name in the request, and the file is created through that descriptor, so a
     * parent swapped for a link after the check changes nothing.
     */
    async function createBelowRoot(
      requestId: string,
      path: string,
      namedToken: string,
      bytes: Uint8Array,
    ): Promise<FacilityResult<FileIdentity>> {
      const refusal = await gate(paths, requestId, [path])
      if (refusal !== undefined) return refusal
      const located = await paths.locate(path)
      if (!located.ok) return failed(requestId, located.failure, 'notFound')
      const { parent, name, isRoot } = located.value
      let created: FileHandle
      try {
        if (isRoot) return reject(requestId, 'conflict')
        if (tokenOf(await parent.stat({ bigint: true })).token !== namedToken)
          return reject(requestId, 'conflict')
        created = await open(
          fdPath(parent, name),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o666,
        )
      } catch (error) {
        const reason = mapped(createCodes, error)
        return reason ? reject(requestId, reason) : unknown(requestId)
      } finally {
        await closeOrTrack(parent)
      }
      return finishCreate(requestId, created, bytes, async () => true)
    }

    async function create(
      requestId: string,
      path: string,
      namedToken: string,
      bindingKind: EnvironmentBinding['kind'],
      bytes: Uint8Array,
    ): Promise<FacilityResult<FileIdentity>> {
      if (bindingKind !== 'host_machine') return reject(requestId, 'unsupported')
      if (!isHostPath(path)) return reject(requestId, 'invalidInput')
      if (namedToken === '') return reject(requestId, 'notAuthorized')
      if (path.length > 1 && path.endsWith('/')) return reject(requestId, 'invalidInput')

      if (paths.rooted) return createBelowRoot(requestId, path, namedToken, bytes)

      // The request names the parent directory; it is checked before and after the exclusive create,
      // because the host has no descriptor-relative create here.
      const parentPath = dirname(path)
      const parent = await openNamed(
        requestId,
        `${parentPath}/`,
        namedToken,
        bindingKind,
        constants.O_RDONLY | constants.O_DIRECTORY,
      )
      if (parent.kind === 'unresolved') return reject(requestId, 'notFound')
      if (parent.kind !== 'handle') return parent
      await closeOrTrack(parent.handle)

      let created: FileHandle
      try {
        created = await open(
          path,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o666,
        )
      } catch (error) {
        const reason = mapped(createCodes, error)
        return reason ? reject(requestId, reason) : unknown(requestId)
      }

      return finishCreate(requestId, created, bytes, async () => {
        const parentAfter = await hostObjectToken(parentPath).catch(() => undefined)
        return parentAfter?.token === namedToken
      })
    }

    const operations: FileSystemFacility<unknown> = {
      async read(request) {
        const requestId = request.requestId
        const path = request.path
        const namedToken = request.named === null ? '' : request.named.token
        const bindingKind = request.binding.kind
        const offsetBytes = request.offsetBytes
        const limitBytes = request.limitBytes
        await drainPendingClose()
        if (!isByteCount(offsetBytes) || !isByteCount(limitBytes))
          return reject(requestId, 'invalidInput')
        const opened = await openNamed(
          requestId,
          path,
          namedToken,
          bindingKind,
          constants.O_RDONLY,
          true,
        )
        if (opened.kind !== 'handle') return opened

        try {
          if (opened.stat.isDirectory()) {
            await closeOrTrack(opened.handle)
            return reject(requestId, 'unsupported')
          }
          const start = offsetBytes ?? 0
          const { bytes, eof } = await readRange(opened.handle, start, limitBytes)
          const handle = issue(opened.object)
          await closeIssued(opened.handle, handle)
          return {
            kind: 'done',
            requestId,
            value: {
              object: opened.object,
              handle,
              version: versionOf(opened.stat),
              bytes,
              nextOffsetBytes: start + bytes.byteLength,
              eof,
            },
          }
        } catch (error) {
          await closeOrTrack(opened.handle)
          if (errorCode(error) === 'EISDIR') return reject(requestId, 'unsupported')
          return unknown(requestId)
        }
      },

      async stat(request) {
        const requestId = request.requestId
        const path = request.path
        const namedToken = request.named === null ? '' : request.named.token
        const bindingKind = request.binding.kind
        await drainPendingClose()
        const opened = await openNamed(requestId, path, namedToken, bindingKind, constants.O_RDONLY)
        if (opened.kind !== 'handle') return opened

        const handle = issue(opened.object)
        await closeIssued(opened.handle, handle)
        return {
          kind: 'done',
          requestId,
          value: {
            object: opened.object,
            handle,
            version: versionOf(opened.stat),
            type: opened.stat.isDirectory() ? 'directory' : 'file',
            sizeBytes: Number(opened.stat.size),
            modifiedMs: Number(opened.stat.mtimeMs),
          },
        }
      },

      async write(request) {
        const requestId = request.requestId
        const path = request.path
        const namedToken = request.named === null ? '' : request.named.token
        const bindingKind = request.binding.kind
        const bytes = Uint8Array.from(request.bytes)
        const mode = request.mode
        const expectedVersion = request.expectedVersion
        await drainPendingClose()
        if (mode === 'create') {
          if (expectedVersion !== undefined) return reject(requestId, 'invalidInput')
          return create(requestId, path, namedToken, bindingKind, bytes)
        }
        return replace(requestId, path, namedToken, bindingKind, bytes, expectedVersion)
      },

      async close(request) {
        const requestId = request.requestId
        const path = request.path
        const named = request.named
        const bindingKind = request.binding.kind
        const handle = request.handle
        const namedToken = named === null ? '' : named.token
        const handleObject = { token: handle.object.token }
        const handleGeneration = handle.generation
        const returnedHandle: HandleGeneration = {
          object: handleObject,
          generation: handleGeneration,
        }
        await drainPendingClose()

        if (bindingKind !== 'host_machine') return reject(requestId, 'unsupported')
        if (!isHostPath(path)) return reject(requestId, 'invalidInput')
        if (named === null) return reject(requestId, 'notAuthorized')
        if (paths.rooted) {
          const refusal = await gate(paths, requestId, [path])
          if (refusal !== undefined) return refusal
        }
        if (handleObject.token !== namedToken) return unknown(requestId)

        const key = issuedKey(returnedHandle)
        const entry = handles.get(key)
        // A handle another owner holds cannot be closed or settled through this facade.
        if (entry === undefined || entry.owner !== owner) return unknown(requestId)
        const live = entry.live
        if (live === undefined)
          return { kind: 'done', requestId, value: { handle: returnedHandle } }

        try {
          await live.close()
          entry.live = undefined
          return { kind: 'done', requestId, value: { handle: returnedHandle } }
        } catch {
          return unknown(requestId)
        }
      },

      list: tree.list,
      search: tree.search,
      mkdir: tree.mkdir,
      remove: tree.remove,
      move: tree.move,
      copy: tree.copy,
      commitBatch: batch.commitBatch,
      recoverBatch: batch.recoverBatch,
    }

    /** Once the owner is sealed, a new operation is refused without touching the file system. */
    const unlessSealed =
      <Q extends { readonly requestId: string }, T>(
        run: (request: Q) => Promise<FacilityResult<T>>,
      ) =>
      async (request: Q): Promise<FacilityResult<T>> =>
        sealed.has(owner) ? reject(request.requestId, 'closed') : run(request)
    const facility: FileSystemFacility<unknown> = {
      read: unlessSealed(operations.read),
      stat: unlessSealed(operations.stat),
      write: unlessSealed(operations.write),
      close: unlessSealed(operations.close),
      list: unlessSealed(operations.list),
      search: unlessSealed(operations.search),
      mkdir: unlessSealed(operations.mkdir),
      remove: unlessSealed(operations.remove),
      move: unlessSealed(operations.move),
      copy: unlessSealed(operations.copy),
      commitBatch: unlessSealed(operations.commitBatch),
      recoverBatch: unlessSealed(operations.recoverBatch),
    }

    internalState.set(facility, {
      pendingCloseCount: () => [...pendingClose.values()].filter(holder => holder === owner).length,
    })
    return facility
  }

  return Object.freeze({
    facilityFor,
    closeOwned,
    openCount,
    hasRoot: core.rooted,
    seal: (owner: string) => {
      sealed.add(owner)
    },
  })
}
