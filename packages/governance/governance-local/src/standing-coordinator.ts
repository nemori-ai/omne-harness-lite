import { z } from 'zod'
import type {
  ActingForTenantPrincipal,
  StandingDestinationResolver,
  StandingReservation,
  StandingReservations,
  StandingRequest,
} from '@omne-harness/identity'
import { SqlOperationCoordinator, type StageControlRequest } from './sql-coordinator.ts'
import { bindingSchema, type OperationBinding } from './operation-schema.ts'
import { equal } from './encoding.ts'
import {
  standingCustodySchema,
  standingPlanSchema,
  standingReceiptSchema,
  type StandingCustody,
  type StandingPlan,
} from './standing-schema.ts'
import { standingOperation, type StandingRoute } from './standing-routing.ts'

const failureSchema = z.union([
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ kind: z.literal('unplanned') }),
  z.strictObject({ kind: z.literal('conflict'), reason: z.literal('operation') }),
])
type Failure =
  | z.infer<typeof failureSchema>
  | Readonly<{
      kind: 'unavailable'
      owner: 'sql-coordination' | 'identity-standing'
    }>
export type StandingProgress =
  | Exclude<StandingCustody, { kind: 'requested' }>
  | Failure
  | Readonly<{ kind: 'rejected'; reason: 'denied' | 'blocked' }>
const unavailable = (owner: 'sql-coordination' | 'identity-standing'): Failure => ({
  kind: 'unavailable',
  owner,
})
const terminalSchema = z.strictObject({
  kind: z.literal('terminal'),
  reservation: standingReceiptSchema,
  outcome: z.enum(['committed', 'aborted']),
})
const sourceReplySchema = z.union([
  terminalSchema,
  z.strictObject({ kind: z.literal('held'), reservation: standingReceiptSchema }),
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({ kind: z.literal('blocked') }),
  z.strictObject({ kind: z.literal('operation-conflict') }),
  z.strictObject({ kind: z.literal('unavailable'), diagnostic: z.string() }),
])
function matched(reservation: StandingReservation, request: StandingRequest) {
  return equal({ binding: reservation.binding, required: reservation.required }, request)
}

export class GovernanceStandingDestination implements StandingDestinationResolver {
  private readonly route: StandingRoute
  private readonly sql: SqlOperationCoordinator
  constructor(sql: SqlOperationCoordinator, route: StandingRoute) {
    this.sql = sql
    this.route = Object.freeze({ ...route })
  }
  private async original(reservation: StandingReservation) {
    const operation = standingOperation(reservation, this.route)
    if (operation === undefined) return undefined
    const current = await this.sql.observe(operation)
    if (current.kind !== 'found' || current.standing === null) return undefined
    return current.standing.reservationId === reservation.id &&
      matched(reservation, current.standing.request)
      ? operation
      : undefined
  }

  async seal(raw: StandingReservation) {
    const unavailable = {
      kind: 'unavailable' as const,
      diagnostic: 'governance-destination-unavailable',
    }
    try {
      const reservation = standingReceiptSchema.parse(structuredClone(raw))
      const operation = await this.original(reservation)
      if (operation === undefined) return unavailable
      const result = await this.sql.executeControl(operation, {
        kind: 'standing-seal',
        reservation,
        route: this.route,
      })
      if (result.kind !== 'applied') return unavailable
      const proof = terminalSchema.safeParse(result.response)
      return proof.success && equal(proof.data.reservation, reservation) ? proof.data : unavailable
    } catch {
      return unavailable
    }
  }
}

export class GovernanceStandingCoordinator {
  private readonly sql: SqlOperationCoordinator
  private readonly identity: StandingReservations
  constructor(sql: SqlOperationCoordinator, identity: StandingReservations) {
    this.sql = sql
    this.identity = identity
  }

  private async persist(
    operation: OperationBinding,
    command: StageControlRequest,
  ): Promise<Failure | { kind: 'saved' }> {
    const result = await this.sql.executeControl(operation, command)
    if (result.kind !== 'applied') {
      const failure = failureSchema.safeParse(result)
      return failure.success ? failure.data : unavailable('sql-coordination')
    }
    const reply = standingCustodySchema.safeParse(result.response)
    if (reply.success && equal(reply.data, result.response)) return { kind: 'saved' }
    const failure = failureSchema.safeParse(result.response)
    return failure.success ? failure.data : unavailable('sql-coordination')
  }

  private async progress(operation: OperationBinding): Promise<StandingProgress> {
    const current = await this.sql.observe(operation)
    if (current.kind !== 'found') return current
    if (current.standing === null) return { kind: 'unplanned' }
    return current.standing.kind === 'requested'
      ? unavailable('identity-standing')
      : current.standing
  }

  private async store(
    operation: OperationBinding,
    reply: Extract<z.infer<typeof sourceReplySchema>, { reservation: StandingReservation }>,
  ): Promise<StandingProgress> {
    const command: StageControlRequest =
      reply.kind === 'held'
        ? { kind: 'standing-held', binding: operation, reservation: reply.reservation }
        : {
            kind: 'standing-settled',
            binding: operation,
            reservation: reply.reservation,
            outcome: reply.outcome,
          }
    const saved = await this.persist(operation, command)
    return saved.kind === 'saved' ? this.progress(operation) : saved
  }

  async reserve(raw: StandingPlan, principal: ActingForTenantPrincipal): Promise<StandingProgress> {
    const plan = standingPlanSchema.parse(structuredClone(raw))
    const prepared = await this.persist(plan.operation, { kind: 'standing-prepare', input: plan })
    if (prepared.kind !== 'saved') return prepared
    const current = await this.sql.observe(plan.operation)
    if (current.kind !== 'found') return current
    if (current.standing === null) return unavailable('sql-coordination')
    if (current.standing.kind === 'settled') return current.standing
    if (current.record.state === 'committed' || current.record.state === 'aborted')
      return this.settle(plan.operation)
    if (current.standing.kind === 'held') return current.standing
    return this.reserveSource(plan.operation, principal, current.standing.request)
  }

  private async reserveSource(
    operation: OperationBinding,
    principal: ActingForTenantPrincipal,
    request: StandingRequest,
  ): Promise<StandingProgress> {
    let rawReply: unknown
    try {
      rawReply = structuredClone(await this.identity.reserve({ principal, ...request }))
    } catch {
      return unavailable('identity-standing')
    }
    const reply = sourceReplySchema.safeParse(rawReply)
    if (!reply.success || reply.data.kind === 'unavailable') return unavailable('identity-standing')
    if (reply.data.kind === 'denied' || reply.data.kind === 'blocked')
      return { kind: 'rejected', reason: reply.data.kind }
    if (reply.data.kind === 'operation-conflict') return { kind: 'conflict', reason: 'operation' }
    if (!matched(reply.data.reservation, request)) return unavailable('identity-standing')
    return this.store(operation, reply.data)
  }

  async settle(raw: OperationBinding): Promise<StandingProgress> {
    const operation = bindingSchema.parse(structuredClone(raw))
    const current = await this.sql.observe(operation)
    if (current.kind !== 'found') return current
    const custody = current.standing
    if (custody === null) return { kind: 'unplanned' }
    if (custody.kind === 'settled') return custody
    let rawReply: unknown
    try {
      rawReply = structuredClone(await this.identity.settle(custody.request))
    } catch {
      return unavailable('identity-standing')
    }
    const reply = terminalSchema.safeParse(rawReply)
    if (!reply.success || !matched(reply.data.reservation, custody.request))
      return unavailable('identity-standing')
    return this.store(operation, reply.data)
  }
}
