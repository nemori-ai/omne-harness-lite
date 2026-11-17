import { z } from 'zod'
import { SettingsReferenceSchema } from '@omne-harness/settings'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { intentIdentitySchema } from './intent-schema.ts'
export const organizationCurrentConfigurationSchema = z.strictObject({
  destination: SettingsReferenceSchema,
  sourceRoute: SettingsReferenceSchema,
})
export type OrganizationCurrentConfiguration = z.infer<
  typeof organizationCurrentConfigurationSchema
>
export const organizationCurrentPhaseSchema = z.enum(['capture', 'ready', 'commit'])
export type OrganizationCurrentPhase = z.infer<typeof organizationCurrentPhaseSchema>
export const standaloneCurrentRuleSchema = z.enum(['organization', 'tenant'])
export type StandaloneCurrentRule = z.infer<typeof standaloneCurrentRuleSchema>
export const standaloneCurrentParticipant = (
  rule: StandaloneCurrentRule,
  phase: OrganizationCurrentPhase,
) => `settings.${rule}-${phase}-current`
export const organizationCurrentParticipant = (phase: OrganizationCurrentPhase) =>
  standaloneCurrentParticipant('organization', phase)
export const organizationCurrentRequestSchema = z.strictObject({
  identity: intentIdentitySchema,
  commandKind: settingsAttemptBindingSchema.shape.commandKind,
  actorTenantRef: SettingsReferenceSchema,
  attempt: settingsAttemptBindingSchema.nullable(),
})
