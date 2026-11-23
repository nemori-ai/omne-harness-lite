import { z } from 'zod'
import {
  AssetPublicationRefSchema,
  type assetsPublicationCommand,
} from '@omne-harness/assets-local'
import { GovernanceDefinitionBundleSchema } from '@omne-harness/governance-contract'
import { SettingsTargetSchema } from '@omne-harness/settings'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { categoryGateTemplateSchema } from '../../entry/category-gates.ts'
import { permissionInterpretationSchema } from './permission-interpretation.ts'
import { SUPPORT_PARTICIPANT } from './permission-protocol.ts'

export const GOVERNED_PARTICIPANT = 'harness.tool-permission-release'
export const governedProtocol = (generation: string) =>
  `harness-tool-permission-release/2/${generation}`

export const governedCategoryCapabilitySchema = z.strictObject({
  template: categoryGateTemplateSchema,
  target: SettingsTargetSchema,
  enabled: z.boolean(),
  publication: z.strictObject({ kind: z.literal('asset'), reference: AssetPublicationRefSchema }),
  declaration: GovernanceDefinitionBundleSchema,
  interpretations: z.array(permissionInterpretationSchema),
})
export const governedCategoryCapabilitiesSchema = z.array(governedCategoryCapabilitySchema).max(128)
export type GovernedCategoryCapability = z.infer<typeof governedCategoryCapabilitySchema>

export function governedPublicationCommands(
  assets: ReturnType<typeof assetsPublicationCommand>,
): readonly FactCommandV2[] {
  return [
    assets,
    { participant: GOVERNED_PARTICIPANT, facts: {} },
    { participant: SUPPORT_PARTICIPANT.participant, facts: {} },
  ]
}
