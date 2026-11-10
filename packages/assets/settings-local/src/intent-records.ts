import { z } from 'zod'
import { SettingsCurrentBasisSchema, SettingsIdSchema } from '@omne-harness/settings'
import type { SqlIdentity } from '@omne-harness/sql-contract'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, stateKey, withinBudget } from './encoding.ts'
import {
  attemptStatusSchema,
  intentAllocationSchema,
  intentCommandSchema,
  intentIdentitySchema,
  intentPurposeSchema,
  intentStatusSchema,
  type IntentAllocation,
  type IntentCommand,
  type IntentIdentity,
} from './intent-schema.ts'

const rootRowSchema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string().nullable(),
  z.string(),
  z.coerce.number().int().min(1).max(65),
  z.string().nullable(),
  z.string().nullable(),
])
const attemptRowSchema = z.tuple([
  z.coerce.number().int().min(1).max(64),
  SettingsIdSchema,
  z.string(),
  z.string().nullable(),
  z.string().nullable(),
  z.string(),
  z.string(),
])
function semanticCommand(intent: IntentCommand) {
  const { requestId: _requestId, ...command } = intent.command
  return { kind: intent.kind, command }
}
export function intentCommandDigest(intent: IntentCommand): string {
  return digest(semanticCommand(intent).command)
}
export function intentKey(identity: IntentIdentity): string {
  return digest([identity.domain, identity.principalRef, identity.operation])
}
export function intentAttemptIdentity(identity: IntentIdentity, attemptId: string): SqlIdentity {
  return {
    ...identity.domain,
    operation: 'settings.attempt.commit',
    protocolVersion: '2',
    operationKey: digest([intentKey(identity), attemptId]),
  }
}
function requireBinding(identity: IntentIdentity, intent: IntentCommand) {
  if (
    !equal(identity.operation, {
      target: intent.command.target,
      operationId: intent.command.operationId,
    })
  )
    throw new Error('Settings intent command binding mismatch')
}
function decodeIntentStatus(
  state: string,
  result: string | null,
  reason: string | null,
  operationId: string,
) {
  const status = intentStatusSchema.parse(
    state === 'committed'
      ? { state, result: JSON.parse(z.string().parse(result)) }
      : state === 'aborted'
        ? { state, reason }
        : { state },
  )
  if (status.state === 'committed' && status.result.operationId !== operationId)
    throw new Error('Invalid persisted Settings result identity')
  return status
}
function readRoot(port: ReadPort, identity: IntentIdentity) {
  const row = port.execute(
    `SELECT command_kind, command_json, command_digest, principal_ref, target_key, operation_id,
      intent_kind, source_key, state, next_attempt, result_json, abort_reason
      FROM st_governance_intent WHERE operation_key = ? LIMIT 1`,
    [intentKey(identity)],
  ).rows[0]
  if (!row) return null
  const [
    kind,
    commandJson,
    commandDigest,
    principal,
    target,
    operation,
    purposeKind,
    sourceKey,
    state,
    nextAttempt,
    result,
    reason,
  ] = rootRowSchema.parse(row)
  const intent = intentCommandSchema.parse({ kind, command: JSON.parse(commandJson) })
  requireBinding(identity, intent)
  if (
    principal !== identity.principalRef ||
    operation !== identity.operation.operationId ||
    target !== stateKey(identity.domain.scope, identity.operation.target) ||
    commandDigest !== intentCommandDigest(intent)
  )
    throw new Error('Invalid persisted Settings intent identity')
  const purpose = intentPurposeSchema.parse(
    purposeKind === 'source-update' ? { kind: purposeKind, sourceKey } : { kind: purposeKind },
  )
  if (purposeKind === 'target-change' && sourceKey !== null)
    throw new Error('Invalid persisted Settings intent purpose')
  const status = decodeIntentStatus(state, result, reason, operation)
  return { intent, purpose, status, nextAttempt }
}
function readAttempt(
  port: ReadPort,
  identity: IntentIdentity,
  nextAttempt: number,
  attemptId: string | null,
) {
  const condition =
    attemptId === null
      ? "AND state IN ('preparing', 'prepared', 'submitted')"
      : 'AND attempt_id = ?'
  const row = port.execute(
    `SELECT attempt, attempt_id, plan_json, basis_digest, basis_json, sql_identity_json, state
      FROM st_governance_attempt WHERE operation_key = ?
      ${condition} LIMIT 1`,
    attemptId === null ? [intentKey(identity)] : [intentKey(identity), attemptId],
  ).rows[0]
  if (!row) return null
  const decoded = decodeAttempt(row, identity)
  if (
    decoded.sequence >= nextAttempt ||
    (attemptId === null && decoded.sequence !== nextAttempt - 1)
  )
    throw new Error('Invalid persisted Settings attempt sequence')
  return decoded
}
function decodeAttempt(row: readonly unknown[], identity: IntentIdentity) {
  const [sequence, attemptId, planJson, basisDigest, basisJson, sqlIdentityJson, state] =
    attemptRowSchema.parse(row)
  const plan = SettingsCurrentBasisSchema.parse(JSON.parse(planJson))
  const basis = basisJson === null ? null : SettingsCurrentBasisSchema.parse(JSON.parse(basisJson))
  const status = attemptStatusSchema.parse({ state, basis })
  const sqlIdentity = intentAttemptIdentity(identity, attemptId)
  if (
    !equal(plan.target, identity.operation.target) ||
    !equal(JSON.parse(sqlIdentityJson), sqlIdentity) ||
    (basis !== null && !equal(basis.target, identity.operation.target)) ||
    basisDigest !== (basis === null ? null : digest(basis))
  )
    throw new Error('Invalid persisted Settings attempt binding')
  return { sequence, attemptId, plan, status, sqlIdentity }
}

