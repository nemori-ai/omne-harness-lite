import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { readySettingsIntentSchema, type ReadySettingsIntent } from './ready-schema.ts'
import type { z } from 'zod'
import { readStandingCustody } from './standing-custody.ts'
import { sourceCustodyReadiness } from './source-custody.ts'
import { readSettingsIntent, intentCommandDigest, intentKey } from './intent-records.ts'
import { canonical, digest, equal, withinBudget } from './encoding.ts'
export type { ReadySettingsIntent } from './ready-schema.ts'
const reject = (reason: 'operation_conflict' | 'basis_changed' | 'limit_exceeded') => ({
  kind: 'rejected' as const,
  reason,
})
function standingHeld(port: ReadPort, input: z.output<typeof readySettingsIntentSchema>) {
  const { binding, standing } = input
  if (standing.kind === 'maintenance') return binding.commandKind === 'rebase'
  const custody = readStandingCustody(port, binding.identity, binding.attemptId)
  if (custody.kind !== 'held') return false
  return equal(
    {
      destination: custody.request.binding.destination,
      scopeRef: custody.request.binding.scopeRef,
      required: custody.request.required,
    },
    { destination: standing.destination, scopeRef: standing.scopeRef, required: standing.required },
  )
}
function readyCandidate(port: ReadPort, input: z.output<typeof readySettingsIntentSchema>) {
  const { binding, basis } = input
  const found = readSettingsIntent(port, binding.identity)
  if (found.kind !== 'found') return found
  if (
    found.intent.kind !== binding.commandKind ||
    intentCommandDigest(found.intent) !== binding.commandDigest ||
    !equal(input.terminal.binding, binding)
  )
    return reject('operation_conflict')
  if (found.status.state !== 'open' || found.attempt?.attemptId !== binding.attemptId)
    return reject('basis_changed')
  if (!equal(found.attempt.plan, basis)) return reject('basis_changed')
  return { kind: 'candidate' as const, found, attempt: found.attempt }
}
export function settingsIntentReadiness(port: ReadPort, raw: ReadySettingsIntent) {
  if (!withinBudget(raw)) return reject('limit_exceeded')
  const input = readySettingsIntentSchema.parse(raw)
  const { binding } = input
  const candidate = readyCandidate(port, input)
  if (candidate.kind !== 'candidate') return candidate
  if (
    candidate.attempt.status.state !== 'preparing' &&
    !equal(candidate.attempt.status.basis, input.basis)
  )
    return reject('basis_changed')
  if (!standingHeld(port, input))
    return { kind: 'pending' as const, dependency: 'identity' as const }
  const sources = sourceCustodyReadiness(port, {
    ...input.sources,
    identity: binding.identity,
    attemptId: binding.attemptId,
  })
  if (sources.kind === 'rejected') return sources
  if (sources.kind !== 'held') return { kind: 'pending' as const, dependency: 'sources' as const }
  return { ...candidate, input }
}
/** Internal writer. Current basis, requirements and the open-terminal observation must be trusted transaction facts. */
export function readySettingsIntent(port: ParticipantPort, raw: ReadySettingsIntent) {
  const candidate = settingsIntentReadiness(port, raw)
  if (candidate.kind !== 'candidate') return candidate
  const { binding, basis } = candidate.input
  const { found, attempt } = candidate
  if (attempt.status.state !== 'preparing') return found
  port.execute(
    "UPDATE st_governance_attempt SET state = 'prepared', basis_json = ?, basis_digest = ? WHERE operation_key = ? AND attempt_id = ? AND state = 'preparing'",
    [canonical(basis), digest(basis), intentKey(binding.identity), binding.attemptId],
  )
  return readSettingsIntent(port, binding.identity)
}
