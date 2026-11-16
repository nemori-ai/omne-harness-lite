import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, SupplyAnswer, SupplyInput } from '@omne-harness/runtime-context-contract'
import { backgroundCallsSchema, type ToolBackgroundCallsValue } from './background-calls.ts'
import type { ToolRecovery } from './execution.ts'
import { encodeToolInvocationRef } from './reference.ts'
import type { ToolState } from './results.ts'

export type ToolBackgroundCallSource = Pick<ToolRecovery, 'admission' | 'state' | 'tasks'> &
  Readonly<{
    tenant: TenantId
    requesterScope: ScopeRef
    description: SupplyAnswer<
      Pick<ToolBackgroundCallsValue['calls'][number], 'activity' | 'waiting'>
    >
  }>

export type ToolBackgroundCallsSource =
  | Exclude<
      SupplyAnswer<
        Readonly<{
          tenant: TenantId
          scope: ScopeRef
          calls: readonly ToolBackgroundCallSource[]
        }>
      >,
      { kind: 'none' }
    >
  | Readonly<{ kind: 'partial' }>

function deliveryOf(state: ToolState): ToolBackgroundCallsValue['calls'][number]['delivery'] {
  const deliveries = [state.delivery, ...state.supplements.map(value => value.delivery)]
  if (deliveries.some(value => value?.kind === 'pending')) return 'pending'
  return deliveries.some(value => value?.kind === 'released') ? 'released' : 'none'
}

function outstanding(call: ToolBackgroundCallSource): boolean {
  const { state } = call
  return (
    state.phase !== 'settled' ||
    (state.execution.kind !== 'ended' && state.execution.kind !== 'not-started') ||
    call.tasks.length > 0 ||
    deliveryOf(state) === 'pending'
  )
}

function projectCall(
  original: ToolBackgroundCallSource,
): SupplyAnswer<ToolBackgroundCallsValue['calls'][number]> {
  if (original.state.relation !== 'background' || !outstanding(original)) return { kind: 'none' }
  const description = original.description
  if (description.kind === 'none') return { kind: 'unknown' }
  if (description.kind !== 'value') return description
  const reference = encodeToolInvocationRef({
    tenant: original.tenant,
    call: original.state.call,
    admission: original.admission,
  })
  if ('failure' in reference) return { kind: 'unknown' }
  return {
    kind: 'value',
    value: {
      call: original.state.call,
      reference: reference.ok,
      activity: description.value.activity,
      waiting: description.value.waiting,
      revision: original.state.revision,
      phase: original.state.phase,
      execution: original.state.execution.kind,
      pending: [...new Set(original.tasks.map(task => task.kind))],
      delivery: deliveryOf(original.state),
    },
  }
}

function matchesTarget(
  input: SupplyInput,
  source: Readonly<{ tenant: TenantId; scope: ScopeRef }>,
): boolean {
  return tenantEquals(source.tenant, input.tenant) && source.scope.ref === input.scope.ref
}

export function projectToolBackgroundCalls({
  input,
  source,
}: Readonly<{
  input: SupplyInput
  source: ToolBackgroundCallsSource
}>): SupplyAnswer<ToolBackgroundCallsValue> {
  if (source.kind === 'partial') return { kind: 'unknown' }
  if (source.kind !== 'value') return source
  const directory = source.value
  if (!matchesTarget(input, directory)) return { kind: 'refused' }
  const calls: ToolBackgroundCallsValue['calls'][number][] = []
  for (const original of directory.calls) {
    if (!matchesTarget(input, { tenant: original.tenant, scope: original.requesterScope }))
      return { kind: 'refused' }
    const call = projectCall(original)
    if (call.kind === 'value') calls.push(call.value)
    else if (call.kind !== 'none') return call
  }
  const shaped = backgroundCallsSchema['~standard'].validate({ tenant: input.tenant, calls })
  return shaped instanceof Promise || shaped.issues !== undefined
    ? { kind: 'unknown' }
    : { kind: 'value', value: shaped.value }
}
