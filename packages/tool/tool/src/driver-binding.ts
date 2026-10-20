import type { ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CallAccess,
  PreparationRecord,
  ToolFailure,
  ToolLiveExecution,
  ToolRecovery,
  ToolStartLookup,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import type { ToolDependencies } from './construction.ts'
import { tenantKey } from './boundary.ts'

type Invocation =
  | Readonly<{ kind: 'port-failed'; failure: ToolFailure }>
  | Readonly<{ kind: 'binding-failed' }>
  | Readonly<{ kind: 'binding-threw' }>
  | Readonly<{ kind: 'live' }>

export function createBindingInvoker<P, B extends ContentBlock, E>(
  { authority, bindings }: Pick<ToolDependencies<P, B, E>, 'authority' | 'bindings'>,
  environmentOf: (
    access: CallAccess<P>,
    preparation: PreparationRecord,
  ) => Promise<Outcome<E, ToolFailure>>,
) {
  const lives = new Map<string, ToolLiveExecution<B>>()
  const callKey = (tenant: CallAccess<P>['tenant'], call: CallAccess<P>['call']) =>
    `${tenantKey(tenant)}\u0000${call}`
  /** Starts through the binding, which stages the capsule and consumes the permit (P04). */
  const invoke = async (
    step: CallAccess<P>,
    recovery: ToolRecovery<B>,
    start: Extract<ToolStartRecord, { kind: 'start' }>,
  ): Promise<Invocation> => {
    const access = { principal: step.principal, tenant: step.tenant, call: step.call }
    const permit = await authority.prepare({ ...access, start, request: recovery.request })
    if ('failure' in permit) return { kind: 'port-failed', failure: permit.failure }
    const binding = await bindings.resolve({ ...access, request: recovery.request })
    if ('failure' in binding) return { kind: 'port-failed', failure: binding.failure }
    if (binding.ok.kind !== 'live-only')
      return {
        kind: 'port-failed',
        failure: {
          kind: 'unsupported',
          adoption: start.executor,
          reason: 'a checkpointed binding needs a later increment',
        },
      }
    const preparation = recovery.preparations.at(-1)
    if (preparation === undefined)
      return {
        kind: 'port-failed',
        failure: { kind: 'invalid', field: 'call', reason: 'no-preparation' },
      }
    const environment = await environmentOf(step, preparation)
    if ('failure' in environment) return { kind: 'port-failed', failure: environment.failure }
    try {
      const live = await binding.ok.start(
        { ...access, start, permit: permit.ok, request: recovery.request },
        environment.ok,
      )
      if ('failure' in live) return { kind: 'binding-failed' }
      lives.set(callKey(step.tenant, step.call), live.ok)
      return { kind: 'live' }
    } catch {
      return { kind: 'binding-threw' }
    }
  }

  /** Queries the original start without treating a handle or final fact as authority acceptance. */
  const inspectBinding = async (
    step: CallAccess<P>,
    recovery: ToolRecovery<B>,
    start: ToolStartRecord,
  ): Promise<Outcome<ToolStartLookup<B>, ToolFailure>> => {
    const access = { principal: step.principal, tenant: step.tenant, call: step.call }
    const binding = await bindings.resolve({ ...access, request: recovery.request })
    if ('failure' in binding) return binding
    const found = await binding.ok.inspectStart({ ...access, start })
    if ('ok' in found && found.ok.kind === 'live')
      lives.set(callKey(step.tenant, step.call), found.ok.execution)
    return found
  }

  return {
    invoke,
    inspect: inspectBinding,
    hasLive: (access: CallAccess<P>) => lives.has(callKey(access.tenant, access.call)),
  }
}
