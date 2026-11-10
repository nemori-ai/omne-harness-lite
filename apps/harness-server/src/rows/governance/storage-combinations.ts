import { UNMAPPED_PERMISSION_SNAPSHOT } from './unmapped-permission-snapshot.ts'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { AGENT_PERMISSION_CURRENT } from './agent-permission-current.ts'
import {
  TOOL_PERMISSION_CURRENT,
  AGENT_TOOL_PERMISSION_CURRENT,
} from './tool-permission-current.ts'
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
import { SESSION_PERMISSION_RESULT } from './session-permission-result.ts'
import { sessionPermissionWriteBasis } from './storage-materials.ts'

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
const permissionRead = [
  ...snapshot,
  ...SESSION_LOG_PARTICIPANTS,
  'session-permission-guard',
  'governance.permission-snapshot',
  'governance.activation',
]
const unmappedPermissionRead = [
  'assets.settings',
  'harness.tool-permission-release',
  SUPPORT_PARTICIPANT.participant,
  'governance.selected-definition-projection',
  UNMAPPED_PERMISSION_SNAPSHOT.participant,
  ...SESSION_LOG_PARTICIPANTS,
  'session-permission-guard',
  'governance.permission-snapshot',
  'governance.activation',
]
const permissionWrite = [
  'execution-record',
  'governance.external-write-basis',
  'session',
  SESSION_PERMISSION_RESULT.participant,
  'governance.external-write-terminal',
  'governance.activation',
]

/** Each combination has one writer per table and one provider per required fact. */
export function governanceStorageCombinations(catalog: SqlMaterialCatalog) {
  const definitions = {
    permissionAgentUnmapped: [
      ...unmappedPermissionRead,
      'session-execution-guard',
      AGENT_PERMISSION_CURRENT,
    ],
    permissionToolUnmapped: [
      ...unmappedPermissionRead,
      'tool',
      'tool-record-current',
      TOOL_PERMISSION_CURRENT,
    ],
    permissionAgentToolUnmapped: [
      ...unmappedPermissionRead,
      'tool',
      'tool-record-current',
      'session-execution-guard',
      AGENT_TOOL_PERMISSION_CURRENT,
    ],

    permissionAgent: [...permissionRead, 'session-execution-guard', AGENT_PERMISSION_CURRENT],
    permissionTool: [...permissionRead, 'tool', 'tool-record-current', TOOL_PERMISSION_CURRENT],
    permissionAgentTool: [
      ...permissionRead,
      'tool',
      'tool-record-current',
      'session-execution-guard',
      AGENT_TOOL_PERMISSION_CURRENT,
    ],
    metadata: ['governance.metadata-plan', 'governance.activation'],
    mutation: ['governance.mutation-plan', 'governance.activation'],
    assets: [...publications, ADOPTION_CURRENT_PARTICIPANT.participant],
    adoption: [
      ...publications,
      ADOPTION_CURRENT_PARTICIPANT.participant,
      'governance.adoption-plan',
      'governance.activation',
    ],
    catalog: [
      ...publications,
      CATALOG_CURRENT_PARTICIPANT.participant,
      'governance.catalog-snapshot',
      'governance.activation',
    ],
    settingsCatalog: [
      ...snapshot,
      'governance.metadata-plan',
      'governance.activation',
      'settings.catalog-terminal',
      'settings.snapshot',
    ],
    sessionClear: [...permissionWrite, sessionPermissionWriteBasis('clear').participant],
    sessionUnmapped: [
      ...permissionWrite,
      'governance.definition-projection',
      sessionPermissionWriteBasis('unmapped').participant,
    ],
    sessionMapped: [
      ...permissionWrite,
      ...snapshot,
      'governance.definition-projection',
      sessionPermissionWriteBasis('mapped').participant,
    ],
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
    permissionAgentUnmapped: build('permissionAgentUnmapped'),
    permissionToolUnmapped: build('permissionToolUnmapped'),
    permissionAgentToolUnmapped: build('permissionAgentToolUnmapped'),
    permissionAgent: build('permissionAgent'),
    permissionTool: build('permissionTool'),
    permissionAgentTool: build('permissionAgentTool'),
    metadata: build('metadata'),
    mutation: build('mutation'),
    assets: build('assets'),
    adoption: build('adoption'),
    catalog: build('catalog'),
    settingsCatalog: build('settingsCatalog'),
    sessionClear: build('sessionClear'),
    sessionUnmapped: build('sessionUnmapped'),
    sessionMapped: build('sessionMapped'),
  }
}
