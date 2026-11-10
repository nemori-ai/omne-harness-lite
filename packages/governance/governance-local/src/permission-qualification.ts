import { z } from 'zod'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'

/** Foreign-owner observation kept with the original permission request, never a grant. */
export const permissionQualificationSchema = z.strictObject({
  owner: GovernanceIdSchema,
  protocol: GovernanceIdSchema,
  observation: z.json(),
})
export type PermissionQualification = z.infer<typeof permissionQualificationSchema>
