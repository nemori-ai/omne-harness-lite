import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import type {
  EnvironmentBinding,
  FacilityReason,
  FacilityResult,
  FileFacility,
  HandleGeneration,
  ObjectToken,
} from './model.ts'

const openCodes = {
  ENOENT: 'unresolved',
  ENOTDIR: 'unresolved',
  ELOOP: 'unsupported',
  EMLINK: 'unsupported',
  EISDIR: 'unsupported',
  EINVAL: 'invalidInput',
  EACCES: 'notAuthorized',
  EPERM: 'notAuthorized',
} as const satisfies Record<string, FacilityReason | 'unresolved'>

export async function hostObjectToken(path: string): Promise<ObjectToken> {
  const stat = await lstat(path, { bigint: true })
  return { token: `${stat.dev}:${stat.ino}` }
}

type FileHandle = Awaited<ReturnType<typeof open>>

function reject(requestId: string, reason: FacilityReason): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason }
}

function pathWithoutTrailingSlash(path: string): string {
  let current = path
  while (current.length > 1 && current.endsWith('/')) current = current.slice(0, -1)
  return current
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined
}

function openFailure(requestId: string, error: unknown): FacilityResult<never> {
  const code = errorCode(error)
  const mapped =
    typeof code === 'string' && Object.hasOwn(openCodes, code)
      ? openCodes[code as keyof typeof openCodes]
      : undefined
  if (mapped === 'unresolved') return { kind: 'unresolved', requestId }
  if (mapped) return reject(requestId, mapped)
  return { kind: 'unknown', requestId }
}

function issuedKey(handle: HandleGeneration): string {
  return `${handle.object.token}\0${handle.generation}`
}

const internalState = new WeakMap<FileFacility, { readonly pendingCloseCount: () => number }>()

/**
 * Exposes internal state for tests only. Not part of the public package contract.
 * @internal
 */
export function __unsafeHostFilesState(files: FileFacility): {
  readonly pendingCloseCount: number
} {
  const state = internalState.get(files)
  return { pendingCloseCount: state?.pendingCloseCount() ?? 0 }
}

export function createHostFiles(): FileFacility {
  /** Live handles. A missing key means the handle was never issued.
   *  `undefined` means the descriptor was already closed successfully.
   *  A `FileHandle` means the previous close attempt failed and the descriptor is still open.
   */
  const handles = new Map<string, FileHandle | undefined>()

  /** Opened descriptors that could not be closed on error paths, kept for continued cleanup. */
  const pendingClose = new Set<FileHandle>()

  let nextGeneration = 1

  const issue = (object: ObjectToken): HandleGeneration => {
    const handle = { object, generation: String(nextGeneration++) }
    handles.set(issuedKey(handle), undefined)
    return handle
  }

  const trackFailedClose = (handle: FileHandle): void => {
    pendingClose.add(handle)
  }

  const closeOrTrack = async (handle: FileHandle): Promise<void> => {
    try {
      await handle.close()
    } catch {
      trackFailedClose(handle)
    }
  }

  const drainPendingClose = async (): Promise<void> => {
    for (const handle of pendingClose) {
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
    | { readonly kind: 'handle'; readonly handle: FileHandle; readonly object: ObjectToken }
    | FacilityResult<never>
  > {
    if (bindingKind !== 'host_machine') return reject(requestId, 'unsupported')
    if (path.includes('\0')) return reject(requestId, 'invalidInput')
    if (namedToken === '') return reject(requestId, 'notAuthorized')

    let handle: FileHandle
    try {
      handle = await open(pathWithoutTrailingSlash(path), flags | constants.O_NOFOLLOW)
    } catch (error) {
      return openFailure(requestId, error)
    }

    try {
      const stat = await handle.stat({ bigint: true })
      const object = { token: `${stat.dev}:${stat.ino}` }

      if (path.length > 1 && path.endsWith('/') && !stat.isDirectory()) {
        await closeOrTrack(handle)
        return { kind: 'unresolved', requestId }
      }

      if (object.token !== namedToken) {
        await closeOrTrack(handle)
        return reject(requestId, 'conflict')
      }
      return { kind: 'handle', handle, object }
    } catch {
      await closeOrTrack(handle)
      return { kind: 'unknown', requestId }
    }
  }

  const facility: FileFacility = {
    async read(request) {
      const requestId = request.requestId
      const path = request.path
      const named = request.named
      const namedToken = named === null ? '' : named.token
      const bindingKind = request.binding.kind
      await drainPendingClose()
      const opened = await openNamed(requestId, path, namedToken, bindingKind, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened

      try {
        const bytes = new Uint8Array(await opened.handle.readFile())
        const handle = issue(opened.object)
        try {
          await opened.handle.close()
        } catch {
          handles.set(issuedKey(handle), opened.handle)
        }
        return {
          kind: 'done',
          requestId,
          value: { object: opened.object, handle, bytes },
        }
      } catch (error) {
        await closeOrTrack(opened.handle)
        if (errorCode(error) === 'EISDIR') return reject(requestId, 'unsupported')
        return { kind: 'unknown', requestId }
      }
    },

    async stat(request) {
      const requestId = request.requestId
      const path = request.path
      const named = request.named
      const namedToken = named === null ? '' : named.token
      const bindingKind = request.binding.kind
      await drainPendingClose()
      const opened = await openNamed(requestId, path, namedToken, bindingKind, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened

      const handle = issue(opened.object)
      try {
        await opened.handle.close()
      } catch {
        handles.set(issuedKey(handle), opened.handle)
      }
      return {
        kind: 'done',
        requestId,
        value: { object: opened.object, handle },
      }
    },

    async write(request) {
      const requestId = request.requestId
      const path = request.path
      const named = request.named
      const namedToken = named === null ? '' : named.token
      const bindingKind = request.binding.kind
      const bytes = Uint8Array.from(request.bytes)
      await drainPendingClose()
      const opened = await openNamed(requestId, path, namedToken, bindingKind, constants.O_RDWR)
      if (opened.kind !== 'handle') return opened

      try {
        await opened.handle.truncate(0)
        let offset = 0
        while (offset < bytes.byteLength) {
          const { bytesWritten } = await opened.handle.write(bytes, offset)
          if (bytesWritten <= 0) {
            await closeOrTrack(opened.handle)
            return { kind: 'unknown', requestId }
          }
          offset += bytesWritten
        }
        const handle = issue(opened.object)
        try {
          await opened.handle.close()
        } catch {
          handles.set(issuedKey(handle), opened.handle)
        }
        return {
          kind: 'done',
          requestId,
          value: { object: opened.object, handle },
        }
      } catch {
        await closeOrTrack(opened.handle)
        return { kind: 'unknown', requestId }
      }
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
      if (path.includes('\0')) return reject(requestId, 'invalidInput')
      if (named === null) return reject(requestId, 'notAuthorized')
      if (handleObject.token !== namedToken) return { kind: 'unknown', requestId }

      const key = issuedKey(returnedHandle)
      const live = handles.get(key)
      if (live === undefined) {
        if (!handles.has(key)) return { kind: 'unknown', requestId }
        return {
          kind: 'done',
          requestId,
          value: { handle: returnedHandle },
        }
      }

      try {
        await live.close()
        handles.set(key, undefined)
        return {
          kind: 'done',
          requestId,
          value: { handle: returnedHandle },
        }
      } catch {
        return { kind: 'unknown', requestId }
      }
    },
  }

  internalState.set(facility, { pendingCloseCount: () => pendingClose.size })
  return facility
}
