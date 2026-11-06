import { z } from 'zod'
import { isQualification, type Qualification } from '@omne-harness/identity'
import {
  SettingsCurrentBasisSchema,
  SettingsReferenceSchema,
  SettingsVersionWitnessSchema,
} from '@omne-harness/settings'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { sourceCustodyPlanSchema } from './source-custody-schema.ts'
import { readStandingCustody } from './standing-custody.ts'
import { sourceCustodyReadiness } from './source-custody.ts'
import { readSettingsIntent, intentCommandDigest, intentKey } from './intent-records.ts'
import { canonical, digest, equal, withinBudget } from './encoding.ts'
const standingSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('identity'),
    destination: SettingsReferenceSchema,
    scopeRef: SettingsReferenceSchema,
    required: z
      .array(z.custom<Qualification>(isQualification))
      .max(16)
      .transform(q => [...new Set(q)].sort()),
  }),
  z.strictObject({ kind: z.literal('maintenance'), authority: SettingsVersionWitnessSchema }),
])
export const readySettingsIntentSchema = z.strictObject({
  binding: settingsAttemptBindingSchema,
  basis: SettingsCurrentBasisSchema,
  terminal: z.strictObject({ kind: z.literal('open'), binding: settingsAttemptBindingSchema }),
  standing: standingSchema,
  sources: sourceCustodyPlanSchema.omit({ identity: true, attemptId: true }),
})
export type ReadySettingsIntent = z.input<typeof readySettingsIntentSchema>
const reject = (reason: 'operation_conflict' | 'basis_changed' | 'limit_exceeded') => ({
  kind: 'rejected' as const,
  reason,
})
function standingHeld(port: ParticipantPort, input: z.output<typeof readySettingsIntentSchema>) {
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
function readyCandidate(port: ParticipantPort, input: z.output<typeof readySettingsIntentSchema>) {
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
/** Internal writer. Current basis, requirements and the open-terminal observation must be trusted transaction facts. */
export function readySettingsIntent(port: ParticipantPort, raw: ReadySettingsIntent) {
  if (!withinBudget(raw)) return reject('limit_exceeded')
  const input = readySettingsIntentSchema.parse(raw)
  const { binding, basis } = input
  const candidate = readyCandidate(port, input)
  if (candidate.kind !== 'candidate') return candidate
  if (!standingHeld(port, input))
    return { kind: 'pending' as const, dependency: 'identity' as const }
  const sources = sourceCustodyReadiness(port, {
    ...input.sources,
    identity: binding.identity,
    attemptId: binding.attemptId,
  })
  if (sources.kind === 'rejected') return sources
  if (sources.kind !== 'held') return { kind: 'pending' as const, dependency: 'sources' as const }
  const { found, attempt } = candidate
  if (attempt.status.state !== 'preparing')
    return equal(attempt.status.basis, basis) ? found : reject('basis_changed')
  port.execute(
    "UPDATE st_governance_attempt SET state = 'prepared', basis_json = ?, basis_digest = ? WHERE operation_key = ? AND attempt_id = ? AND state = 'preparing'",
    [canonical(basis), digest(basis), intentKey(binding.identity), binding.attemptId],
  )
  return readSettingsIntent(port, binding.identity)
}
