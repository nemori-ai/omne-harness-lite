import { randomUUID } from 'node:crypto'
import type {
  CommandFacility,
  CommandRetention,
  Containment,
  EnvironmentBinding,
  EnvironmentLease,
  FacilityKey,
  FacilityRequest,
  FacilityResult,
  FileSystemFacility,
  FilesScope,
  ObjectToken,
  OriginRef,
  ProgramFacility,
  ProgramRunRequest,
  ScreenFacility,
  TerminalFacility,
  TerminalRetention,
} from '@omne-harness/execution-environment-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ConsumerRef, ToolCallDirectory, ToolFailure } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolMediaSink,
  ToolMediaStore,
} from '@omne-harness/tool-contract/provider'

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
export type EnvironmentFacts = Readonly<{
  system: string
  release: string
  architecture: string
  facilities: readonly FacilityKey[]
}>
export type ToolEnvironmentValue = Readonly<{
  files: AuthorFacility<FileSystemFacility<unknown>>
  command: Omit<AuthorFacility<CommandFacility<unknown>>, 'retention' | 'containment'> & {
    readonly retention?: AuthorFacility<CommandRetention<unknown>>
    readonly containment?: Containment
  }
  terminal: Omit<AuthorFacility<TerminalFacility<unknown>>, 'retention'> & {
    readonly retention?: AuthorFacility<TerminalRetention<unknown>>
  }
  facts: EnvironmentFacts & Readonly<{ os: string }>
  media: ToolMediaSink
  screen: AuthorFacility<ScreenFacility<unknown>>
  program: Readonly<{
    run(
      request: Omit<ProgramRunRequest<unknown>, keyof FacilityRequest<unknown>>,
    ): ReturnType<ProgramFacility<unknown>['run']>
  }>
  /** Where the call works by default: the directory pinned in its request. Absent: it has none. */
  directory?: string
  /** The files scope pinned with the directory; absent when none was: a session with no workspace. */
  scope?: FilesScope
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
  /** The provider that stores products, taken anew at each put; absent while none is installed. */
  media: () => ToolMediaStore<P> | undefined
  directory?: ToolCallDirectory
}>

function namingFailure(requestId: string, failure: ToolFailure): FacilityResult<never> {
  if (failure.kind === 'commit-unknown') return { kind: 'unknown', requestId }
  return {
    kind: 'rejected',
    requestId,
    reason: failure.kind === 'denied' ? 'notAuthorized' : 'unavailable',
  }
}

/** The default directory of the author is the directory pinned in the request: one pinned value. */
export function createAuthorEnvironment<P>(input: AuthorEnvironmentInput<P>): ToolEnvironmentValue {
  const value = {
    ...boundFacilities(input),
    media: productSink(input),
    screen: boundScreen(input),
    program: boundProgram(input),
  }
  const pinned = input.directory
  return pinned === undefined
    ? Object.freeze(value)
    : Object.freeze({
        ...value,
        directory: pinned.path,
        ...(pinned.files === undefined ? {} : { scope: pinned.files }),
      })
}

export const TOOL_PRODUCT_OWNER = '@omne-harness/tool-host-local/products'
const PUT = 'media.put'

/** The author names a media type and bytes; the tenant and the holder are those of this call. */
function productSink<P>(input: AuthorEnvironmentInput<P>): ToolMediaSink {
  const { principal, tenant, call } = input.access
  const holder: ConsumerRef = {
    owner: TOOL_PRODUCT_OWNER,
    work: call,
    position: 'result',
    purpose: 'product',
  }
  return Object.freeze({
    async put({ mediaType, bytes }) {
      const store = input.media()
      if (store === undefined)
        return fail({
          kind: 'unavailable',
          operation: PUT,
          reason: 'no provider stores products on this host',
        })
      try {
        return await store.put({ principal, tenant, holder, mediaType, bytes })
      } catch {
        return fail({ kind: 'unknown', operation: PUT, reason: 'the store did not answer' })
      }
    },
  } satisfies ToolMediaSink)
}

