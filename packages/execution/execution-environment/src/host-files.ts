import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import type {
  FacilityReason,
  FacilityResult,
  FileFacility,
  FileRequest,
  HandleGeneration,
  ObjectToken,
} from './model.ts'

const generation = '1'

export async function hostObjectToken(path: string): Promise<ObjectToken> {
  const stat = await lstat(path, { bigint: true })
  return { token: `${stat.dev}:${stat.ino}` }
}

function reject(requestId: string, reason: FacilityReason): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason }
}

function handleFor(object: ObjectToken): HandleGeneration {
  return { object, generation }
}

async function openNamed(
  request: FileRequest,
  flags: number,
): Promise<
  | { readonly kind: 'handle'; readonly handle: Awaited<ReturnType<typeof open>>; readonly object: ObjectToken }
  | FacilityResult<never>
> {
  if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
  if (request.path.includes('\0')) return reject(request.requestId, 'invalidInput')
  if (request.named === null) return reject(request.requestId, 'notAuthorized')
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(request.path, flags | constants.O_NOFOLLOW)
  } catch (error) {
    return openFailure(request.requestId, error)
  }
  try {
    const stat = await handle.stat({ bigint: true })
    const object = { token: `${stat.dev}:${stat.ino}` }
    if (object.token !== request.named.token) {
      await handle.close()
      return reject(request.requestId, 'conflict')
    }
    return { kind: 'handle', handle, object }
  } catch {
    await handle.close().catch(() => undefined)
    return { kind: 'unknown', requestId: request.requestId }
  }
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined
}

function openFailure(requestId: string, error: unknown): FacilityResult<never> {
  const code = errorCode(error)
  if (code === 'ENOENT') return { kind: 'unresolved', requestId }
  if (code === 'ELOOP' || code === 'EMLINK' || code === 'ENOTDIR' || code === 'EISDIR') {
    return reject(requestId, 'unsupported')
  }
  if (code === 'EINVAL') return reject(requestId, 'invalidInput')
  if (code === 'EACCES' || code === 'EPERM') return reject(requestId, 'notAuthorized')
  return { kind: 'unknown', requestId }
}

function issuedKey(handle: HandleGeneration): string {
  return `${handle.object.token}\n${handle.generation}`
}

export function createHostFiles(): FileFacility {
  const issued = new Set<string>()
  const issue = (object: ObjectToken): HandleGeneration => {
    const handle = handleFor(object)
    issued.add(issuedKey(handle))
    return handle
  }
  return {
    async read(request) {
      const opened = await openNamed(request, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened
      try {
        const bytes = new Uint8Array(await opened.handle.readFile())
        const handle = issue(opened.object)
        await opened.handle.close().catch(() => undefined)
        return {
          kind: 'done',
          requestId: request.requestId,
          value: { object: opened.object, handle, bytes },
        }
      } catch (error) {
        await opened.handle.close().catch(() => undefined)
        if (errorCode(error) === 'EISDIR') return reject(request.requestId, 'unsupported')
        return { kind: 'unknown', requestId: request.requestId }
      }
    },
    async stat(request) {
      const opened = await openNamed(request, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened
      const handle = issue(opened.object)
      await opened.handle.close().catch(() => undefined)
      return {
        kind: 'done',
        requestId: request.requestId,
        value: { object: opened.object, handle },
      }
    },
    async write(request) {
      const opened = await openNamed(request, constants.O_RDWR)
      if (opened.kind !== 'handle') return opened
      try {
        await opened.handle.truncate(0)
        let offset = 0
        while (offset < request.bytes.byteLength) {
          const { bytesWritten } = await opened.handle.write(request.bytes, offset)
          if (bytesWritten <= 0) {
            await opened.handle.close().catch(() => undefined)
            return { kind: 'unknown', requestId: request.requestId }
          }
          offset += bytesWritten
        }
        const handle = issue(opened.object)
        await opened.handle.close().catch(() => undefined)
        return {
          kind: 'done',
          requestId: request.requestId,
          value: { object: opened.object, handle },
        }
      } catch {
        await opened.handle.close().catch(() => undefined)
        return { kind: 'unknown', requestId: request.requestId }
      }
    },
    async close(request) {
      if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
      if (request.named === null) return reject(request.requestId, 'notAuthorized')
      if (request.handle.object.token !== request.named.token || !issued.has(issuedKey(request.handle))) {
        return { kind: 'unknown', requestId: request.requestId }
      }
      return {
        kind: 'done',
        requestId: request.requestId,
        value: { handle: request.handle },
      }
    },
  }
}
