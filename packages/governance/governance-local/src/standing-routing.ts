import type { StandingReservation } from '@omne-harness/identity'
import { standingRecoverySchema } from './standing-schema.ts'
import { canonical } from './encoding.ts'

export type StandingRoute = Readonly<{ destination: string; transactionDomain: string }>

export function standingOperation(reservation: StandingReservation, route: StandingRoute) {
  const binding = reservation.binding
  if (binding.owner !== 'governance' || binding.destination !== route.destination) return undefined
  try {
    const parsed = standingRecoverySchema.safeParse(JSON.parse(binding.targetRef))
    if (
      !parsed.success ||
      canonical(parsed.data) !== binding.targetRef ||
      parsed.data.transactionDomain !== route.transactionDomain
    )
      return undefined
    const operation = parsed.data.operation
    return operation.ref.scope.tenantRef === binding.scopeRef &&
      operation.ref.principalRef === binding.principalRef &&
      operation.requestDigest === binding.inputDigest
      ? operation
      : undefined
  } catch {
    return undefined
  }
}
