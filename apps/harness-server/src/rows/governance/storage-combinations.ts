import { UNMAPPED_PERMISSION_SNAPSHOT } from './unmapped-permission-snapshot.ts'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { SETTINGS_RECOVERY_PARTICIPANTS } from '@omne-harness/settings-local/preparation'
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
/** The definition projection reads Governance tables: their writer and its planner are members. */
const definitionProjection = [
  'governance.definition-projection',
  'governance.activation',
  'governance.metadata-plan',
]

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
  }
  function build(name: keyof typeof definitions) {
    const participants = [...new Set(definitions[name])]
    const result = combinationManifest({ catalog, participants })
    if (result.kind !== 'manifest')
      throw new Error(`Invalid governance combination ${name}: ${JSON.stringify(result)}`)
    return {
      participants,
      combinationVersion: `harness-governance-${name}/1`,
      manifestDigest: manifestDigest(result.manifest),
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
  }
}
