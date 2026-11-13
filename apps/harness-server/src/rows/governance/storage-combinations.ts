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
/** The members that compute the permission basis of a mapped and of an unmapped target. */
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
/**
 * The members of the projection read. Their commands compute the permission basis, in a read or
 * in a commit, and the pages of the governance catalog.
 */
export const PROJECTION_READ_MEMBERS = [
  ...snapshot,
  'governance.selected-definition-projection',
  UNMAPPED_PERMISSION_SNAPSHOT.participant,
  'session-permission-guard',
  PERMISSION_BASIS.participant,
  CATALOG_CURRENT_PARTICIPANT.participant,
  'governance.catalog-snapshot',
]
/**
 * A Tool start commits its acceptance with the basis commands and the basis guard. The Governance
 * writer is a member because it owns the tables that the projections read; it gets no command.
 * The metadata planner is a member because the manifest needs a provider of the plan fact.
 */
const startCondition = (read: readonly string[]) => [
  ...read,
  'governance.activation',
  'governance.metadata-plan',
  PERMISSION_BASIS.participant,
  PERMISSION_BASIS_GUARD.participant,
  'tool',
]
/**
 * A Session permission assignment commits with the producer of its basis. The Session members are
 * the execution record and the Session writer; the ordinary basis producer is not a member.
 */
const permissionWrite = (mode: 'clear' | 'unmapped' | 'mapped') => [
  'execution-record',
  'session',
  sessionPermissionBasisProducer(mode),
]
/**
 * A tenant-layer Settings write reads the target snapshot in its plan and again in its ready and
 * commit transactions. The Settings recovery members write the tables of the preparation, so the
 * ready and commit combinations take the preparation members of Settings instead.
 */
const settingsWriteRead = [...snapshot, 'governance.metadata-plan', 'governance.activation'].filter(
  value => !SETTINGS_RECOVERY_PARTICIPANTS.includes(value),
)
/** The definition projection reads Governance tables: their writer and its planner are members. */
const definitionProjection = [
  'governance.definition-projection',
  'governance.activation',
  'governance.metadata-plan',
]

/** The characters of the manifest digest a combination version carries: 64 bits of it. */
const VERSION_DIGEST_LENGTH = 16

/** Each combination has one writer per table and one provider per required fact. */
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
    // The version follows the manifest: storage keeps one manifest per version and refuses the same
    // version with another one (sql-contract `registration_conflict`). These manifests hold
    // participants of other owners (the Session writer, the execution record), so they change
    // when those change. A version written by hand stayed `/1` through such a change, and every
    // tenant registered before it could no longer open its governance.
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