function requestOf<P>(input: AuthorEnvironmentInput<P>): FacilityRequest<P> {
  return {
    requestId: randomUUID(),
    access: { principal: input.access.principal, tenant: input.access.tenant },
    origin: input.origin,
    binding: input.lease.placement.binding,
  }
}

/** The screen of the placement of this call; a placement without one answers unavailable. */
function boundScreen<P>(input: AuthorEnvironmentInput<P>): ToolEnvironmentValue['screen'] {
  const over = async <T>(
    perform: (facility: ScreenFacility<unknown>, common: FacilityRequest<P>) => Promise<T>,
  ) => {
    const common = requestOf(input)
    const facility = input.lease.facility('screen')
    return facility
      ? perform(facility, common)
      : ({ kind: 'rejected', requestId: common.requestId, reason: 'unavailable' } as const)
  }
  return Object.freeze({
    list: () => over((facility, common) => facility.list(common)),
    capture: ({ screen, region }) =>
      over((facility, common) => facility.capture({ ...common, screen, region })),
  } satisfies ToolEnvironmentValue['screen'])
}

function boundProgram<P>(input: AuthorEnvironmentInput<P>): ToolEnvironmentValue['program'] {
  return Object.freeze({
    async run(request) {
      const common = requestOf(input)
      const facility = input.lease.facility('program')
      return facility
        ? facility.run({ ...request, ...common })
        : ({ kind: 'rejected', requestId: common.requestId, reason: 'unavailable' } as const)
    },
  } satisfies ToolEnvironmentValue['program'])
}

function boundFacilities<P>(
  input: AuthorEnvironmentInput<P>,
): Omit<ToolEnvironmentValue, 'media' | 'screen' | 'program'> {
  const base = () => requestOf(input)
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

  type RetentionRequest<O extends keyof CommandRetention<unknown>> = BusinessRequest<
    Parameters<NonNullable<CommandRetention<unknown>[O]>>[0]
  >
  const offered = input.lease.facility('command')
  const containment = offered?.containment
  const command: ToolEnvironmentValue['command'] = {
    ...(containment === undefined ? {} : { containment }),
    ...(offered?.retention === undefined
      ? {}
      : {
          retention: Object.freeze({
            async list(request: RetentionRequest<'list'>) {
              const common = base()
              const retention = input.lease.facility('command')?.retention
              return retention
                ? retention.list({ ...request, ...common })
                : absent(common.requestId)
            },
            ...(offered.retention.stop === undefined
              ? {}
              : {
                  async stop(request: RetentionRequest<'stop'>) {
                    const common = base()
                    const retention = input.lease.facility('command')?.retention
                    return retention?.stop
                      ? retention.stop({ ...request, ...common })
                      : absent(common.requestId)
                  },
                }),
            ...(offered.retention.output === undefined
              ? {}
              : {
                  async output(request: RetentionRequest<'output'>) {
                    const common = base()
                    const retention = input.lease.facility('command')?.retention
                    return retention?.output
                      ? retention.output({ ...request, ...common })
                      : absent(common.requestId)
                  },
                }),
          }),
        }),
    async start(request) {
      const common = base()
      const facility = input.lease.facility('command')
      return facility ? facility.start({ ...request, ...common }) : absent(common.requestId)
    },
  }
  const terminal: ToolEnvironmentValue['terminal'] = {
    ...(input.lease.facility('terminal')?.retention === undefined
      ? {}
      : {
          retention: Object.freeze({
            async attach(
              request: BusinessRequest<Parameters<TerminalRetention<unknown>['attach']>[0]>,
            ) {
              const common = base()
              const retention = input.lease.facility('terminal')?.retention
              return retention
                ? retention.attach({ ...request, ...common })
                : absent(common.requestId)
            },
            async detach(
              request: BusinessRequest<Parameters<TerminalRetention<unknown>['detach']>[0]>,
            ) {
              const common = base()
              const retention = input.lease.facility('terminal')?.retention
              return retention
                ? retention.detach({ ...request, ...common })
                : absent(common.requestId)
            },
          }),
        }),
    async create(request) {
      const common = base()
      const facility = input.lease.facility('terminal')
      return facility ? facility.create({ ...request, ...common }) : absent(common.requestId)
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
