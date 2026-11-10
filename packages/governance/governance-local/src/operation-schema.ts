import { externalWriteRequestSchema } from './external-write-schema.ts'
import { permissionQualificationSchema } from './permission-qualification.ts'
import { z } from 'zod'
import { PermissionBasisRequestSchema } from '@omne-harness/permissions'
import { SettingsTargetSchema } from '@omne-harness/settings'
import { SettingsSourceReferenceSchema } from '@omne-harness/settings-local/preparation'
import {
  GovernanceContributionCommandSchema,
  GovernanceWithdrawalCommandSchema,
  GovernanceAdoptionCommandSchema,
  GovernanceOperationRefSchema,
  GovernanceIdSchema,
  GovernanceDigestSchema,
  GovernanceScopeSchema,
  GovernanceCatalogRequestSchema,
} from '@omne-harness/governance-contract'

export const requestSchema = z.discriminatedUnion('owner', [
  z.strictObject({ owner: z.literal('contribute'), command: GovernanceContributionCommandSchema }),
  z.strictObject({ owner: z.literal('withdraw'), command: GovernanceWithdrawalCommandSchema }),
  z.strictObject({ owner: z.literal('adopt'), command: GovernanceAdoptionCommandSchema }),
])
export type GovernanceRequest = z.infer<typeof requestSchema>
const catalogCaptureCommandSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  operationId: GovernanceIdSchema,
  request: GovernanceCatalogRequestSchema,
})
export const permissionCaptureCommandSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  operationId: GovernanceIdSchema,
  permission: PermissionBasisRequestSchema,
  qualification: permissionQualificationSchema,
  target: SettingsTargetSchema,
  source: SettingsSourceReferenceSchema.nullable(),
  sourceRoute: GovernanceIdSchema,
})
export const captureRequestSchema = z.strictObject({
  owner: z.literal('internal.capture'),
  command: z.union([catalogCaptureCommandSchema, permissionCaptureCommandSchema]),
})
export const durableRequestSchema = z.discriminatedUnion('owner', [
  ...requestSchema.options,
  captureRequestSchema,
  externalWriteRequestSchema,
])
export type DurableRequest = z.infer<typeof durableRequestSchema>
export function isCatalogCapture(
  request: DurableRequest,
): request is { owner: 'internal.capture'; command: z.infer<typeof catalogCaptureCommandSchema> } {
  return request.owner === 'internal.capture' && 'request' in request.command
}
export function operationSourcePlan(request: DurableRequest) {
  if (
    request.owner !== 'internal.external-write' &&
    !(request.owner === 'internal.capture' && 'permission' in request.command)
  )
    return null
  if (!('source' in request.command)) return null
  const { source, sourceRoute } = request.command
  return source === null ? null : { source, route: sourceRoute }
}
export const operationRefSchema = GovernanceOperationRefSchema.extend({
  owner: z.enum(['contribute', 'withdraw', 'adopt', 'internal.capture', 'internal.external-write']),
})
export type OperationRef = z.infer<typeof operationRefSchema>
export const publicBindingSchema = z.strictObject({
  ref: GovernanceOperationRefSchema,
  requestDigest: GovernanceDigestSchema,
})
export type PublicOperationBinding = z.infer<typeof publicBindingSchema>
export const bindingSchema = z.strictObject({
  ref: operationRefSchema,
  requestDigest: GovernanceDigestSchema,
})
export type OperationBinding = z.infer<typeof bindingSchema>
export const acceptSchema = z.strictObject({
  principalRef: GovernanceIdSchema,
  epoch: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  request: durableRequestSchema,
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
export const businessRequestSchema = z.strictObject({
  binding: bindingSchema,
  execution: executionSchema,
})
export type BusinessRequest = z.infer<typeof businessRequestSchema>
export const recordSchema = z.strictObject({
  request: durableRequestSchema,
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
export const acceptanceReceiptSchema = z.strictObject({
  kind: z.literal('acceptance'),
  input: acceptSchema,
  outcome: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('found'), record: recordSchema }),
    z.strictObject({ kind: z.literal('conflict'), reason: z.enum(['operation', 'basis']) }),
    z.strictObject({ kind: z.literal('limited'), resource: z.string() }),
  ]),
})
export type OperationRecord = z.infer<typeof recordSchema>
export function requestRef<T extends DurableRequest>(
  principalRef: string,
  request: T,
): {
  scope: z.infer<typeof GovernanceScopeSchema>
  owner: T['owner']
  principalRef: string
  operationId: string
} {
  return {
    scope:
      request.owner === 'withdraw' ? request.command.contribution.scope : request.command.scope,
    owner: request.owner,
    principalRef,
    operationId: request.command.operationId,
  }
}
