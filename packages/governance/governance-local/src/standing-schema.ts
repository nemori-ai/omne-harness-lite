import { z } from 'zod'
import {
  isQualification,
  isStandingBinding,
  isStandingReservation,
  type Qualification,
  type StandingBinding,
} from '@omne-harness/identity'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import { bindingSchema } from './operation-schema.ts'

export const qualificationsSchema = z
  .array(z.custom<Qualification>(isQualification))
  .max(16)
  .transform(values => [...new Set(values)].sort())
export const standingRequestSchema = z.strictObject({
  binding: z.custom<StandingBinding>(isStandingBinding),
  required: qualificationsSchema,
})
export const standingReceiptSchema = standingRequestSchema
  .extend({ id: z.string() })
  .refine(isStandingReservation)
export const standingRecoverySchema = z.strictObject({
  version: z.literal('governance-recovery/1'),
  operation: bindingSchema,
  transactionDomain: GovernanceIdSchema,
})
const custody = z.strictObject({ request: standingRequestSchema, reservationId: z.string() })
export const standingCustodySchema = z.discriminatedUnion('kind', [
  custody.extend({ kind: z.literal('requested') }),
  custody.extend({ kind: z.literal('held'), reservation: standingReceiptSchema }),
  custody.extend({
    kind: z.literal('settled'),
    reservation: standingReceiptSchema,
    outcome: z.enum(['committed', 'aborted']),
  }),
])
export type StandingCustody = z.infer<typeof standingCustodySchema>
export const standingPlanSchema = z.strictObject({
  operation: bindingSchema,
  destination: GovernanceIdSchema,
  required: qualificationsSchema,
})
export type StandingPlan = z.input<typeof standingPlanSchema>
