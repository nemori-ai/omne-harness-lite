import { z } from 'zod'
import {
  GovernanceContributionCommandSchema,
  GovernanceWithdrawalCommandSchema,
  GovernanceAdoptionCommandSchema,
  GovernanceOperationRefSchema,
  GovernanceIdSchema,
  GovernanceDigestSchema,
  GovernanceScopeSchema,
} from '@omne-harness/governance-contract'

export const requestSchema = z.discriminatedUnion('owner', [
  z.strictObject({ owner: z.literal('contribute'), command: GovernanceContributionCommandSchema }),
  z.strictObject({ owner: z.literal('withdraw'), command: GovernanceWithdrawalCommandSchema }),
  z.strictObject({ owner: z.literal('adopt'), command: GovernanceAdoptionCommandSchema }),
])
export type GovernanceRequest = z.infer<typeof requestSchema>
export const bindingSchema = z.strictObject({
  ref: GovernanceOperationRefSchema,
  requestDigest: GovernanceDigestSchema,
})
export type OperationBinding = z.infer<typeof bindingSchema>
export const acceptSchema = z.strictObject({
  principalRef: GovernanceIdSchema,
  epoch: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  request: requestSchema,
})
export type AcceptOperation = z.infer<typeof acceptSchema>
export const bootstrapSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  epoch: GovernanceIdSchema,
  previousEpoch: GovernanceIdSchema.nullable(),
})
export type Bootstrap = z.infer<typeof bootstrapSchema>
export const executionSchema = z.strictObject({
  combinationVersion: GovernanceIdSchema,
  manifestDigest: GovernanceDigestSchema,
  authority: z.json(),
})
export type Execution = z.infer<typeof executionSchema>
export const recordSchema = z.strictObject({
  request: requestSchema,
  requestDigest: GovernanceDigestSchema,
  epoch: GovernanceIdSchema,
  sqlIdentity: z.strictObject({
    scope: z.strictObject({ kind: z.literal('tenant'), tenant: z.string() }),
    transactionDomain: GovernanceIdSchema,
    operation: GovernanceIdSchema,
    protocolVersion: z.literal('2'),
    operationKey: GovernanceDigestSchema,
  }),
  state: z.enum(['accepted', 'submitted', 'committed', 'aborted']),
  execution: executionSchema.nullable(),
  result: z.json().nullable(),
})
export type OperationRecord = z.infer<typeof recordSchema>
export function requestRef(principalRef: string, request: GovernanceRequest) {
  return {
    scope:
      request.owner === 'withdraw' ? request.command.contribution.scope : request.command.scope,
    owner: request.owner,
    principalRef,
    operationId: request.command.operationId,
  }
}
