import { z } from 'zod'
import {
  SettingsDefinitionRefSchema,
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsTargetSchema,
} from '@omne-harness/settings'
import { SettingsProjectionBindingSchema } from './projection.ts'
import { digest } from './encoding.ts'
import type { OperationBinding } from './schema.ts'
export const SNAPSHOT_PARTICIPANT = 'settings.snapshot'
export const SNAPSHOT_PROTOCOL = 'settings-snapshot/1'
export const SnapshotInputSchema = z.strictObject({
  purpose: z.enum(['values', 'authority']),
  binding: SettingsProjectionBindingSchema,
  availability: z.array(SettingsDefinitionRefSchema).max(1024),
  registryTargets: z.array(SettingsTargetSchema).max(1024),
  incarnation: SettingsIdSchema,
  registryRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expiryEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  selectionDigest: SettingsReferenceSchema.nullable(),
})
export type SnapshotInput = z.infer<typeof SnapshotInputSchema>
export function snapshotOperation(input: SnapshotInput): OperationBinding {
  if (input.binding.domain.scope.kind !== 'tenant')
    throw new TypeError('Tenant settings snapshot required')
  return {
    domain: input.binding.domain,
    principalRef: input.binding.principalRef,
    operationId: input.binding.captureId,
    subject: {
      kind: 'catalog-capture',
      deploymentRef: input.binding.request.deploymentRef,
      tenantRef: input.binding.domain.scope.tenant,
    },
    commandDigest: digest(input),
  }
}
