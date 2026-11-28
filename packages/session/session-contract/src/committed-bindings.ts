import type { ConsumptionId } from './identity.ts'
import type { WorkSnapshot } from './values.ts'

export type CommittedBinding = Readonly<{
  kind: 'call-registration' | 'call-association'
  consumption: ConsumptionId
}>

export function boundConsumptions(
  snapshot: Pick<WorkSnapshot, 'callRegistrations'>,
  consumptions: Iterable<ConsumptionId>,
): ConsumptionId[] {
  return [...new Set(consumptions)].filter(
    consumption =>
      snapshot.callRegistrations?.find(item => item.consumption === consumption)?.registration
        .kind === 'associated',
  )
}

export function committedBindings(bound: Iterable<ConsumptionId>): CommittedBinding[] {
  return [...new Set(bound)].flatMap(consumption => [
    { kind: 'call-registration' as const, consumption },
    { kind: 'call-association' as const, consumption },
  ])
}

export function withoutCommitted<T>(
  items: readonly T[],
  committed: readonly CommittedBinding[],
  kindOf: (item: T) => string,
): T[] {
  const left: string[] = committed.map(item => item.kind)
  return items.filter(item => {
    const at = left.indexOf(kindOf(item))
    if (at === -1) return true
    left.splice(at, 1)
    return false
  })
}
