import { z } from 'zod'
import { GovernanceDefinitionBundleSchema, GovernanceDefinitionRefSchema } from './schema.ts'

export const GovernanceDefinitionIdentitySchema = GovernanceDefinitionRefSchema.omit({
  digest: true,
})
export type GovernanceDefinitionIdentity = z.infer<typeof GovernanceDefinitionIdentitySchema>

export const GovernanceDefinitionReadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('definition'), declaration: GovernanceDefinitionBundleSchema }),
  z.strictObject({ kind: z.literal('unavailable') }),
])
export type GovernanceDefinitionRead = z.infer<typeof GovernanceDefinitionReadSchema>

export interface GovernanceDefinitionSource {
  resolve(identity: GovernanceDefinitionIdentity): Promise<GovernanceDefinitionRead>
}
