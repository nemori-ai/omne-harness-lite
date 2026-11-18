import {
  createIdentityQualifiedSettingsPreparation,
  createTenantSettingsCurrent,
  type IdentityQualifiedPreparationOptions,
} from '@omne-harness/settings-local/preparation'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { INDEPENDENT_SETTINGS_CONFIGURATION } from './independent-settings.ts'
import type { governanceStorageCombinations } from './storage-combinations.ts'

type Registration = Readonly<{ combinationVersion: string; manifestDigest: string }>
const reference = (value: Registration): Registration => ({
  combinationVersion: value.combinationVersion,
  manifestDigest: value.manifestDigest,
})

/** Changes to a tenant's independent targets: the settings current, no governance snapshot. */
export function createIndependentSettingsPreparation(options: {
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
      destination: INDEPENDENT_SETTINGS_CONFIGURATION.destination,
      registrations: {
        checkpoint: reference(combinations.tenantSettingsCheckpoint),
        ready: reference(combinations.independentReady),
        commit: reference(combinations.independentCommit),
        recovery: reference(combinations.tenantSettingsRecovery),
      },
      ...createTenantSettingsCurrent({
        storage,
        domain,
        capture: reference(combinations.independentCapture),
        configuration: INDEPENDENT_SETTINGS_CONFIGURATION,
      }),
      sources: { reserve: unsupported, settle: unsupported },
    },
  })
}
