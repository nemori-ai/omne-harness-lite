import type { ContentBlock } from '@omne-harness/content-block'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, SupplyAnswer, SupplyInput } from '@omne-harness/runtime-context-contract'
import { backgroundCallsSchema, type ToolBackgroundCallsValue } from './background-calls.ts'
import type { ToolRecovery } from './execution.ts'
import { encodeToolInvocationRef } from './reference.ts'
import type { ToolState } from './results.ts'

/** Original committed facts and currently disclosable text, bound by their source to this call. */
export type ToolBackgroundCallSource = Pick<
  ToolRecovery<ContentBlock>,
  'admission' | 'state' | 'tasks'
> &
  Readonly<{
    tenant: TenantId
    requesterScope: ScopeRef
    description: SupplyAnswer<
      Pick<ToolBackgroundCallsValue['calls'][number], 'activity' | 'waiting'>
    >
  }>

/**
 * The source's answer for this supply's actual scope, tenant and principal. `value` means its
 * authorized directory is complete and its original facts are readable. This type performs no
 * authorization. A partial scan is `partial`, even when it found no calls.
 */
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

/**
 * Pure projection, with no I/O or authorization. The supply callback must obtain `source` afresh
 * for this `input` after checking the actual principal, scope binding and disclosure permission.
 * A shaped input or matching identifier does not establish any of those facts.
 */
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
