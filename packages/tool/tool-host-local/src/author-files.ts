import type {
  FacilityRequest,
  FacilityResult,
  FileSystemFacility,
  ObjectToken,
} from '@omne-harness/execution-environment-contract'
import type { AuthorEnvironmentInput, ToolEnvironmentValue } from './author-environment.ts'
import { namingFailure, requestOf } from './author-requests.ts'
import type { directoryObserver } from './directory-visits.ts'

export function boundFiles<P>(
  input: AuthorEnvironmentInput<P>,
  observer: ReturnType<typeof directoryObserver>,
): ToolEnvironmentValue['files'] {
  const observation = observer.enabled ? { observeDirectory: true as const } : {}
  const name = (
    operation: keyof FileSystemFacility<P>,
    path: string,
    role: 'object' | 'parent' | 'ancestor',
  ) =>
    input.naming.name({
      ...input.access,
      origin: input.origin,
      binding: input.lease.placement.binding,
      operation,
      path,
      role,
    })
  const absent = (requestId: string): FacilityResult<never> => ({
    kind: 'rejected',
    requestId,
    reason: 'unavailable',
  })

  async function file<R extends { readonly path: string }, T>(
    operation: keyof FileSystemFacility<P>,
    request: R,
    role: 'object' | 'parent' | 'ancestor',
    perform: (
      facility: FileSystemFacility<unknown>,
      request: R & FacilityRequest<P> & { readonly named: ObjectToken },
    ) => Promise<FacilityResult<T>>,
  ): Promise<FacilityResult<T>> {
    const fixed = structuredClone(request)
    const common = requestOf(input)
    const named = await name(operation, fixed.path, role)
    if ('failure' in named) return namingFailure(common.requestId, named.failure)
    const facility = input.lease.facility('files')
    if (!facility) return absent(common.requestId)
    const result = await perform(facility, {
      ...fixed,
      ...common,
      named: named.ok,
      ...observation,
    })
    if (result.kind === 'done')
      for (const path of result.verifiedDirectories ?? []) observer.observed(path)
    return result
  }

  const files: ToolEnvironmentValue['files'] = {
    read: request => file('read', request, 'object', (f, r) => f.read(r)),
    stat: request => file('stat', request, 'object', (f, r) => f.stat(r)),
    write: request =>
      file('write', request, request.mode === 'create' ? 'parent' : 'object', (f, r) => f.write(r)),
    close: request => file('close', request, 'object', (f, r) => f.close(r)),
    list: request => file('list', request, 'object', (f, r) => f.list(r)),
    search: request => file('search', request, 'object', (f, r) => f.search(r)),
    mkdir: request =>
      file('mkdir', request, request.parents ? 'ancestor' : 'parent', (f, r) => f.mkdir(r)),
    remove: request => file('remove', request, 'object', (f, r) => f.remove(r)),
    move: request => transfer('move', request),
    copy: request => transfer('copy', request),
    async commitBatch(request) {
      const fixed = structuredClone(request.entries)
      const common = requestOf(input)
      const entries = []
      for (const entry of fixed) {
        const named = await name(
          'commitBatch',
          entry.path,
          entry.expectedVersion === null ? 'parent' : 'object',
        )
        if ('failure' in named) return namingFailure(common.requestId, named.failure)
        entries.push({ ...entry, named: named.ok })
      }
      const facility = input.lease.facility('files')
      if (!facility) return absent(common.requestId)
      const result = await facility.commitBatch({ entries, ...common, ...observation })
      if (result.kind === 'done')
        for (const path of result.verifiedDirectories ?? []) observer.observed(path)
      return result
    },
    async recoverBatch(request) {
      const common = requestOf(input)
      const facility = input.lease.facility('files')
      return facility ? facility.recoverBatch({ ...request, ...common }) : absent(common.requestId)
    },
  }

  async function transfer(
    operation: 'move' | 'copy',
    request: Parameters<ToolEnvironmentValue['files']['move']>[0],
  ) {
    return file(operation, request, 'object', async (facility, source) => {
      const target = await name(operation, source.target.path, 'parent')
      if ('failure' in target) return namingFailure(source.requestId, target.failure)
      return facility[operation]({
        ...source,
        target: { path: source.target.path, named: target.ok },
      })
    })
  }

  return Object.freeze(files)
}
