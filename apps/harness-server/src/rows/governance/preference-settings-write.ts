import {
  createIdentityQualifiedSettingsPreparation,
  createTenantSettingsCurrent,
  type IdentityQualifiedPreparationOptions,
} from '@omne-harness/settings-local/preparation'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { PREFERENCE_SETTINGS_CONFIGURATION } from './preference-settings.ts'
import type { governanceStorageCombinations } from './storage-combinations.ts'

type Registration = Readonly<{ combinationVersion: string; manifestDigest: string }>
const reference = (value: Registration): Registration => ({
  combinationVersion: value.combinationVersion,
  manifestDigest: value.manifestDigest,
})

/** Changes to a tenant's own preference targets: the settings current, no governance snapshot. */
export function createPreferenceSettingsPreparation(options: {
  storage: SqlStorage
  domain: DomainRef
  identity: IdentityQualifiedPreparationOptions['identity']
  combinations: ReturnType<typeof governanceStorageCombinations>
}) {
  const unsupported = async () => ({ kind: 'rejected', reason: 'unsupported' }) as const
  const { storage, domain, combinations } = options
  return createIdentityQualifiedSettingsPreparation({
    identity: options.identity,
    required: [],
    backend: {
      storage,
      domain,
      destination: PREFERENCE_SETTINGS_CONFIGURATION.destination,
      registrations: {
        checkpoint: reference(combinations.tenantSettingsCheckpoint),
        ready: reference(combinations.preferenceReady),
        commit: reference(combinations.preferenceCommit),
        recovery: reference(combinations.tenantSettingsRecovery),
      },
      ...createTenantSettingsCurrent({
        storage,
        domain,
        capture: reference(combinations.preferenceCapture),
        configuration: PREFERENCE_SETTINGS_CONFIGURATION,
      }),
      sources: { reserve: unsupported, settle: unsupported },
    },
  })
}
