import type {
  FileIdentity,
  FileInformation,
  FileRequest,
  FileSystemFacility,
  HandleGeneration,
  ObjectToken,
} from '@omne-harness/execution-environment-contract'
import type { HostFilesLimits } from '../host-file-tree.ts'
import { failed, reject } from '../host-paths.ts'
import { createMacosPaths, requestRefusal, type RootIdentity } from './paths.ts'
import type { Metadata, NativeInput, NativeReply } from './protocol.ts'
import { invoke } from './transport.ts'

type Files = Pick<
  FileSystemFacility<unknown>,
  'read' | 'stat' | 'write' | 'list' | 'search' | 'mkdir' | 'remove' | 'move' | 'copy'
>

function snapshot<R extends FileRequest<unknown>>(request: R): R {
  return {
    ...request,
    named: request.named === null ? null : { ...request.named },
    binding: { ...request.binding },
  }
}

function pageValid(offset: number, limit: number, maximum: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= maximum
  )
}

export function createMacosFiles(
  options: Readonly<{
    rootIdentity?: () => Promise<RootIdentity | undefined>
    limits: HostFilesLimits
    prerequisite(): Promise<boolean>
    issue(object: ObjectToken): HandleGeneration
  }>,
): Files {
  const endpoint = createMacosPaths(options.rootIdentity)
  const identity = (info: Metadata): FileIdentity => {
    const object = { token: info.token }
    return { object, version: info.version, handle: options.issue(object) }
  }
  const information = (info: Metadata): FileInformation => ({
    ...identity(info),
    type: info.type,
    sizeBytes: info.size,
    modifiedMs: info.modified,
  })
  const run = async (
    request: FileRequest<unknown>,
    operation: NativeInput['operation'],
    extra: Partial<NativeInput> = {},
    target?: { readonly path: string; readonly named: ObjectToken | null },
  ) => {
    const refusal = requestRefusal(request)
    if (refusal !== undefined) return failed(request.requestId, refusal, 'unresolved')
    if (target !== undefined) {
      const rejected = requestRefusal({ ...request, ...target })
      if (rejected !== undefined) return failed(request.requestId, rejected, 'notFound')
    }
    const missing =
      ['read', 'stat', 'list'].includes(operation) || (operation === 'write' && !extra.create)
        ? 'unresolved'
        : 'notFound'
    const source = await endpoint(
      request.path,
      operation === 'mkdir' && extra.recursive,
      operation === 'list' || operation === 'search',
    )
    if (!source.ok) return failed(request.requestId, source.failure, missing)
    const destination = target === undefined ? undefined : await endpoint(target.path)
    if (destination !== undefined && !destination.ok)
      return failed(request.requestId, destination.failure, 'notFound')
    if (
      (options.rootIdentity !== undefined || !['read', 'stat', 'write'].includes(operation)) &&
      !(await options.prerequisite())
    )
      return reject(request.requestId, 'unavailable')
    const result = await invoke({
      ...source.value,
      named: request.named?.token ?? '',
      path: request.path,
      rooted: options.rootIdentity !== undefined,
      operation,
      ...extra,
      ...(destination?.ok
        ? {
            targetRoot: destination.value.root,
            expectedTargetRoot: destination.value.expectedRoot,
            targetSegments: destination.value.segments,
            targetNamed: target?.named?.token ?? '',
          }
        : {}),
    })
    return typeof result === 'string' ? failed(request.requestId, result, missing) : result
  }
  const changed = async (
    original: Parameters<Files['move']>[0] | Parameters<Files['copy']>[0],
    operation: 'move' | 'copy',
  ) => {
    const request = snapshot(original)
    const target = {
      ...request.target,
      named: request.target.named === null ? null : { ...request.target.named },
    }
    const result = await run(
      request,
      operation,
      { version: request.expectedVersion ?? null, replace: request.replace },
      target,
    )
    if ('kind' in result) return result
    return {
      kind: 'done' as const,
      requestId: request.requestId,
      value: {
        source: { token: result.source ?? result.info.token },
        target: identity(result.info),
      },
    }
  }
  return {
    async read(original) {
      const request = snapshot(original)
      const offset = request.offsetBytes ?? 0,
        limit = request.limitBytes ?? -1
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (request.limitBytes !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
      )
        return reject(request.requestId, 'invalidInput')
      const result = await run(request, 'read', { offset, limit })
      if ('kind' in result) return result
      const bytes = Uint8Array.from(Buffer.from(result.bytes, 'base64'))
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          ...identity(result.info),
          bytes,
          nextOffsetBytes: offset + bytes.length,
          eof: result.eof,
        },
      }
    },
    async stat(original) {
      const request = snapshot(original)
      const result = await run(request, 'stat')
      return 'kind' in result
        ? result
        : { kind: 'done', requestId: request.requestId, value: information(result.info) }
    },
    async write(original) {
      const request = { ...snapshot(original), bytes: Uint8Array.from(original.bytes) }
      if (
        request.mode === 'create' &&
        (request.expectedVersion !== undefined || request.path.endsWith('/'))
      )
        return reject(request.requestId, 'invalidInput')
      const result = await run(request, 'write', {
        version: request.expectedVersion ?? null,
        create: request.mode === 'create',
        bytes: Buffer.from(request.bytes).toString('base64'),
        trailingSlash: request.path.endsWith('/'),
      })
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: {
              ...identity(result.info),
              writeEffect: request.mode === 'create' ? 'created' : 'replaced',
            },
          }
    },
    async list(original) {
      const request = snapshot(original)
      const offset = request.offset ?? 0,
        limit = request.limit ?? options.limits.listPageLimit
      if (!pageValid(offset, limit, options.limits.listPageLimit))
        return reject(request.requestId, 'invalidInput')
      const result = await run(request, 'list', { offset, limit })
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: {
              directory: identity(result.info),
              entries: result.entries.map(info => ({ ...information(info), name: info.name })),
              ...(result.next < 0 ? {} : { nextOffset: result.next }),
            },
          }
    },
    async search(original) {
      const request = { ...snapshot(original), pattern: Uint8Array.from(original.pattern) }
      const offset = request.offset ?? 0,
        limit = request.limit ?? options.limits.listPageLimit
      if (!pageValid(offset, limit, options.limits.listPageLimit) || request.pattern.length === 0)
        return reject(request.requestId, 'invalidInput')
      const result = await run(request, 'search', {
        offset,
        limit,
        pattern: Buffer.from(request.pattern).toString('base64'),
        content: request.match === 'content',
        recursive: request.recursive,
        entryBudget: options.limits.searchEntryBudget,
        byteBudget: options.limits.searchByteBudget,
        fileBytes: options.limits.searchFileBytes,
      })
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: {
              root: identity(result.info),
              hits: searchHits(result),
              truncated: result.truncated,
              ...(result.next < 0 ? {} : { nextOffset: result.next }),
            },
          }
    },
    async mkdir(original) {
      const request = snapshot(original)
      const result = await run(request, 'mkdir', { recursive: request.parents })
      return 'kind' in result
        ? result
        : { kind: 'done', requestId: request.requestId, value: identity(result.info) }
    },
    async remove(original) {
      const request = snapshot(original)
      const result = await run(request, 'remove', {
        recursive: request.recursive,
        version: request.expectedVersion ?? null,
      })
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: { removed: { token: result.info.token } },
          }
    },
    move: request => changed(request, 'move'),
    copy: request => changed(request, 'copy'),
  }
}

function searchHits(result: NativeReply) {
  return result.hits.map(hit => ({
    path: hit.path,
    object: { token: hit.token },
    ...(hit.offsetBytes < 0 ? {} : { offsetBytes: hit.offsetBytes }),
  }))
}
