import canonicalize from 'canonicalize'
import {
  scheduleManagementGuardRequirement,
  ScheduleManagementGuardRequirementSchema,
  scheduleManagementGuardsFact,
} from '@omne-harness/schedule-local'
import { createScheduleManagementIdentity } from '@omne-harness/schedule'
const same = (a, b) => canonicalize(a) === canonicalize(b)
function quota(port, requirement, capacity) {
  const effect = requirement.quotaEffect
  const holding = requirement.resultingHolding
  if (effect.kind === 'none') return null
  if (effect.kind === 'release' || effect.kind === 'transfer') {
    const id = effect.kind === 'release' ? effect.scheduleId : effect.predecessorId
    const old = port.execute(
      'SELECT reservation, held FROM fixture_schedule_quota WHERE schedule_id = ? LIMIT 1',
      [id],
    ).rows[0]
    if (old?.[0] !== effect.reservationRef || old[1] !== 1n) return 'stale_basis'
    port.execute('UPDATE fixture_schedule_quota SET held=0 WHERE schedule_id = ?', [id])
  }
  if (effect.kind === 'release') return holding?.kind === 'released' ? null : 'stale_basis'
  const bucket = canonicalize([effect.owner, effect.author])
  const used = port.execute(
    'SELECT count(*) FROM fixture_schedule_quota WHERE bucket = ? AND held = 1 LIMIT 1',
    [bucket],
  ).rows[0]?.[0]
  if (typeof used !== 'bigint' || used >= capacity) return 'capacity_exceeded'
  if (holding?.kind !== 'held') return 'stale_basis'
  port.execute(
    'INSERT INTO fixture_schedule_quota (schedule_id, bucket, reservation, held) VALUES (?, ?, ?, 1)',
    [
      effect.kind === 'reserve' ? effect.scheduleId : effect.successorId,
      bucket,
      holding.reservationRef,
    ],
  )
  return null
}
export default {
  participant: 'fixture.schedule.guards',
  protocol: 'schedule-management-guards/1',
  execute(facts, port) {
    if (facts.action === 'configure') {
      port.execute(
        'INSERT INTO fixture_schedule_authority (scope, access, basis_guard, quota_guard, mode, decision_at, capacity, actions, purposes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope) DO UPDATE SET access=excluded.access, basis_guard=excluded.basis_guard, quota_guard=excluded.quota_guard, mode=excluded.mode, decision_at=excluded.decision_at, capacity=excluded.capacity, actions=excluded.actions, purposes=excluded.purposes',
        [
          canonicalize(facts.access.authority.scope),
          canonicalize(facts.access),
          facts.basisGuard,
          facts.quotaGuard,
          facts.mode,
          facts.decisionAt,
          facts.capacity,
          canonicalize(facts.actions),
          canonicalize(facts.purposes),
        ],
      )
      port.provideFact(scheduleManagementGuardsFact, null)
      return { kind: 'participated', response: null }
    }
    const requirement = ScheduleManagementGuardRequirementSchema.parse(facts.requirement)
    const { binding } = requirement
    const command = binding.command
    const fail = code => ({
      kind: 'conflict',
      basis: {
        binding,
        error: {
          code,
          message: 'Fixture authority or quota rejected',
          retryable: false,
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
    const authority = port.execute(
      'SELECT access, basis_guard, quota_guard, mode, decision_at, capacity, actions, purposes FROM fixture_schedule_authority WHERE scope = ? LIMIT 1',
      [canonicalize(binding.operation.scope)],
    ).rows[0]
    if (authority === undefined || !same(JSON.parse(authority[0]), command.input.access))
      return fail('forbidden')
    if (
      command.input.definition.kind === 'resolved' &&
      authority[1] !== command.input.definition.basisGuardRef
    )
      return fail('stale_basis')
    if (authority[2] !== command.input.quotaObservation.guardRef) return fail('capacity_exceeded')
    const action =
      command.input.request.kind === 'create' ? 'create' : command.input.request.input.action
    const purpose =
      command.input.definition.kind === 'resolved'
        ? command.input.definition.definition.purpose.kind
        : command.input.current?.view.definition.purpose.kind
    if (!JSON.parse(authority[6]).includes(action) || !JSON.parse(authority[7]).includes(purpose))
      return fail('forbidden')
    const mode = authority[3]
    if (mode === 'deny') return fail('forbidden')
    if (mode === 'consent') return fail('consent_required')
    const failure = quota(port, requirement, authority[5])
    if (failure !== null) return fail(failure)
    if (mode === 'sql') {
      port.execute(
        'INSERT INTO fixture_schedule_quota (schedule_id, bucket, reservation, held) SELECT schedule_id, bucket, reservation, held FROM fixture_schedule_quota LIMIT 1',
        [],
      )
    }
    if (mode === 'missing') return { kind: 'participated', response: null }
    if (mode === 'boolean') {
      port.provideFact(scheduleManagementGuardsFact, { allowed: true })
      return { kind: 'participated', response: { allowed: true } }
    }
    const fact = { ...requirement, decisionAt: authority[4] }
    if (mode === 'misbound') fact.binding = { ...binding, commandDigest: '0'.repeat(64) }
    port.provideFact(scheduleManagementGuardsFact, fact)
    return { kind: 'participated', response: fact }
  },
}
