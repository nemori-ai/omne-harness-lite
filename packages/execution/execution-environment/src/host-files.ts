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
  const stat = await lstat(path)
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
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'ENOENT') return { kind: 'unresolved', requestId: request.requestId }
    if (code === 'ELOOP' || code === 'EMLINK') return reject(request.requestId, 'unsupported')
    return { kind: 'unknown', requestId: request.requestId }
  }
  const stat = await handle.stat()
  const object = { token: `${stat.dev}:${stat.ino}` }
  if (object.token !== request.named.token) {
    await handle.close()
    return reject(request.requestId, 'conflict')
  }
  return { kind: 'handle', handle, object }
}

export function createHostFiles(): FileFacility {
  return {
    async read(request) {
      const opened = await openNamed(request, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened
      try {
        const bytes = new Uint8Array(await opened.handle.readFile())
        return {
          kind: 'done',
          requestId: request.requestId,
          value: { object: opened.object, handle: handleFor(opened.object), bytes },
        }
      } finally {
        await opened.handle.close()
      }
    },
    async stat(request) {
      const opened = await openNamed(request, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened
      await opened.handle.close()
      return {
        kind: 'done',
        requestId: request.requestId,
        value: { object: opened.object, handle: handleFor(opened.object) },
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
          if (bytesWritten <= 0) return { kind: 'unknown', requestId: request.requestId }
          offset += bytesWritten
        }
        return {
          kind: 'done',
          requestId: request.requestId,
          value: { object: opened.object, handle: handleFor(opened.object) },
        }
      } catch {
        return { kind: 'unknown', requestId: request.requestId }
      } finally {
        await opened.handle.close().catch(() => undefined)
      }
    },
    async close(request) {
      const opened = await openNamed(request, constants.O_RDONLY)
      if (opened.kind !== 'handle') return opened
      try {
        await opened.handle.close()
      } catch {
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
