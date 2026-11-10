import { z } from 'zod'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { SettingsAbortedOperationSchema } from '@omne-harness/settings'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { intentIdentitySchema, type IntentStatus } from './intent-schema.ts'
import {
  intentKey,
  intentCommandDigest,
  readSettingsAttempt,
  readSettingsIntent,
} from './intent-records.ts'
import { operationSchema } from './schema.ts'
import { sourceUpdateSchema } from './source-retention-schema.ts'
import { sourceKey } from './source-retention-records.ts'
import { canonical, equal } from './encoding.ts'

const bound = z.strictObject({ binding: settingsAttemptBindingSchema })
const eventSchema = z.discriminatedUnion('kind', [
  bound.extend({ kind: z.literal('commit'), result: operationSchema }),
  bound.extend({
    kind: z.literal('abort'),
    reason: SettingsAbortedOperationSchema.shape.reason.exclude(['cancelled', 'sealed']),
  }),
  bound.extend({ kind: z.literal('seal') }),
  z.strictObject({ kind: z.literal('cancel'), identity: intentIdentitySchema }),
])
const sourceResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('finished'),
    update: sourceUpdateSchema,
    outcome: z.enum(['committed', 'aborted']),
  }),
])
export const intentSettlementSchema = z.strictObject({
  event: eventSchema,
  source: sourceResultSchema,
})
export type IntentSettlement = z.infer<typeof intentSettlementSchema>
type Found = Extract<ReturnType<typeof readSettingsIntent>, { kind: 'found' }>
const conflict = () => ({ kind: 'rejected' as const, reason: 'operation_conflict' as const })

function rootOutcome(event: IntentSettlement['event'], found: Found): IntentStatus {
  switch (event.kind) {
    case 'commit':
      return { state: 'committed', result: event.result }
    case 'abort':
      return { state: 'aborted', reason: event.reason }
    case 'cancel':
      return { state: 'aborted', reason: 'cancelled' }
    case 'seal':
      return found.purpose.kind === 'source-update'
        ? { state: 'aborted', reason: 'sealed' }
        : { state: 'open' }
  }
}
function sourceMatches(found: Found, status: IntentStatus, source: IntentSettlement['source']) {
  if (found.purpose.kind !== 'source-update' || status.state === 'open')
    return source.kind === 'none'
  const reference = { domain: found.identity.domain, target: found.identity.operation.target }
  return (
    source.kind === 'finished' &&
    source.outcome === status.state &&
    found.purpose.sourceKey === sourceKey(reference) &&
    equal(source.update, {
      source: reference,
      identity: found.identity,
      commandDigest: intentCommandDigest(found.intent),
    })
  )
}
function writeOutcome(port: ParticipantPort, found: Found, status: IntentStatus) {
  const key = intentKey(found.identity)
  if (found.attempt)
    port.execute(
      'UPDATE st_governance_attempt SET state = ? WHERE operation_key = ? AND attempt_id = ?',
      [status.state === 'committed' ? 'committed' : 'aborted', key, found.attempt.attemptId],
    )
  if (status.state !== 'open')
    port.execute(
      'UPDATE st_governance_intent SET state = ?, result_json = ?, abort_reason = ? WHERE operation_key = ?',
      [
        status.state,
        status.state === 'committed' ? canonical(status.result) : null,
        status.state === 'aborted' ? status.reason : null,
        key,
      ],
    )
  return readSettingsIntent(port, found.identity)
}
function boundAttempt(
  port: ParticipantPort,
  event: Exclude<IntentSettlement['event'], { kind: 'cancel' }>,
) {
  const { binding } = event
  const exact = readSettingsAttempt(port, binding.identity, binding.attemptId)
  if (exact.kind !== 'found') return exact
  if (
    exact.intent.kind !== binding.commandKind ||
    intentCommandDigest(exact.intent) !== binding.commandDigest
  )
    return conflict()
  return exact
}

function attemptDecision(
  port: ParticipantPort,
  event: Exclude<IntentSettlement['event'], { kind: 'cancel' }>,
  found: Found,
) {
  const exact = boundAttempt(port, event)
  if (exact.kind !== 'found') return exact
  if (found.status.state !== 'open') return found
  if (exact.attempt.status.state === 'aborted') return { kind: 'sealed' as const }
  if (found.attempt?.attemptId !== event.binding.attemptId) return conflict()
  if (
    event.kind === 'commit' &&
    (exact.attempt.status.state === 'preparing' ||
      event.result.operationId !== found.identity.operation.operationId)
  )
    return conflict()
  return { kind: 'eligible' as const }
}

/** Internal persistence step after the transaction planner, terminal and source writers succeed.
 * Source results must come from the participant fact, never from a client command. */
export function settleSettingsIntent(port: ParticipantPort, raw: IntentSettlement) {
  const { event, source } = intentSettlementSchema.parse(raw)
  const identity = event.kind === 'cancel' ? event.identity : event.binding.identity
  const found = readSettingsIntent(port, identity)
  if (found.kind !== 'found') return found
  if (event.kind !== 'cancel') {
    const decision = attemptDecision(port, event, found)
    if (decision.kind !== 'eligible') return decision
  }
  if (found.status.state !== 'open') return found
  const status = rootOutcome(event, found)
  if (!sourceMatches(found, status, source)) return conflict()
  return writeOutcome(port, found, status)
}
