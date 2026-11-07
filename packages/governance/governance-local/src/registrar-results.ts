import { z } from 'zod'
import {
  GovernanceContributionRefSchema,
  GovernanceRevisionSchema,
  type GovernanceContributionOutcome,
  type GovernanceWithdrawalOutcome,
  type GovernanceFailure,
} from '@omne-harness/governance-contract'
import type { OperationBinding, OperationRecord } from './operation-schema.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import { digest, equal } from './encoding.ts'

const failureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('invalid-input'), field: z.string(), reason: z.string() }),
  z.strictObject({ kind: z.literal('limited'), resource: z.string() }),
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({ kind: z.literal('unavailable'), owner: z.string() }),
  z.strictObject({
    kind: z.literal('conflict'),
    reason: z.enum(['operation', 'definition', 'basis', 'selection']),
  }),
])
const registrationSchema = z.strictObject({
  kind: z.literal('registered'),
  contribution: GovernanceContributionRefSchema,
  declarationRevision: GovernanceRevisionSchema,
  state: z.enum(['active', 'closing', 'released']),
})
const releaseSchema = z.strictObject({
  kind: z.enum(['released', 'already-released']),
  contribution: GovernanceContributionRefSchema,
  adoptionRevision: GovernanceRevisionSchema,
})
export const unknownOperation = (binding: OperationBinding) => ({
  kind: 'unknown' as const,
  operation: binding.ref,
})
export const isTerminal = (record: OperationRecord) =>
  record.state === 'committed' || record.state === 'aborted'

function aborted(binding: OperationBinding, record: OperationRecord) {
  if (equal(record.result, { kind: 'sealed' }))
    return { kind: 'conflict' as const, reason: 'basis' as const }
  const failure = failureSchema.safeParse(record.result)
  return failure.success && equal(failure.data, record.result)
    ? failure.data
    : unknownOperation(binding)
}
export async function registrationResult(
  sql: SqlOperationCoordinator,
  binding: OperationBinding,
  record: OperationRecord,
): Promise<GovernanceContributionOutcome> {
  if (record.state === 'aborted') return aborted(binding, record)
  if (record.state !== 'committed' || record.request.owner !== 'contribute')
    return unknownOperation(binding)
  const parsed = registrationSchema.safeParse(record.result)
  if (!parsed.success || !equal(parsed.data, record.result)) return unknownOperation(binding)
  const command = record.request.command
  const expected = {
    scope: command.scope,
    contributorId: command.contributorId,
    generation: command.generation,
    registrationId: 'lease/' + digest(binding.ref),
  }
  if (!equal(parsed.data.contribution, expected)) return unknownOperation(binding)
  const current = await sql.contribution(expected, binding.ref.principalRef)
  return current.kind === 'found'
    ? { ...parsed.data, state: current.state }
    : unknownOperation(binding)
}
export function releaseResult(
  binding: OperationBinding,
  record: OperationRecord,
): GovernanceWithdrawalOutcome {
  if (record.state === 'aborted') return aborted(binding, record)
  if (record.state !== 'committed' || record.request.owner !== 'withdraw')
    return unknownOperation(binding)
  const parsed = releaseSchema.safeParse(record.result)
  return parsed.success &&
    equal(parsed.data, record.result) &&
    equal(parsed.data.contribution, record.request.command.contribution)
    ? parsed.data
    : unknownOperation(binding)
}
export type RegistrarFailure = GovernanceFailure | ReturnType<typeof unknownOperation>
