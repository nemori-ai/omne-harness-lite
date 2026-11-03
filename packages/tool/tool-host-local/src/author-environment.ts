import { randomUUID } from 'node:crypto'
import type {
  CommandFacility,
  EnvironmentBinding,
  EnvironmentLease,
  FacilityKey,
  FacilityRequest,
  FacilityResult,
  FileSystemFacility,
  ObjectToken,
  OriginRef,
  TerminalFacility,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'

type BusinessRequest<T> = T extends { readonly entries: readonly (infer E)[] }
  ? Omit<T, keyof FacilityRequest<unknown> | 'entries'> & {
      readonly entries: readonly Omit<E, 'named'>[]
    }
  : T extends { readonly target: infer Target }
    ? Omit<T, keyof FacilityRequest<unknown> | 'named' | 'target'> & {
        readonly target: Omit<Target, 'named'>
      }
    : Omit<T, keyof FacilityRequest<unknown> | 'named'>

export type AuthorFacility<F> = {
  readonly [K in keyof F]: NonNullable<F[K]> extends (request: infer R) => infer Result
    ? (request: BusinessRequest<R>) => Result
    : never
}
type RetentionTerminalFacility<P> = Omit<TerminalFacility<P>, 'create'> & {
  create(
    request: Parameters<TerminalFacility<P>['create']>[0] & { readonly retain?: 'session' },
  ): ReturnType<TerminalFacility<P>['create']>
  attach?(
    request: FacilityRequest<P> & { readonly terminal: TerminalRef },
  ): Promise<FacilityResult<{ readonly terminal: TerminalRef }>>
  detach?(
    request: FacilityRequest<P> & { readonly terminal: TerminalRef },
  ): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>>
}
export type EnvironmentFacts = Readonly<{
  system: string
  release: string
  architecture: string
  facilities: readonly FacilityKey[]
}>
export type ToolEnvironmentValue = Readonly<{
  files: AuthorFacility<FileSystemFacility<unknown>>
  command: AuthorFacility<CommandFacility<unknown>>
  terminal: AuthorFacility<RetentionTerminalFacility<unknown>>
  facts: EnvironmentFacts & Readonly<{ os: string }>
}>
export interface FileObjectNaming<P> {
  name(
    input: CallAccess<P> &
      Readonly<{
        origin: OriginRef
        binding: EnvironmentBinding
        operation: keyof FileSystemFacility<P>
        path: string
        role: 'object' | 'parent' | 'ancestor'
      }>,
  ): Promise<Outcome<ObjectToken, ToolFailure>>
}
export type AuthorEnvironmentInput<P> = Readonly<{
  access: CallAccess<P>
  origin: OriginRef
  lease: EnvironmentLease
  naming: FileObjectNaming<P>
  facts: EnvironmentFacts
}>

function namingFailure(requestId: string, failure: ToolFailure): FacilityResult<never> {
  if (failure.kind === 'commit-unknown') return { kind: 'unknown', requestId }
  return {
    kind: 'rejected',
    requestId,
    reason: failure.kind === 'denied' ? 'notAuthorized' : 'unavailable',
  }
}

export function createAuthorEnvironment<P>(input: AuthorEnvironmentInput<P>): ToolEnvironmentValue {
  const base = (): FacilityRequest<P> => ({
    requestId: randomUUID(),
    access: { principal: input.access.principal, tenant: input.access.tenant },
    origin: input.origin,
    binding: input.lease.placement.binding,
  })
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
    const common = base()
    const named = await name(operation, fixed.path, role)
    if ('failure' in named) return namingFailure(common.requestId, named.failure)
    const facility = input.lease.facility('files')
    if (!facility) return absent(common.requestId)
    return perform(facility, { ...fixed, ...common, named: named.ok })
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
      const common = base()
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
      return facility ? facility.commitBatch({ entries, ...common }) : absent(common.requestId)
    },
    async recoverBatch(request) {
      const common = base()
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

  const command: ToolEnvironmentValue['command'] = {
    async start(request) {
      const common = base()
      const facility = input.lease.facility('command')
      return facility ? facility.start({ ...request, ...common }) : absent(common.requestId)
    },
  }
  const terminal: ToolEnvironmentValue['terminal'] = {
    async create(request) {
      const common = base()
      const facility = input.lease.facility('terminal')
      return facility ? facility.create({ ...request, ...common }) : absent(common.requestId)
    },
    async attach(request) {
      const common = base()
      const facility: RetentionTerminalFacility<unknown> | undefined =
        input.lease.facility('terminal')
      if (!facility) return absent(common.requestId)
      return facility.attach
        ? facility.attach({ ...request, ...common })
        : { kind: 'rejected', requestId: common.requestId, reason: 'unsupported' }
    },
    async detach(request) {
      const common = base()
      const facility: RetentionTerminalFacility<unknown> | undefined =
        input.lease.facility('terminal')
      if (!facility) return absent(common.requestId)
      return facility.detach
        ? facility.detach({ ...request, ...common })
        : { kind: 'rejected', requestId: common.requestId, reason: 'unsupported' }
    },
    async execute(request) {
      const common = base()
      const facility = input.lease.facility('terminal')
      return facility ? facility.execute({ ...request, ...common }) : absent(common.requestId)
    },
    async close(request) {
      const common = base()
      const facility = input.lease.facility('terminal')
      return facility ? facility.close({ ...request, ...common }) : absent(common.requestId)
    },
    async list(request) {
      const common = base()
      const facility = input.lease.facility('terminal')
      return facility ? facility.list({ ...request, ...common }) : absent(common.requestId)
    },
  }
  return Object.freeze({
    files: Object.freeze(files),
    command: Object.freeze(command),
    terminal: Object.freeze(terminal),
    facts: Object.freeze({
      ...input.facts,
      os: input.facts.system,
      facilities: Object.freeze([...input.facts.facilities]),
    }),
  })
}
