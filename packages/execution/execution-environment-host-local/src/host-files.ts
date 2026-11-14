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
import { createHostFileBatch, type HostFileDiagnostic } from './host-file-batch.ts'
import { createWindowsBatch } from './windows-files/batch.ts'
import { createHostFileTree, hostFilesLimits, type HostFilesLimits } from './host-file-tree.ts'
import {
  createWindowsFiles,
  createWindowsRootIdentity,
  windowsObjectInfo,
} from './windows-files/facility.ts'
import { windowsSegmentsBelow } from './root-segments.ts'
import { createMacosFiles } from './macos-files/facility.ts'
import { createMacosBatch } from './macos-files/batch.ts'
import { createMacosPaths, createMacosRootIdentity } from './macos-files/paths.ts'
import { macosFilesPrerequisite } from './macos-files/prerequisite.ts'
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
  type Located,
} from './host-paths.ts'

export type { HostFilesLimits } from './host-file-tree.ts'
export type { HostFileDiagnostic } from './host-file-batch.ts'

export async function hostObjectToken(path: string): Promise<ObjectToken> {
  if (process.platform === 'win32') {
    const found = await windowsObjectInfo(path)
    if (!found.ok) throw new Error(`no host object token for the path: ${found.failure}`)
    return { token: found.value.token }
  }
  const stat = await lstat(path, { bigint: true })
  return { token: `${stat.dev}:${stat.ino}` }
}

const noFollow: number | undefined = constants.O_NOFOLLOW

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

type OpenedNamed = Readonly<{
  kind: 'handle'
  handle: FileHandle
  object: ObjectToken
  stat: FileStats
}>

type Refusal = { readonly kind: 'unresolved'; readonly requestId: string } | FacilityResult<never>

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

export function __unsafeHostFilesState(files: FileSystemFacility<unknown>): {
  readonly pendingCloseCount: number
} {
  const state = internalState.get(files)
  return { pendingCloseCount: state?.pendingCloseCount() ?? 0 }
}

export type HostFilesEngine = Readonly<{
  facilityFor(owner: string): FileSystemFacility<unknown>
  closeOwned(owner: string): Promise<number>
  openCount(owner: string): number
  readonly hasRoot: boolean
  seal(owner: string): void
}>

export type HostFilesEngineOptions = Readonly<{
  root?: string
  stateDirectory?: string
  diagnose?: ((diagnostic: HostFileDiagnostic) => void) | undefined
}>

export function createHostFiles(): FileSystemFacility<unknown> {
  return createHostFilesEngine().facilityFor('host-files')
}

function absolutePath(name: string, value: string | undefined): void {
  if (value !== undefined && (!isAbsolute(value) || value.includes('\0')))
    throw new TypeError(`${name} must be an absolute path`)
}

