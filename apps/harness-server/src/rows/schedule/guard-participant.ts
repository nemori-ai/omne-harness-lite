import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { createScheduleManagementIdentity } from '@omne-harness/schedule'
import {
  ScheduleManagementGuardRequirementSchema,
  scheduleManagementGuardRequirement,
  scheduleManagementGuardsFact,
  type ScheduleManagementGuardRequirement,
} from '@omne-harness/schedule-local'
import { canonicalDigest } from '@omne-harness/tool'
import { SCHEDULE_GUARD, SCHEDULE_QUOTA_TABLE } from './guard.ts'

const parameters = new URL(import.meta.url).searchParams
const capacity = Number(parameters.get('capacity') ?? '0')
const same = (left: unknown, right: unknown) => canonicalDigest(left) === canonicalDigest(right)

/** Frees the slot a schedule holds under the named reservation; false when it does not hold it. */
function freeSlot(port: Pick<ParticipantPort, 'execute'>, id: string, reservation: string) {
  const held = port.execute(
    `SELECT reservation, held FROM ${SCHEDULE_QUOTA_TABLE} WHERE schedule_id = ? LIMIT 1`,
    [id],
  ).rows[0]
  if (held?.[0] !== reservation || held[1] !== 1n) return false
  port.execute(`UPDATE ${SCHEDULE_QUOTA_TABLE} SET held = 0 WHERE schedule_id = ?`, [id])
  return true
}

/** Holds one quota slot per schedule that is not terminal, counted per owner and author. */
export function holdQuota(
  port: Pick<ParticipantPort, 'execute'>,
  requirement: Pick<ScheduleManagementGuardRequirement, 'quotaEffect' | 'resultingHolding'>,
  capacity: number,
) {
  const effect = requirement.quotaEffect
  const holding = requirement.resultingHolding
  if (effect.kind === 'none') return null
  if (effect.kind === 'release')
    return freeSlot(port, effect.scheduleId, effect.reservationRef) && holding?.kind === 'released'
      ? null
      : 'stale_basis'
  if (effect.kind === 'transfer' && !freeSlot(port, effect.predecessorId, effect.reservationRef))
    return 'stale_basis'
  const bucket = canonicalDigest([effect.owner, effect.author])
  const used = port.execute(
    `SELECT count(*) FROM ${SCHEDULE_QUOTA_TABLE} WHERE bucket = ? AND held = 1 LIMIT 1`,
    [bucket],
  ).rows[0]?.[0]
  if (typeof used !== 'bigint' || used >= BigInt(capacity)) return 'capacity_exceeded'
  if (holding?.kind !== 'held') return 'stale_basis'
  port.execute(
    `INSERT INTO ${SCHEDULE_QUOTA_TABLE} (schedule_id, bucket, reservation, held) VALUES (?, ?, ?, 1)`,
    [
      effect.kind === 'reserve' ? effect.scheduleId : effect.successorId,
      bucket,
      holding.reservationRef,
    ],
  )
  return null
}

/** The commit re-derives the requirement and keeps quota; consent was decided when the
 * authorizer read the settings, so the commit does not read them again. */
export default {
  ...SCHEDULE_GUARD,
  execute(facts, port) {
    const requirement = ScheduleManagementGuardRequirementSchema.parse(facts['requirement'])
    const { binding } = requirement
    const { command } = binding
    const fail = (code: 'forbidden' | 'stale_basis' | 'capacity_exceeded') => ({
      kind: 'conflict' as const,
      basis: {
        binding,
        error: {
          code,
          message: `schedule guard: ${code}`,
          retryable: code === 'stale_basis',
          requestId: command.input.requestId,
          details: {},
        },
      },
    })
    if (
      !same(requirement, scheduleManagementGuardRequirement(binding.scope, command)) ||
      !same(
        binding.operation,
        createScheduleManagementIdentity(binding.operation.scope, command.input.request),
      )
    )
      return fail('forbidden')
    const failure = holdQuota(port, requirement, capacity)
    if (failure !== null) return fail(failure)
    const fact = JSON.parse(JSON.stringify({ ...requirement, decisionAt: command.input.now }))
    port.provideFact(scheduleManagementGuardsFact, fact)
    return { kind: 'participated', response: fact }
  },
} satisfies ParticipantModule
