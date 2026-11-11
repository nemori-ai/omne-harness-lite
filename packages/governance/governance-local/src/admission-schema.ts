import {
  EnforcementBindingSchema,
  GovernanceDefinitionBundleSchema,
  GovernanceIdSchema,
  GovernanceScopeSchema,
} from '@omne-harness/governance-contract'
import { QUALIFICATIONS } from '@omne-harness/identity'
import { z } from 'zod'

const otherAction = z.enum([
  'withdraw',
  'adopt',
  'catalog-management',
  'catalog-runtime',
  'operation-read',
])
const scope = z.strictObject({ scope: GovernanceScopeSchema })
export const admissionRequestSchema = z.discriminatedUnion('action', [
  scope.extend({ action: z.literal('contribute'), declaration: GovernanceDefinitionBundleSchema }),
  scope.extend({ action: otherAction }),
])
export type AdmissionRequest = z.infer<typeof admissionRequestSchema>

const grant = scope.extend({
  principalRef: GovernanceIdSchema,
  required: z.array(z.enum(QUALIFICATIONS)).max(QUALIFICATIONS.length),
})
export const admissionGrantsSchema = z
  .array(
    z.discriminatedUnion('action', [
      grant.extend({
        action: z.literal('contribute'),
        owners: z
          .array(
            z.strictObject({
              ownerId: GovernanceIdSchema,
              enforcementBindings: z.array(EnforcementBindingSchema).max(128),
            }),
          )
          .max(128),
      }),
      grant.extend({ action: otherAction }),
    ]),
  )
  .max(128)
export type AdmissionGrant = z.infer<typeof admissionGrantsSchema>[number]
