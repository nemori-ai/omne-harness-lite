import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommandRetention,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  ProviderAcquireInput,
  RetainedOutput,
  RetainedProcessInformation,
  RetainedProcessLedger,
} from '@omne-harness/execution-environment-contract'
import { bounded, type CustodyBinding } from './command-custody.ts'
import type { ResiduePolicy } from './host-command.ts'
import type { RetainedProcessIndex } from './host-retained-processes.ts'

type ListRequest = Parameters<CommandRetention<unknown>['list']>[0]
type StopRetainedRequest = Parameters<NonNullable<CommandRetention<unknown>['stop']>>[0]
type OutputRetainedRequest = Parameters<NonNullable<CommandRetention<unknown>['output']>>[0]

export type RetentionBinding = Readonly<{
  scope: ScopeRef
  released: AbortSignal
  processes: RetainedProcessLedger
  index: RetainedProcessIndex
  tenant: TenantId
}>

export function retentionBindingOf(input: {
  retention: ProviderAcquireInput['retention'] | undefined
  retained: RetainedProcessIndex | undefined
  scope: ScopeRef
  tenant: TenantId
}): RetentionBinding | undefined {
  const { retention, retained, tenant } = input
  const processes = retention?.processes
  if (
    retention === undefined ||
    processes === undefined ||
    retained === undefined ||
    retention.scope.ref !== input.scope.ref
  )
    return undefined
  const binding = {
    scope: retention.scope,
    released: retention.released,
    processes,
    index: retained,
    tenant,
  }
  retained.watchClosure(binding.released, binding.scope, processes)
  retained.watchClosure(processes.closed, binding.scope, processes)
  return binding
}

export const retentionScopeClosed = (binding: RetentionBinding | undefined): boolean =>
  binding !== undefined && (binding.released.aborted || binding.processes.closed.aborted)

export function custodyBindingOf(input: {
  policy: ResiduePolicy
  retention: ProviderAcquireInput['retention'] | undefined
  binding: RetentionBinding | undefined
  resource: ManagedResource
}): CustodyBinding | 'policy' | 'unbound' {
  if (input.policy === 'stop') return 'policy'
  if (input.retention?.processes === undefined) return 'unbound'
  const binding = input.binding
  if (binding === undefined) return 'policy'
  const { scope, processes: view, index, tenant } = binding
  return {
    closed: () => retentionScopeClosed(binding),
    reserve: () => index.reserve(scope, tenant, input.resource.key),
    plan: () => view.plan(input.resource),
    adopt: () => view.adopt(input.resource.key),
  }
}

export async function loadedCustodyBinding(
  custody: CustodyBinding | 'policy' | 'unbound',
  binding: RetentionBinding | undefined,
  members: number | null,
  deadline: number,
): Promise<CustodyBinding | 'policy' | 'unbound'> {
  if (typeof custody === 'string' || binding === undefined || members === 0) return custody
  const index = binding.index
  const loaded = await bounded(
    () => index.ready().then(complete => (complete ? 'loaded' : 'incomplete')),
    deadline,
  )
  return loaded === 'loaded' ? custody : 'policy'
}

const rejected = (requestId: string, reason: FacilityReason): FacilityResult<never> => ({
  kind: 'rejected',
  requestId,
  reason,
})

const nonEmptyText = (value: unknown): value is string => typeof value === 'string' && value !== ''

const invalidProcessRef = (value: unknown) =>
  typeof value !== 'object' ||
  value === null ||
  !nonEmptyText(Reflect.get(value, 'id')) ||
  !nonEmptyText(Reflect.get(value, 'generation'))

const outputStreams: readonly string[] = ['stdout', 'stderr', 'terminal']

const invalidOffset = ([stream, offset]: readonly [string, unknown]) =>
  !outputStreams.includes(stream) || !(Number.isSafeInteger(offset) && Number(offset) >= 0)

const invalidFrom = (value: unknown) =>
  value !== undefined &&
  (typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.entries(value).some(invalidOffset))

function stopRetainedIssue(request: StopRetainedRequest): FacilityReason | undefined {
  if (invalidProcessRef(request.process)) return 'invalidInput'
  if (request.mode !== 'graceful' && request.mode !== 'forced') return 'invalidInput'
  return undefined
}

function outputRetainedIssue(request: OutputRetainedRequest): FacilityReason | undefined {
  if (invalidProcessRef(request.process) || invalidFrom(request.from)) return 'invalidInput'
  return undefined
}

export function retentionExtension(
  binding: RetentionBinding,
  sealed: () => boolean,
): CommandRetention<unknown> {
  const { index, scope, tenant, processes: view } = binding

  const list = async (
    request: ListRequest,
  ): Promise<FacilityResult<readonly RetainedProcessInformation[]>> => {
    if (sealed()) return rejected(request.requestId, 'closed')
    const listed = await index.list(scope, tenant)
    if (listed === 'unavailable') return rejected(request.requestId, 'unavailable')
    return { kind: 'done', requestId: request.requestId, value: listed }
  }

  const stop = async (
    request: StopRetainedRequest,
  ): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>> => {
    const issue = stopRetainedIssue(request)
    if (issue !== undefined) return rejected(request.requestId, issue)
    if (sealed()) return rejected(request.requestId, 'closed')
    const answer = await index.stopRef(request.process, scope, tenant, view)
    if (answer === 'notFound' || answer === 'unavailable')
      return rejected(request.requestId, answer)
    return { kind: 'done', requestId: request.requestId, value: { status: answer } }
  }

  const output = async (
    request: OutputRetainedRequest,
  ): Promise<FacilityResult<RetainedOutput>> => {
    const issue = outputRetainedIssue(request)
    if (issue !== undefined) return rejected(request.requestId, issue)
    if (sealed()) return rejected(request.requestId, 'closed')
    const answer = await index.output(request.process, scope, tenant, request.from)
    if (answer === 'notFound' || answer === 'unavailable')
      return rejected(request.requestId, answer)
    return { kind: 'done', requestId: request.requestId, value: answer }
  }

  return { list, stop, output }
}