export function readSettingsIntent(port: ReadPort, input: IntentIdentity) {
  const identity = intentIdentitySchema.parse(input)
  const root = readRoot(port, identity)
  if (!root) return { kind: 'not_found' as const }
  const attempt = readAttempt(port, identity, root.nextAttempt, null)
  if (root.status.state !== 'open' && attempt !== null)
    throw new Error('Terminal Settings intent retains a live attempt')
  return { kind: 'found' as const, identity, ...root, attempt }
}

export function readSettingsAttempt(port: ReadPort, input: IntentIdentity, id: string) {
  const identity = intentIdentitySchema.parse(input)
  const root = readRoot(port, identity)
  if (!root) return { kind: 'not_found' as const }
  const attempt = readAttempt(port, identity, root.nextAttempt, SettingsIdSchema.parse(id))
  return attempt
    ? { kind: 'found' as const, identity, ...root, attempt }
    : { kind: 'not_found' as const }
}

function insertRoot(port: ParticipantPort, input: IntentAllocation) {
  const { identity, intent, purpose } = input
  port.execute(
    `INSERT INTO st_governance_intent (operation_key, principal_ref, target_key, operation_id,
      command_digest, command_json, command_kind, intent_kind, source_key, state, next_attempt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1)`,
    [
      intentKey(identity),
      identity.principalRef,
      stateKey(identity.domain.scope, identity.operation.target),
      identity.operation.operationId,
      intentCommandDigest(intent),
      canonical(intent.command),
      intent.kind,
      purpose.kind,
      purpose.kind === 'source-update' ? purpose.sourceKey : null,
    ],
  )
}

/** Call only inside the Settings persistence participant's transaction, after trusted admission. */
export function allocateSettingsIntent(port: ParticipantPort, raw: IntentAllocation) {
  if (!withinBudget(raw)) return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
  const input = intentAllocationSchema.parse(raw)
  const { identity, intent, attemptId, plan } = input
  requireBinding(identity, intent)
  if (!equal(plan.target, identity.operation.target))
    throw new Error('Settings preparation plan target mismatch')
  const found = readSettingsIntent(port, identity)
  if (found.kind === 'found') {
    if (!equal(semanticCommand(found.intent), semanticCommand(intent)))
      return { kind: 'rejected' as const, reason: 'operation_conflict' as const }
    if (found.status.state !== 'open' || found.attempt !== null) return found
    if (found.nextAttempt > 64)
      return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
  } else insertRoot(port, input)
  const sequence = found.kind === 'found' ? found.nextAttempt : 1
  const key = intentKey(identity)
  port.execute(
    `INSERT INTO st_governance_attempt (operation_key, attempt, attempt_id, plan_json,
      basis_digest, basis_json, sql_identity_json, state)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, 'preparing')`,
    [
      key,
      sequence,
      attemptId,
      canonical(plan),
      canonical(intentAttemptIdentity(identity, attemptId)),
    ],
  )
  port.execute('UPDATE st_governance_intent SET next_attempt = ? WHERE operation_key = ?', [
    sequence + 1,
    key,
  ])
  return readSettingsIntent(port, identity)
}
