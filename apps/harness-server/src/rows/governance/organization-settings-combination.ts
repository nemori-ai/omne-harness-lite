import { SETTINGS_RECOVERY_PARTICIPANTS } from '@omne-harness/settings-local/preparation'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'

/** Capture needs the original target and value owners, but executes no value write command. */
export function organizationSettingsCombination(catalog: SqlMaterialCatalog) {
  const participants = [
    ...SETTINGS_RECOVERY_PARTICIPANTS.filter(name => name !== 'settings.source-finalization'),
    'settings.source-snapshot',
    'settings.targets',
  ]
  const result = combinationManifest({ catalog, participants })
  if (result.kind !== 'manifest')
    throw new Error(`Invalid organization Settings combination: ${JSON.stringify(result)}`)
  return {
    participants,
    combinationVersion: 'harness-organization-settings/1',
    manifestDigest: manifestDigest(result.manifest),
  }
}
