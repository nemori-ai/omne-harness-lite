// The retention side of the command facility that does not depend on the platform: which retention
// binding an acquisition may use, the binding a disposition sees, and the retention extension's
// `list`, `stop` and `output`, all answered by the retained-process index.
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

/** A retention binding the acquisition can use: bound, same scope as the requester, indexed. */
export type RetentionBinding = Readonly<{
  scope: ScopeRef
  released: AbortSignal
  processes: RetainedProcessLedger
  index: RetainedProcessIndex
  tenant: TenantId
}>

/** The acquisition's usable retention binding; the index watches its two closure signals. */
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

/** The retention scope is closed: its release signal or its ledger's close signal fired. */
export const retentionScopeClosed = (binding: RetentionBinding | undefined): boolean =>
  binding !== undefined && (binding.released.aborted || binding.processes.closed.aborted)

/** The binding of one exited domain, as `decideDisposition` sees it. */
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

/**
 * The binding after the index loaded its markers, within `deadline`. Markers not read completely
 * within the bound leave no place to take, as when there is no index.
 */
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

/** A retained process reference is an object whose `id` and `generation` are non-empty text. */
const invalidProcessRef = (value: unknown) =>
  typeof value !== 'object' ||
  value === null ||
  !nonEmptyText(Reflect.get(value, 'id')) ||
  !nonEmptyText(Reflect.get(value, 'generation'))

const outputStreams: readonly string[] = ['stdout', 'stderr', 'terminal']

/** An offset of `from`: a known stream, and a whole number of bytes, zero or more. A stream without an offset has no key. */
const invalidOffset = ([stream, offset]: readonly [string, unknown]) =>
  !outputStreams.includes(stream) || !(Number.isSafeInteger(offset) && Number(offset) >= 0)

const invalidFrom = (value: unknown) =>
  value !== undefined &&
  (typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.entries(value).some(invalidOffset))

/** The shape of a retained-process stop, checked before the index is asked (the contract's `invalidInput`). */
function stopRetainedIssue(request: StopRetainedRequest): FacilityReason | undefined {
  if (invalidProcessRef(request.process)) return 'invalidInput'
  if (request.mode !== 'graceful' && request.mode !== 'forced') return 'invalidInput'
  return undefined
}

/** The shape of a retained-process output request, checked before the index is asked. */
function outputRetainedIssue(request: OutputRetainedRequest): FacilityReason | undefined {
  if (invalidProcessRef(request.process) || invalidFrom(request.from)) return 'invalidInput'
  return undefined
}

/** The retention extension of one acquisition; a sealed facade answers `closed`. */
export function retentionExtension(
  binding: RetentionBinding,
  sealed: () => boolean,
): CommandRetention<unknown> {
  const { index, scope, tenant, processes: view } = binding

  /** The retained processes of the retention scope, from the index; an unreadable index is not empty. */
  const list = async (
    request: ListRequest,
  ): Promise<FacilityResult<readonly RetainedProcessInformation[]>> => {
    if (sealed()) return rejected(request.requestId, 'closed')
    const listed = await index.list(scope, tenant)
    if (listed === 'unavailable') return rejected(request.requestId, 'unavailable')
    return { kind: 'done', requestId: request.requestId, value: listed }
  }

  /**
   * Stops a retained process of the retention scope. Both modes run the forced stop sequence: the
   * main process a graceful stop would signal has exited already.
   */
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

  /** What a retained process of the retention scope wrote after the handover, from its tail. */
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
