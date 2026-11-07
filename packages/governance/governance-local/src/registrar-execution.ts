import type { CommitRequestV2 } from '@omne-harness/sql-contract'
import type { GovernanceDefinitionSource } from '@omne-harness/governance-contract'
import { MUTATION_PLANNER, METADATA_PLANNER, controlRequestSchema } from './activation-schema.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import type { GovernanceAdmission } from './admission.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import { resolveDefinition } from './definition-source.ts'
import { canonical, digest, equal, json, operationIdentity } from './encoding.ts'
import {
  requestSchema,
  executionSchema,
  type GovernanceRequest,
  type Execution,
  type OperationRecord,
  type OperationBinding,
} from './operation-schema.ts'
import { qualificationsSchema } from './standing-schema.ts'

export type MutationRequest = Extract<GovernanceRequest, { owner: 'contribute' | 'withdraw' }>
export type Admitted = Extract<
  Awaited<ReturnType<GovernanceAdmission['check']>>,
  { kind: 'admitted' }
>
export type MutationCombination = Omit<Execution, 'authority'>
export const mutationCombinationSchema = executionSchema.omit({ authority: true })

export function captureMutation(input: MutationRequest) {
  try {
    if (Buffer.byteLength(canonical(input)) > 1024 * 1024)
      return { kind: 'limited' as const, resource: 'command-bytes' }
    const parsed = requestSchema.safeParse(input)
    if (parsed.success && parsed.data.owner !== 'adopt' && equal(input, parsed.data))
      return { kind: 'captured' as const, request: parsed.data }
  } catch {
    // Invalid local values do not enter persistence or identity checks.
  }
  return { kind: 'invalid-input' as const, field: 'command', reason: 'shape' }
}
function authority(request: MutationRequest, admitted: Admitted) {
  return {
    protocol: 'governance-admission/1',
    principalRef: admitted.principalRef,
    scope: admitted.request.scope,
    required: qualificationsSchema.parse(admitted.required),
    declaration: request.owner === 'contribute' ? request.command.declaration.reference : null,
    declarationDigest: request.owner === 'contribute' ? digest(request.command.declaration) : null,
  }
}
async function savedExecution(
  sql: SqlOperationCoordinator,
  binding: OperationBinding,
  record: OperationRecord | null,
) {
  if (record === null) return { kind: 'unprepared' as const }
  if (record.execution !== null) return { kind: 'prepared' as const, execution: record.execution }
  const saved = await sql.readStage(binding, 'submit')
  if (saved.kind === 'unplanned') return { kind: 'unprepared' as const }
  if (saved.kind !== 'stored') return { kind: 'unavailable' as const, owner: 'sql-coordination' }
  const raw = saved.envelope.commands.find(command => command.participant === METADATA_PLANNER)
    ?.facts.request
  const parsed = controlRequestSchema.safeParse(raw)
  if (!parsed.success || parsed.data.kind !== 'submit' || !equal(parsed.data.binding, binding))
    return { kind: 'unavailable' as const, owner: 'sql-coordination' }
  return { kind: 'prepared' as const, execution: parsed.data.execution }
}
export async function registrarExecution(
  sql: SqlOperationCoordinator,
  binding: OperationBinding,
  record: OperationRecord | null,
  request: MutationRequest,
  admitted: Admitted,
  source: GovernanceDefinitionSource,
  combination: MutationCombination,
) {
  const expected = authority(request, admitted)
  const saved = await savedExecution(sql, binding, record)
  if (saved.kind === 'unavailable') return saved
  if (saved.kind === 'prepared')
    return equal(saved.execution.authority, expected)
      ? saved
      : { kind: 'conflict' as const, reason: 'basis' as const }
  if (request.owner === 'contribute') {
    const definition = await resolveDefinition(source, request.command.declaration)
    if (definition.kind !== 'verified') return definition
  }
  return { kind: 'prepared' as const, execution: { ...combination, authority: expected } }
}
export async function reconcileExecution(
  sql: SqlOperationCoordinator,
  binding: OperationBinding,
  record: OperationRecord,
  candidate: Execution,
) {
  const saved = await savedExecution(sql, binding, record)
  if (saved.kind === 'unprepared') return { kind: 'prepared' as const, execution: candidate }
  if (saved.kind === 'unavailable') return saved
  return equal(saved.execution.authority, candidate.authority)
    ? saved
    : { kind: 'conflict' as const, reason: 'basis' as const }
}
export function mutationEnvelope(
  transactionDomain: string,
  binding: OperationBinding,
  execution: Execution,
): CommitRequestV2 {
  const request = { binding, execution }
  return {
    identity: operationIdentity(transactionDomain, binding.ref),
    combinationVersion: execution.combinationVersion,
    manifestDigest: execution.manifestDigest,
    commands: [
      { participant: MUTATION_PLANNER, facts: { request: json(request) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
    ],
  }
}
