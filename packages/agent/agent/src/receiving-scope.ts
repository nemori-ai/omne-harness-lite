import type {
  Access,
  AgentExecutionId,
  Failure,
  Reply,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from './canonical.ts'
import type { ModelReceiverDependencies, ModelReceptionTarget } from './receiving-types.ts'
import { bindingKey } from './receiving-state.ts'

export type MaintenanceInput<P> = {
  access: Access<P>
  execution: AgentExecutionId
  signal: AbortSignal
}
export const maintenanceUnavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'agent-model-receiver',
  diagnostic,
})
export const maintenanceDenied = (): Failure => ({ kind: 'denied', action: 'receive-result' })
export const cancelledMaintenance = () => fail(maintenanceUnavailable('maintenance-cancelled'))
export async function qualify<P>(
  dependencies: ModelReceiverDependencies<P>,
  access: Access<P>,
  targets: readonly ModelReceptionTarget[],
  signal: AbortSignal,
): Reply<void> {
  const seen = new Set<string>()
  for (const target of targets) {
    if (signal.aborted) return cancelledMaintenance()
    const key = canonical([target.instance, target.execution])
    if (seen.has(key)) continue
    seen.add(key)
    const allowed = await dependencies.access.check({
      access,
      operation: 'receive-result',
      target: { kind: 'execution', execution: target.execution },
    })
    if (allowed.kind === 'denied') return fail(maintenanceDenied())
    if (allowed.kind === 'unavailable') return fail(maintenanceUnavailable('access'))
  }
  return succeed(undefined)
}
export function entryTarget(
  entry: ReceivedEntry,
  targets: readonly ModelReceptionTarget[],
): ModelReceptionTarget | undefined {
  if (entry.delivery.producer !== 'model') return undefined
  return targets.find(
    target =>
      target.pending.reference === entry.delivery.key.reference &&
      target.pending.consumption === entry.consumption &&
      canonical(target.pending.position) === canonical(entry.consumer),
  )
}
export const scopeOf = <P>(access: Access<P>, targets: readonly ModelReceptionTarget[]) =>
  new Set(targets.map(target => bindingKey(access, target)))
/** Stop waiting, never cancel the actual owned task. */
export async function waitForMaintenance<T>(work: Reply<T>, signal: AbortSignal): Reply<T> {
  if (signal.aborted) return cancelledMaintenance()
  const aborted = Promise.withResolvers<Awaited<Reply<T>>>()
  const onAbort = () => aborted.resolve(cancelledMaintenance())
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([work, aborted.promise])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
