import { UNMAPPED_PERMISSION_SNAPSHOT } from './unmapped-permission-snapshot.ts'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import {
  SETTINGS_CHECKPOINT_PARTICIPANTS,
  SETTINGS_COMMIT_PARTICIPANTS,
  SETTINGS_READY_PARTICIPANTS,
  SETTINGS_RECOVERY_PARTICIPANTS,
} from '@omne-harness/settings-local/preparation'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { SUPPORT_PARTICIPANT } from './permission-protocol.ts'
import { ADOPTION_CURRENT_PARTICIPANT } from './adoption-current.ts'
import { CATALOG_CURRENT_PARTICIPANT } from './catalog-current.ts'
import { TARGET_SNAPSHOT } from './target-snapshot.ts'
import { PERMISSION_BASIS, PERMISSION_BASIS_GUARD } from './permission-basis.ts'
import { sessionPermissionBasisProducer } from './session-permission-basis.ts'
import { tenantSettingsCurrentParticipant } from './tenant-settings-current.ts'

const publications = [
  'assets.settings',
  'settings.targets',
  'settings.target-projection',
  ...SETTINGS_RECOVERY_PARTICIPANTS,
  'harness.tool-permission-release',
  SUPPORT_PARTICIPANT.participant,
]
const snapshot = [
  ...publications,
  ADOPTION_CURRENT_PARTICIPANT.participant,
  'governance.target-projection',
  'settings.value-projection',
  TARGET_SNAPSHOT.participant,
]
const basisRead = [...snapshot, ...SESSION_LOG_PARTICIPANTS, 'session-permission-guard']
const unmappedBasisRead = [
  'assets.settings',
  'harness.tool-permission-release',
  SUPPORT_PARTICIPANT.participant,
  'governance.selected-definition-projection',
  UNMAPPED_PERMISSION_SNAPSHOT.participant,
  ...SESSION_LOG_PARTICIPANTS,
  'session-permission-guard',
]
export const PROJECTION_READ_MEMBERS = [
  ...snapshot,
  'governance.selected-definition-projection',
  UNMAPPED_PERMISSION_SNAPSHOT.participant,
  'session-permission-guard',
  PERMISSION_BASIS.participant,
  CATALOG_CURRENT_PARTICIPANT.participant,
  'governance.catalog-snapshot',
]
const startCondition = (read: readonly string[]) => [
  ...read,
  'governance.activation',
  'governance.metadata-plan',
  PERMISSION_BASIS.participant,
  PERMISSION_BASIS_GUARD.participant,
  'tool',
]
const permissionWrite = (mode: 'clear' | 'unmapped' | 'mapped') => [
  'execution-record',
  'session',
  sessionPermissionBasisProducer(mode),
]
const settingsWriteRead = [...snapshot, 'governance.metadata-plan', 'governance.activation'].filter(
  value => !SETTINGS_RECOVERY_PARTICIPANTS.includes(value),
)
const definitionProjection = [
  'governance.definition-projection',
  'governance.activation',
  'governance.metadata-plan',
]

export const VERSION_DIGEST_LENGTH = 16

export function governanceStorageCombinations(catalog: SqlMaterialCatalog) {
  const definitions = {
    toolStart: startCondition(basisRead),
    toolStartUnmapped: startCondition(unmappedBasisRead),
    metadata: ['governance.metadata-plan', 'governance.activation'],
    mutation: ['governance.mutation-plan', 'governance.activation'],
    assets: [...publications, ADOPTION_CURRENT_PARTICIPANT.participant],
    adoption: [
      ...publications,
      ADOPTION_CURRENT_PARTICIPANT.participant,
      'governance.adoption-plan',
      'governance.activation',
    ],
    settingsCatalog: [
      ...snapshot,
      'governance.metadata-plan',
      'governance.activation',
      'settings.catalog-terminal',
      'settings.snapshot',
    ],
    sessionClear: permissionWrite('clear'),
    sessionUnmapped: [...permissionWrite('unmapped'), ...definitionProjection],
    sessionMapped: [...permissionWrite('mapped'), ...snapshot, ...definitionProjection],
    tenantSettingsSnapshot: [...settingsWriteRead, ...SETTINGS_RECOVERY_PARTICIPANTS],
    tenantSettingsCheckpoint: [...SETTINGS_CHECKPOINT_PARTICIPANTS],
    tenantSettingsReady: [
      ...settingsWriteRead,
      ...SETTINGS_READY_PARTICIPANTS,
      tenantSettingsCurrentParticipant('ready'),
    ],
    tenantSettingsCommit: [
      ...settingsWriteRead,
      ...SETTINGS_COMMIT_PARTICIPANTS,
      tenantSettingsCurrentParticipant('commit'),
    ],
    tenantSettingsRecovery: [...SETTINGS_RECOVERY_PARTICIPANTS],
  }
  function build(name: keyof typeof definitions) {
    const participants = [...new Set(definitions[name])]
    const result = combinationManifest({ catalog, participants })
    if (result.kind !== 'manifest')
      throw new Error(`Invalid governance combination ${name}: ${JSON.stringify(result)}`)
    // The version follows the manifest: these manifests change when other owners' participants change,
    // and storage refuses one version with another manifest, so a hand-written version breaks tenants.
    const digest = manifestDigest(result.manifest)
    return {
      participants,
      combinationVersion: `harness-governance-${name}/${digest.slice(0, VERSION_DIGEST_LENGTH)}`,
      manifestDigest: digest,
    }
  }
  return {
    toolStart: build('toolStart'),
    toolStartUnmapped: build('toolStartUnmapped'),
    metadata: build('metadata'),
    mutation: build('mutation'),
    assets: build('assets'),
    adoption: build('adoption'),
    settingsCatalog: build('settingsCatalog'),
    sessionClear: build('sessionClear'),
    sessionUnmapped: build('sessionUnmapped'),
    sessionMapped: build('sessionMapped'),
    tenantSettingsSnapshot: build('tenantSettingsSnapshot'),
    tenantSettingsCheckpoint: build('tenantSettingsCheckpoint'),
    tenantSettingsReady: build('tenantSettingsReady'),
    tenantSettingsCommit: build('tenantSettingsCommit'),
    tenantSettingsRecovery: build('tenantSettingsRecovery'),
  }
}
