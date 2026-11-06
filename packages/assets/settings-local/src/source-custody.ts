import { z } from 'zod'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, withinBudget } from './encoding.ts'
import { readSettingsAttempt } from './intent-records.ts'
import { sourceKey, sourceReservationKey } from './source-retention-records.ts'
import {
  sourceRequestSchema,
  type SourceReference,
  type SourceRequest,
} from './source-retention-schema.ts'
import {
  sourceCustodyMemberSchema,
  sourceCustodyPageSchema,
  sourceCustodyPlanSchema,
  sourceCustodyReceiptSchema,
  sourceCustodyRecordSchema,
  type SourceCustodyMember,
  type SourceCustodyPage,
  type SourceCustodyPlan,
  type SourceCustodyRecord,
} from './source-custody-schema.ts'

type Attempt = Extract<ReturnType<typeof readSettingsAttempt>, { kind: 'found' }>
const conflict = () => ({ kind: 'rejected' as const, reason: 'operation_conflict' as const })
const stateSchema = z.enum(['planned', 'requested', 'held', 'settled'])
const planRowSchema = z.tuple([
  z.coerce.number().int().min(0).max(1024),
  z.string().regex(/^[a-f0-9]{64}$/),
])
function destination(attempt: Attempt, route: string) {
  const { requestId: _requestId, ...command } = attempt.intent.command
  return {
    ownerRef: 'settings',
    identity: attempt.identity,
    attemptId: attempt.attempt.attemptId,
    commandDigest: digest(command),
    route,
  }
}
function decodeRequest(raw: unknown, key: unknown, reservationId: unknown, attempt: Attempt) {
  const request = sourceRequestSchema.parse(JSON.parse(z.string().parse(raw)))
  if (
    sourceKey(request.source) !== key ||
    sourceReservationKey(request) !== reservationId ||
    !equal(request.destination, destination(attempt, request.destination.route))
  )
    throw new Error('Invalid persisted source request binding')
  return request
}
function readPlan(port: ReadPort, attemptId: string) {
  const row = port.execute(
    'SELECT request_count, request_digest FROM st_intent_source_plan WHERE attempt_id = ? LIMIT 1',
    [attemptId],
  ).rows[0]
  if (!row) return { kind: 'not_found' as const }
  const [count, requestDigest] = planRowSchema.parse(row)
  return { kind: 'planned' as const, count, requestDigest }
}
function decodeSourceReceipt(
  raw: unknown,
  expected: {
    request: SourceRequest
    reservationId: string
    kind: 'held' | 'settled'
    outcome: 'committed' | 'aborted' | null
  },
) {
  const receipt = sourceCustodyReceiptSchema.parse(JSON.parse(z.string().parse(raw)))
  const actual = {
    request: receipt.request,
    reservationId: receipt.reservationId,
    kind: receipt.kind,
    outcome: receipt.kind === 'settled' ? receipt.outcome : null,
  }
  if (!equal(actual, expected)) throw new Error('Invalid persisted source receipt')
  return receipt
}
function decodeMember(row: readonly unknown[], attempt: Attempt, source: SourceReference) {
  const [requestJson, id, state, receiptJson, outcome] = z
    .tuple([
      z.string(),
      z.string(),
      stateSchema,
      z.string().nullable(),
      z.enum(['committed', 'aborted']).nullable(),
    ])
    .parse(row)
  const request = decodeRequest(requestJson, sourceKey(source), id, attempt)
  if (!equal(request.source, source)) throw new Error('Invalid persisted source identity')
  if (state === 'planned' || state === 'requested') {
    if (receiptJson !== null || outcome !== null) throw new Error('Unexpected source receipt')
    return { kind: state, request, reservationId: id }
  }
  return decodeSourceReceipt(receiptJson, { request, reservationId: id, kind: state, outcome })
}
function readMember(port: ReadPort, attempt: Attempt, source: SourceReference) {
  const row = port.execute(
    `SELECT request_json, reservation_id, state, receipt_json, outcome
    FROM st_intent_source WHERE attempt_id = ? AND source_key = ? LIMIT 1`,
    [attempt.attempt.attemptId, sourceKey(source)],
  ).rows[0]
  return row ? decodeMember(row, attempt, source) : { kind: 'not_found' as const }
}
export function readSourceCustody(port: ReadPort, raw: SourceCustodyMember) {
  const input = sourceCustodyMemberSchema.parse(raw)
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  return attempt.kind === 'found' ? readMember(port, attempt, input.source) : attempt
}
function sourceRequests(attempt: Attempt, route: string, sources: SourceReference[]) {
  const bound = destination(attempt, route)
  const ordered = sources
    .map(source => ({ key: sourceKey(source), request: { source, destination: bound } }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
  const requests: SourceRequest[] = ordered.map(entry => entry.request)
  return requests
}
export function planSourceCustody(port: ParticipantPort, raw: SourceCustodyPlan) {
  if (!withinBudget(raw)) return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
  const input = sourceCustodyPlanSchema.safeParse(raw)
  if (!input.success) return { kind: 'rejected' as const, reason: 'invalid_input' as const }
  const { identity, attemptId, route, sources } = input.data
  const attempt = readSettingsAttempt(port, identity, attemptId)
  if (attempt.kind !== 'found') return attempt
  const requests = sourceRequests(attempt, route, sources)
  const requestDigest = digest(requests)
  const previous = readPlan(port, attemptId)
  if (previous.kind !== 'not_found')
    return previous.requestDigest === requestDigest && previous.count === requests.length
      ? previous
      : conflict()
  if (attempt.status.state !== 'open' || attempt.attempt.status.state !== 'preparing')
    return conflict()
  port.execute(
    'INSERT INTO st_intent_source_plan (attempt_id, request_count, request_digest) VALUES (?, ?, ?)',
    [attemptId, requests.length, requestDigest],
  )
  for (const request of requests)
    port.execute(
      `INSERT INTO st_intent_source (attempt_id, source_key, request_json, reservation_id, state, receipt_json, outcome)
    VALUES (?, ?, ?, ?, 'planned', NULL, NULL)`,
      [attemptId, sourceKey(request.source), canonical(request), sourceReservationKey(request)],
    )
  return readPlan(port, attemptId)
}
export function requestSourceCustody(port: ParticipantPort, raw: SourceCustodyMember) {
  const input = sourceCustodyMemberSchema.parse(raw)
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  if (attempt.kind !== 'found') return attempt
  if (attempt.status.state !== 'open' || attempt.attempt.status.state !== 'preparing')
    return conflict()
  const previous = readMember(port, attempt, input.source)
  if (previous.kind !== 'planned') return previous
  port.execute(
    "UPDATE st_intent_source SET state = 'requested' WHERE attempt_id = ? AND source_key = ? AND state = 'planned'",
    [input.attemptId, sourceKey(input.source)],
  )
  return readMember(port, attempt, input.source)
}
function acceptReceipt(
  previous: Exclude<ReturnType<typeof readMember>, { kind: 'not_found' }>,
  receipt: SourceCustodyRecord['receipt'],
) {
  if (
    previous.kind === 'planned' ||
    !equal(previous.request, receipt.request) ||
    previous.reservationId !== receipt.reservationId
  )
    return conflict()
  if (previous.kind === 'settled')
    return receipt.kind === 'settled' && receipt.outcome !== previous.outcome
      ? conflict()
      : previous
  if (previous.kind === 'held' && receipt.kind === 'held')
    return equal(previous, receipt) ? previous : conflict()
  return { kind: 'record' as const }
}
/** Receipt authenticity belongs to the coordinator calling the actual source service. */
export function recordSourceCustody(port: ParticipantPort, raw: SourceCustodyRecord) {
  if (!withinBudget(raw)) return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
  const input = sourceCustodyRecordSchema.parse(raw)
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  if (attempt.kind !== 'found') return attempt
  const previous = readMember(port, attempt, input.receipt.request.source)
  if (previous.kind === 'not_found') return previous
  const decision = acceptReceipt(previous, input.receipt)
  if (decision.kind !== 'record') return decision
  const receipt = input.receipt
  port.execute(
    'UPDATE st_intent_source SET state = ?, receipt_json = ?, outcome = ? WHERE attempt_id = ? AND source_key = ?',
    [
      receipt.kind,
      canonical(receipt),
      receipt.kind === 'settled' ? receipt.outcome : null,
      input.attemptId,
      sourceKey(receipt.request.source),
    ],
  )
  return readMember(port, attempt, receipt.request.source)
}
export function listSourceCustody(port: ReadPort, raw: SourceCustodyPage) {
  const input = sourceCustodyPageSchema.parse(raw)
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  if (attempt.kind !== 'found') return attempt
  const plan = readPlan(port, input.attemptId)
  if (plan.kind === 'not_found') return plan
  const rows = port.execute(
    `SELECT source_key, request_json, reservation_id, state FROM st_intent_source
    WHERE attempt_id = ? AND source_key > ? ORDER BY source_key LIMIT ?`,
    [input.attemptId, input.after ?? '', input.limit],
  ).rows
  const items = rows.map(row => ({
    sourceKey: z.string().parse(row[0]),
    request: decodeRequest(row[1], row[0], row[2], attempt),
    reservationId: z.string().parse(row[2]),
    state: stateSchema.parse(row[3]),
  }))
  return { kind: 'page' as const, plan, items, after: items.at(-1)?.sourceKey ?? null }
}
