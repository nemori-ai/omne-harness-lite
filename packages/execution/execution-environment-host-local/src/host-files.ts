import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type {
  EnvironmentBinding,
  FacilityReason,
  FacilityResult,
  FileIdentity,
  FileSystemFacility,
  FileVersion,
  HandleGeneration,
  ObjectToken,
} from '@omne-harness/execution-environment-contract'

type FileHandle = Awaited<ReturnType<typeof open>>
type FileStats = Awaited<ReturnType<FileHandle['stat']>>
type OpenFailure = FacilityReason | 'unresolved'

const openCodes: Readonly<Record<string, OpenFailure>> = {
  ENOENT: 'unresolved',
  ENOTDIR: 'unresolved',
  ELOOP: 'unsupported',
  EMLINK: 'unsupported',
  EISDIR: 'unsupported',
  EINVAL: 'invalidInput',
  EACCES: 'notAuthorized',
  EPERM: 'notAuthorized',
}

const createCodes: Readonly<Record<string, FacilityReason>> = {
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

export async function hostObjectToken(path: string): Promise<ObjectToken> {
  const stat = await lstat(path, { bigint: true })
  return { token: `${stat.dev}:${stat.ino}` }
}

function tokenOf(stat: FileStats): ObjectToken {
  return { token: `${stat.dev}:${stat.ino}` }
}

function versionOf(stat: FileStats): FileVersion {
  return `${stat.mtimeMs}:${stat.size}`
}

function reject(requestId: string, reason: FacilityReason): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason }
}

function unknown(requestId: string): FacilityResult<never> {
  return { kind: 'unknown', requestId }
}

/** A host path is absolute and has no NUL byte; anything else is refused before the file system. */
function isHostPath(path: string): boolean {
  return isAbsolute(path) && !path.includes('\0')
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

function pathWithoutTrailingSlash(path: string): string {
  let current = path
  while (current.length > 1 && current.endsWith('/')) current = current.slice(0, -1)
  return current
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function mapped<T>(table: Readonly<Record<string, T>>, error: unknown): T | undefined {
  const code = errorCode(error)
  return code !== undefined && Object.hasOwn(table, code) ? table[code] : undefined
}

function openFailure(requestId: string, error: unknown): FacilityResult<never> {
  const reason = mapped(openCodes, error)
  if (reason === 'unresolved') return { kind: 'unresolved', requestId }
  if (reason) return reject(requestId, reason)
  return unknown(requestId)
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
}>

/**
 * The host `files` facility. `read`, `stat`, `write` and `close` act on the object the request
 * names; the other operations of the contract are not implemented by this provider and reply
 * `unsupported` without touching the file system.
 */
export function createHostFiles(): FileSystemFacility<unknown> {
  return createHostFilesEngine().facilityFor('host-files')
}

/** Creates the shared engine of host file use. The provider gives each acquisition its own owner. */
export function createHostFilesEngine(): HostFilesEngine {
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

    async function openNamed(
      requestId: string,
      path: string,
      namedToken: string,
      bindingKind: EnvironmentBinding['kind'],
      flags: number,
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
      try {
        handle = await open(opening, flags | (noFollow ?? 0))
      } catch (error) {
        return openFailure(requestId, error)
      }

      try {
        const stat = await handle.stat({ bigint: true })
        const object = tokenOf(stat)

        if (noFollow === undefined) {
          const final = await finalEntryIsOpened(opening, stat)
          if (final !== 'opened') {
            await closeOrTrack(handle)
            return final === 'unresolved'
              ? { kind: 'unresolved', requestId }
              : reject(requestId, final)
          }
        }

        if (path.length > 1 && path.endsWith('/') && !stat.isDirectory()) {
          await closeOrTrack(handle)
          return { kind: 'unresolved', requestId }
        }

        if (object.token !== namedToken) {
          await closeOrTrack(handle)
          return reject(requestId, 'conflict')
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
      const opened = await openNamed(requestId, path, namedToken, bindingKind, constants.O_RDWR)
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

      try {
        const parentAfter = await hostObjectToken(parentPath).catch(() => undefined)
        if (parentAfter?.token !== namedToken) {
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

    const facility: FileSystemFacility<unknown> = {
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
        const opened = await openNamed(requestId, path, namedToken, bindingKind, constants.O_RDONLY)
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

      list: async request => reject(request.requestId, 'unsupported'),
      search: async request => reject(request.requestId, 'unsupported'),
      mkdir: async request => reject(request.requestId, 'unsupported'),
      remove: async request => reject(request.requestId, 'unsupported'),
      move: async request => reject(request.requestId, 'unsupported'),
      copy: async request => reject(request.requestId, 'unsupported'),
      commitBatch: async request => reject(request.requestId, 'unsupported'),
      recoverBatch: async request => reject(request.requestId, 'unsupported'),
    }

    internalState.set(facility, {
      pendingCloseCount: () => [...pendingClose.values()].filter(holder => holder === owner).length,
    })
    return facility
  }

  return Object.freeze({ facilityFor, closeOwned, openCount })
}