export function createHostFilesEngine(
  options: HostFilesEngineOptions = {},
  limits?: Partial<HostFilesLimits>,
): HostFilesEngine {
  absolutePath('root', options.root)
  absolutePath('stateDirectory', options.stateDirectory)
  const bounds = hostFilesLimits(limits)
  const windowsRootIdentity =
    process.platform === 'win32' && options.root !== undefined
      ? createWindowsRootIdentity(options.root)
      : undefined
  const macosRootIdentity =
    process.platform === 'darwin' && options.root !== undefined
      ? createMacosRootIdentity(options.root)
      : undefined
  const core = createHostPathsCore({
    root: options.root,
    probeDirectory: options.stateDirectory,
  })
  const macosPrerequisite = macosFilesPrerequisite(options.stateDirectory)
  const generation = randomUUID()
  const running = new Set<string>()
  const sealed = new Set<string>()

  const handles = new Map<string, { readonly owner: string; live: FileHandle | undefined }>()

  const pendingClose = new Map<FileHandle, string>()

  let nextGeneration = 1

  const openCount = (owner: string): number => {
    let count = 0
    for (const entry of handles.values()) if (entry.owner === owner && entry.live) count++
    for (const holder of pendingClose.values()) if (holder === owner) count++
    return count
  }

  const closeOwned = async (owner: string): Promise<number> => {
    for (const [handle, holder] of pendingClose) {
      if (holder !== owner) continue
      try {
        await handle.close()
        pendingClose.delete(handle)
      } catch {}
    }
    for (const entry of handles.values()) {
      const live = entry.live
      if (entry.owner !== owner || live === undefined) continue
      try {
        await live.close()
        entry.live = undefined
      } catch {}
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
        } catch {}
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
      diagnose: options.diagnose,
    })

    async function openLastSegment(
      requestId: string,
      located: Located,
      flags: number,
    ): Promise<FileHandle | FacilityResult<never>> {
      let opened: FileHandle
      try {
        opened = await open(fdPath(located.parent, located.name), flags | constants.O_NOFOLLOW)
      } catch (error) {
        return openFailure(requestId, error)
      }
      try {
        const own = await opened.stat({ bigint: true })
        const parent = await located.parent.stat({ bigint: true })
        if (own.dev === parent.dev) return opened
      } catch {
        await closeOrTrack(opened)
        return unknown(requestId)
      }
      await closeOrTrack(opened)
      return reject(requestId, 'notAuthorized')
    }

    async function openBelowRoot(
      requestId: string,
      opening: string,
      flags: number,
    ): Promise<FileHandle | FacilityResult<never>> {
      const located = await paths.locate(opening)
      if (!located.ok) return failed(requestId, located.failure, 'unresolved')
      try {
        return await openLastSegment(requestId, located.value, flags)
      } finally {
        await closeOrTrack(located.value.parent)
      }
    }

    function namedRefusal(
      requestId: string,
      path: string,
      namedToken: string,
      bindingKind: EnvironmentBinding['kind'],
    ): FacilityResult<never> | undefined {
      if (bindingKind !== 'host_machine') return reject(requestId, 'unsupported')
      if (!isHostPath(path)) return reject(requestId, 'invalidInput')
      return namedToken === '' ? reject(requestId, 'notAuthorized') : undefined
    }

    async function openPath(
      requestId: string,
      path: string,
      flags: number,
    ): Promise<FileHandle | FacilityResult<never>> {
      const opening = pathWithoutTrailingSlash(path)
      if (!paths.rooted) {
        try {
          return await open(opening, flags | (noFollow ?? 0))
        } catch (error) {
          return openFailure(requestId, error)
        }
      }
      const refusal = await gate(paths, requestId, [path])
      if (refusal !== undefined) return refusal
      return openBelowRoot(requestId, opening, flags)
    }

    function slashOnNonDirectory(path: string, stat: FileStats): boolean {
      return path.length > 1 && path.endsWith('/') && !stat.isDirectory()
    }

    /** A file with a second name may be one outside the root. The count is read from the open
     *  descriptor, so the check cannot race with the open. */
    function sharedBelowRoot(content: boolean, stat: FileStats): boolean {
      return paths.rooted && content && stat.isFile() && stat.nlink > 1n
    }

    async function checkOpened(
      requestId: string,
      handle: FileHandle,
      path: string,
      namedToken: string,
      content: boolean,
    ): Promise<OpenedNamed | Refusal> {
      const stat = await handle.stat({ bigint: true })
      const object = tokenOf(stat)
      const refused = await refusalAfterOpen(requestId, pathWithoutTrailingSlash(path), stat)
      if (refused !== undefined) return refused
      if (slashOnNonDirectory(path, stat)) return { kind: 'unresolved', requestId }
      if (object.token !== namedToken) return reject(requestId, 'conflict')
      if (sharedBelowRoot(content, stat)) return reject(requestId, 'notAuthorized')
      return { kind: 'handle', handle, object, stat }
    }

    async function openNamed(
      requestId: string,
      path: string,
      namedToken: string,
      bindingKind: EnvironmentBinding['kind'],
      flags: number,
      content = false,
    ): Promise<OpenedNamed | FacilityResult<never>> {
      const early = namedRefusal(requestId, path, namedToken, bindingKind)
      if (early !== undefined) return early
      const handle = await openPath(requestId, path, flags)
      if ('kind' in handle) return handle
      let checked: OpenedNamed | Refusal
      try {
        checked = await checkOpened(requestId, handle, path, namedToken, content)
      } catch {
        checked = unknown(requestId)
      }
      if (checked.kind !== 'handle') await closeOrTrack(handle)
      return checked
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
          if (process.platform === 'darwin') {
            const located = await createMacosPaths(macosRootIdentity)(path)
            if (!located.ok) return failed(requestId, located.failure, 'unresolved')
            if (!(await macosPrerequisite())) return reject(requestId, 'unavailable')
          } else {
            const refusal =
              process.platform === 'win32' && options.root !== undefined
                ? (await windowsSegmentsBelow(options.root, path)) === undefined
                  ? reject(requestId, 'notAuthorized')
                  : undefined
                : await gate(paths, requestId, [path])
            if (refusal !== undefined) return refusal
          }
        }
        if (handleObject.token !== namedToken) return unknown(requestId)

        const key = issuedKey(returnedHandle)
        const entry = handles.get(key)
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

    if (process.platform === 'win32') {
      const windows = createWindowsFiles({
        ...options,
        ...(windowsRootIdentity === undefined ? {} : { rootIdentity: windowsRootIdentity }),
        limits: bounds,
        issue,
      })
      operations.read = windows.read
      operations.stat = windows.stat
      operations.list = windows.list
      operations.search = windows.search
      operations.mkdir = windows.mkdir
      operations.remove = windows.remove
      operations.move = windows.move
      operations.write = windows.write
      operations.copy = windows.copy
      const windowsBatch = createWindowsBatch({
        files: windows,
        ...(options.stateDirectory === undefined ? {} : { stateDirectory: options.stateDirectory }),
        generation,
        running,
        sealed: () => sealed.has(owner),
        diagnose: options.diagnose,
      })
      operations.commitBatch = windowsBatch.commitBatch
      operations.recoverBatch = windowsBatch.recoverBatch
    }

    if (process.platform === 'darwin') {
      const macos = createMacosFiles({
        ...(macosRootIdentity === undefined ? {} : { rootIdentity: macosRootIdentity }),
        limits: bounds,
        prerequisite: macosPrerequisite,
        issue,
      })
      operations.list = macos.list
      operations.search = macos.search
      operations.mkdir = macos.mkdir
      operations.remove = macos.remove
      operations.move = macos.move
      operations.copy = macos.copy
      const macosBatch = createMacosBatch({
        files: macos,
        prerequisite: macosPrerequisite,
        ...(macosRootIdentity === undefined ? {} : { rootIdentity: macosRootIdentity }),
        ...(options.stateDirectory === undefined ? {} : { stateDirectory: options.stateDirectory }),
        generation,
        running,
        sealed: () => sealed.has(owner),
        diagnose: options.diagnose,
      })
      operations.commitBatch = macosBatch.commitBatch
      operations.recoverBatch = macosBatch.recoverBatch
      if (options.root !== undefined) {
        operations.read = macos.read
        operations.stat = macos.stat
        operations.write = macos.write
      }
    }

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
