import { z } from 'zod'
import { AssetPublicationRefSchema } from '@omne-harness/assets-local'
import { StandalonePublicationRefSchema } from '@omne-harness/settings-local'
import { GovernanceDefinitionBundleSchema } from '@omne-harness/governance-contract'

export const GOVERNANCE_PUBLICATIONS = { key: 'harness.governance-publications', protocol: '1' }
export const governancePublicationSchema = z.strictObject({
  publication: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('asset'), reference: AssetPublicationRefSchema }),
    z.strictObject({ kind: z.literal('independent'), reference: StandalonePublicationRefSchema }),
  ]),
  declaration: GovernanceDefinitionBundleSchema,
})
export const governancePublicationsSchema = z.array(governancePublicationSchema).max(128)
export type GovernancePublication = z.infer<typeof governancePublicationSchema>
