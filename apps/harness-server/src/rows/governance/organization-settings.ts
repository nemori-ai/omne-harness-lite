import { canonicalDigest } from '@omne-harness/tool'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import { SettingsSourceReferenceSchema } from '@omne-harness/settings-local/preparation'
import type { SettingDefinitions } from '@omne-harness/settings'
import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import { organizationSettingsCombination } from './organization-settings-combination.ts'

const domain = { scope: { kind: 'system' as const }, transactionDomain: 'system.settings' }

export function organizationSettingsSource(input: {
  organizationId: string
  definition: Pick<SettingDefinitions, 'providerId' | 'definitionId'>
}) {
  return SettingsSourceReferenceSchema.parse({
    domain,
    target: {
      policyId: 'independent',
      scopeRef: input.organizationId,
      targetRef: canonicalDigest({
        providerId: input.definition.providerId,
        definitionId: input.definition.definitionId,
      }),
    },
  })
}

export async function openOrganizationSettingsSources(options: {
  storage: SqlStorage
  materials: SqlMaterialCatalog
}) {
  const { participants, ...registration } = organizationSettingsCombination(options.materials)
  const registered = await options.storage.registerCombination({
    ...domain,
    ...registration,
    participants,
  })
  if (registered.kind !== 'registered')
    return { kind: 'unavailable' as const, phase: 'registration' as const }
  const targets = createStandaloneSettingsOwner({
    storage: options.storage,
    domain,
    ...registration,
  })
  return { kind: 'created' as const, targets, close: () => targets.close() }
}
