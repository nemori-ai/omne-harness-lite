import { closeScopeSchema } from './scope.ts'
import { z } from 'zod'
import { SettingsSourceReceiptSchema } from '@omne-harness/settings-local/preparation'
import { GovernanceDigestSchema, GovernanceIdSchema } from '@omne-harness/governance-contract'
import {
  acceptSchema,
  bindingSchema,
  bootstrapSchema,
  executionSchema,
} from './operation-schema.ts'
import { standingPlanSchema, standingReceiptSchema } from './standing-schema.ts'
import { persistStageSchema } from './sql-stage-schema.ts'
import { adoptionEvidenceSchema } from './adoption-schema.ts'

export const ACTIVATION_PLAN = { key: 'governance.plan', protocol: 'governance-plan/1' }
export const ADOPTION_CURRENT = {
  key: 'governance.adoption-current',
  protocol: 'governance-adoption-current/1',
}
export const METADATA_PLANNER = 'governance.metadata-plan'
export const MUTATION_PLANNER = 'governance.mutation-plan'
export const ADOPTION_PLANNER = 'governance.adoption-plan'
export const CAPTURE_PLANNER = 'governance.catalog-snapshot'
export const ACTIVATION_PROTOCOL = 'governance-activation/1'
export const controlRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('persist-stage'), input: persistStageSchema }),
  z.strictObject({ kind: z.literal('bootstrap'), input: bootstrapSchema }),
  z.strictObject({ kind: z.literal('close-scope'), input: closeScopeSchema }),
  z.strictObject({ kind: z.literal('retire-contribution'), binding: bindingSchema }),
  z.strictObject({ kind: z.literal('accept'), input: acceptSchema }),
  z.strictObject({ kind: z.literal('standing-prepare'), input: standingPlanSchema }),
  z.strictObject({
    kind: z.literal('source-held'),
    binding: bindingSchema,
    receipt: SettingsSourceReceiptSchema.refine(receipt => receipt.kind === 'held'),
  }),
  z.strictObject({
    kind: z.literal('source-settled'),
    binding: bindingSchema,
    receipt: SettingsSourceReceiptSchema.refine(receipt => receipt.kind === 'settled'),
  }),
  z.strictObject({
    kind: z.literal('standing-held'),
    binding: bindingSchema,
    reservation: standingReceiptSchema,
  }),
  z.strictObject({
    kind: z.literal('standing-settled'),
    binding: bindingSchema,
    reservation: standingReceiptSchema,
    outcome: z.enum(['committed', 'aborted']),
  }),
  z.strictObject({ kind: z.literal('submit'), binding: bindingSchema, execution: executionSchema }),
  z.strictObject({ kind: z.literal('seal'), binding: bindingSchema }),
  z.strictObject({
    kind: z.literal('standing-seal'),
    reservation: standingReceiptSchema,
    route: z.strictObject({
      destination: GovernanceIdSchema,
      transactionDomain: GovernanceIdSchema,
    }),
  }),
])
export type ControlRequest = z.infer<typeof controlRequestSchema>
export const businessRequestSchema = z.strictObject({
  binding: bindingSchema,
  execution: executionSchema,
})
export type BusinessRequest = z.infer<typeof businessRequestSchema>
const businessPlan = z.strictObject({
  request: businessRequestSchema,
  epoch: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
})
export const activationPlanSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('control'), request: controlRequestSchema }),
  z.strictObject({ kind: z.literal('observation'), request: businessRequestSchema }),
  businessPlan.extend({ kind: z.literal('mutation') }),
  businessPlan.extend({ kind: z.literal('capture'), result: z.json() }),
  businessPlan.extend({ kind: z.literal('adoption'), evidence: adoptionEvidenceSchema }),
])
export type ActivationPlan = z.infer<typeof activationPlanSchema>
export const activationInputSchema = z.strictObject({ requestDigest: GovernanceDigestSchema })
