import { z } from 'zod'
import {
  GovernanceContributionRefSchema,
  GovernanceRevisionSchema,
  GovernanceBasisSchema,
  type GovernanceAdoptionOutcome,
  type GovernanceOperationOutcome,
  type GovernanceContributionOutcome,
  type GovernanceWithdrawalOutcome,
  type GovernanceFailure,
} from '@omne-harness/governance-contract'
import type {
  PublicOperationBinding as OperationBinding,
  OperationRecord,
} from './operation-schema.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import { digest, equal } from './encoding.ts'

export const governanceFailureSchema = z.discriminatedUnion('kind', [
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
  const failure = governanceFailureSchema.safeParse(record.result)
  return failure.success && equal(failure.data, record.result)
    ? failure.data
    : unknownOperation(binding)
}
function originalRegistration(
  binding: OperationBinding,
  record: OperationRecord,
): GovernanceContributionOutcome {
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
  return equal(parsed.data.contribution, expected) ? parsed.data : unknownOperation(binding)
}
export async function registrationResult(
  sql: SqlOperationCoordinator,
  binding: OperationBinding,
  record: OperationRecord,
): Promise<GovernanceContributionOutcome> {
  const original = originalRegistration(binding, record)
  if (original.kind !== 'registered') return original
  const current = await sql.contribution(original.contribution, binding.ref.principalRef)
  return current.kind === 'found'
    ? { ...original, state: current.state }
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

export function adoptionResult(
  binding: OperationBinding,
  record: OperationRecord,
): GovernanceAdoptionOutcome {
  if (record.state === 'aborted') return aborted(binding, record)
  if (record.state !== 'committed' || record.request.owner !== 'adopt')
    return unknownOperation(binding)
  const parsed = z
    .strictObject({ kind: z.literal('adopted'), basis: GovernanceBasisSchema })
    .safeParse(record.result)
  return parsed.success &&
    equal(parsed.data, record.result) &&
    equal(parsed.data.basis.scope, binding.ref.scope) &&
    parsed.data.basis.epoch === record.epoch
    ? parsed.data
    : unknownOperation(binding)
}

export function originalOperation(
  binding: OperationBinding,
  record: OperationRecord,
): GovernanceOperationOutcome {
  if (record.state === 'accepted' || record.state === 'submitted')
    return { kind: 'pending', operation: binding.ref }
  if (record.state === 'aborted')
    return {
      kind: 'not-committed',
      operation: binding.ref,
      sealRef: 'governance-seal/' + digest({ binding, result: record.result }),
    }
  return committedOperation(binding, record)
}
function committedOperation(
  binding: OperationBinding,
  record: OperationRecord,
): GovernanceOperationOutcome {
  switch (record.request.owner) {
    case 'internal.external-write':
    case 'internal.capture':
      return unknownOperation(binding)
    case 'contribute': {
      const result = originalRegistration(binding, record)
      return result.kind === 'registered'
        ? { kind: 'committed', original: { owner: 'contribute', result } }
        : unknownOperation(binding)
    }
    case 'withdraw': {
      const result = releaseResult(binding, record)
      return result.kind === 'released' || result.kind === 'already-released'
        ? { kind: 'committed', original: { owner: 'withdraw', result } }
        : unknownOperation(binding)
    }
    case 'adopt': {
      const result = adoptionResult(binding, record)
      return result.kind === 'adopted'
        ? { kind: 'committed', original: { owner: 'adopt', result } }
        : unknownOperation(binding)
    }
  }
}
