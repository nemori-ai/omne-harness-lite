import { z } from 'zod'
import { PermissionCurrentBasisSchema, PermissionEvaluationSchema } from '@omne-harness/permissions'
import { SettingsTargetSchema } from '@omne-harness/settings'
import { SettingsSourceReferenceSchema } from '@omne-harness/settings-local/preparation'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import { bindingSchema } from './operation-schema.ts'
import { permissionQualificationSchema } from './permission-qualification.ts'

export const PERMISSION_CURRENT = {
  key: 'governance.permission-current',
  protocol: 'governance-permission-current/2',
}
export const PERMISSION_SNAPSHOT = {
  participant: 'governance.permission-snapshot',
  protocol: 'governance-permission-snapshot/2',
}
export const permissionCurrentSchema = z.strictObject({
  binding: bindingSchema,
  epoch: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  target: SettingsTargetSchema,
  source: SettingsSourceReferenceSchema.nullable(),
  qualification: permissionQualificationSchema,
  evaluation: PermissionEvaluationSchema,
})
export const permissionReadingSchema = z.union([
  PermissionCurrentBasisSchema,
  z.strictObject({ kind: z.literal('unavailable'), sourceRef: GovernanceIdSchema }),
])
export type PermissionCurrent = z.infer<typeof permissionCurrentSchema>
