import { z } from 'zod'
import {
  isStandingBinding,
  isQualification,
  isStandingReservation,
  type StandingRequest,
} from '@omne-harness/identity'
import type { SettingsFailure } from '@omne-harness/settings'
import { sourceRequestSchema } from './source-retention-schema.ts'
import { sourceCustodyReceiptSchema } from './source-custody-schema.ts'
import type { CheckpointRequest } from './checkpoint-schema.ts'
import type { SettingsAttemptBinding } from './attempt-binding.ts'
import type { SettingsPreparationOptions, PreparationPlan } from './preparation-types.ts'
import { PreparationSql } from './preparation-sql.ts'
import { equal } from './encoding.ts'
export const standingReadSchema = z.union([
  z.strictObject({ kind: z.literal('not_found') }),
  z.object({
    kind: z.enum(['planned', 'requested', 'held', 'settled']),
    request: z.object({
      binding: z.custom<StandingRequest['binding']>(isStandingBinding),
      required: z.array(z.custom<StandingRequest['required'][number]>(isQualification)),
    }),
  }),
])
const pageSchema = z.object({
  kind: z.literal('page'),
  items: z
    .array(
      z.object({
        state: z.enum(['planned', 'requested', 'held', 'settled']),
        request: sourceRequestSchema,
      }),
    )
    .max(64),
  after: z.string().nullable(),
})
function reserveFailure(
  kind: 'unavailable' | 'denied' | 'blocked' | 'operation-conflict',
): SettingsFailure {
  if (kind === 'unavailable') throw new Error('Standing reserve unavailable')
  const reasons = {
    denied: 'forbidden',
    blocked: 'basis_changed',
    'operation-conflict': 'operation_conflict',
  } as const
  return { kind: 'rejected', reason: reasons[kind] }
}
export class PreparationCustody<Context> {
  private readonly sql: PreparationSql
  private readonly obligations: Pick<SettingsPreparationOptions<Context>, 'standing' | 'sources'>
  constructor(
    sql: PreparationSql,
    obligations: Pick<SettingsPreparationOptions<Context>, 'standing' | 'sources'>,
  ) {
    this.sql = sql
    this.obligations = obligations
  }
  private checkpoint(binding: SettingsAttemptBinding, command: CheckpointRequest['command']) {
    return this.sql.write({ kind: 'checkpoint', binding, command })
  }
  private async reserveStanding(
    context: Context,
    binding: SettingsAttemptBinding,
    plan: PreparationPlan,
  ): Promise<SettingsFailure | undefined> {
    if (plan.standing.kind === 'maintenance') return undefined
    const ref = { identity: binding.identity, attemptId: binding.attemptId }
    const { kind: _, ...standing } = plan.standing
    await this.checkpoint(binding, { kind: 'standing-plan', input: { ...ref, ...standing } })
    const record = standingReadSchema.parse(await this.sql.read({ kind: 'standing', input: ref }))
    if (record.kind === 'not_found') throw new Error('Missing persisted Standing request')
    if (record.kind === 'held') return undefined
    if (record.kind === 'settled') return { kind: 'rejected', reason: 'basis_changed' }
    await this.checkpoint(binding, { kind: 'standing-request', input: ref })
    const result = await this.obligations.standing.reserve(context, record.request)
    if (result.kind !== 'held' && result.kind !== 'terminal') return reserveFailure(result.kind)
    this.matchStanding(record.request, result.reservation)
    const reservation = { ...result.reservation, required: [...result.reservation.required] }
    await this.checkpoint(
      binding,
      result.kind === 'held'
        ? { kind: 'standing-held', input: { ...ref, reservation } }
        : { kind: 'standing-settled', input: { ...ref, reservation, outcome: result.outcome } },
    )
    return result.kind === 'terminal' ? { kind: 'rejected', reason: 'basis_changed' } : undefined
  }

  private matchStanding(request: StandingRequest, reservation: unknown) {
    if (
      !isStandingReservation(reservation) ||
      !equal(request, { binding: reservation.binding, required: reservation.required })
    )
      throw new Error('Standing response does not match its original request')
  }
  private async *sources(binding: SettingsAttemptBinding) {
    let after: string | null = null
    for (let pageNumber = 0; pageNumber < 17; pageNumber++) {
      const page = pageSchema.parse(
        await this.sql.read({
          kind: 'sources',
          input: { identity: binding.identity, attemptId: binding.attemptId, after, limit: 64 },
        }),
      )
      yield* page.items
      if (page.after === null || page.items.length < 64) return
      if (page.after === after) throw new Error('Settings source cursor did not advance')
      after = page.after
    }
    throw new Error('Settings source manifest exceeded its bound')
  }
  async reserve(
    context: Context,
    binding: SettingsAttemptBinding,
    plan: PreparationPlan,
  ): Promise<SettingsFailure | undefined> {
    const ref = { identity: binding.identity, attemptId: binding.attemptId }
    const failed = await this.reserveStanding(context, binding, plan)
    if (failed) return failed
    await this.checkpoint(binding, { kind: 'sources-plan', input: { ...ref, ...plan.sources } })
    for await (const member of this.sources(binding)) {
      if (member.state === 'held') continue
      if (member.state === 'settled') return { kind: 'rejected', reason: 'basis_changed' }
      await this.checkpoint(binding, {
        kind: 'source-request',
        input: { ...ref, source: member.request.source },
      })
      const result = await this.obligations.sources.reserve(context, member.request)
      if (result.kind === 'rejected') return result
      const receipt = sourceCustodyReceiptSchema.parse(result)
      if (!equal(receipt.request, member.request))
        throw new Error('Settings source response binding mismatch')
      await this.checkpoint(binding, { kind: 'source-record', input: { ...ref, receipt } })
      if (receipt.kind === 'settled') return { kind: 'rejected', reason: 'basis_changed' }
    }
    return undefined
  }
  private async settleStanding(binding: SettingsAttemptBinding) {
    const ref = { identity: binding.identity, attemptId: binding.attemptId }
    const standing = standingReadSchema.parse(await this.sql.read({ kind: 'standing', input: ref }))
    if (standing.kind !== 'requested' && standing.kind !== 'held') return true
    const result = await this.obligations.standing.settle(standing.request)
    if (result.kind !== 'terminal') return false
    this.matchStanding(standing.request, result.reservation)
    await this.checkpoint(binding, {
      kind: 'standing-settled',
      input: {
        ...ref,
        reservation: { ...result.reservation, required: [...result.reservation.required] },
        outcome: result.outcome,
      },
    })
    return true
  }
  async settle(binding: SettingsAttemptBinding): Promise<boolean> {
    try {
      const ref = { identity: binding.identity, attemptId: binding.attemptId }
      let complete = await this.settleStanding(binding)
      const manifest = await this.sql.read({
        kind: 'sources',
        input: { ...ref, after: null, limit: 1 },
      })
      if (z.object({ kind: z.string() }).parse(manifest).kind === 'not_found') return complete
      for await (const member of this.sources(binding)) {
        if (member.state === 'planned' || member.state === 'settled') continue
        const result = await this.obligations.sources.settle(member.request)
        if (result.kind !== 'settled') {
          complete = false
          continue
        }
        const receipt = sourceCustodyReceiptSchema.parse(result)
        if (!equal(receipt.request, member.request))
          throw new Error('Settings settled source binding mismatch')
        await this.checkpoint(binding, { kind: 'source-record', input: { ...ref, receipt } })
      }
      return complete
    } catch {
      return false
    }
  }
}
