import { unmappedPermissionSnapshotParticipant } from './unmapped-permission-snapshot.ts'
import { assetsSqlMaterials } from '@omne-harness/assets-local'
import { governanceSqlMaterials } from '@omne-harness/governance-local'
import {
  settingsCatalogMaterials,
  settingsSqlMaterials,
  settingsStandaloneMaterials,
  settingsValueProjectionMaterials,
} from '@omne-harness/settings-local'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { governanceCurrentParticipant } from './adoption-current.ts'
import { governanceCatalogCurrentParticipant } from './catalog-current.ts'
import {
  permissionSqlParticipants,
  toolPermissionReleaseParticipant,
} from './permission-materials.ts'
import { SUPPORT_PARTICIPANT } from './permission-protocol.ts'
import {
  SESSION_PERMISSION_BASIS_MODES,
  sessionPermissionBasisParticipant,
} from './session-permission-basis.ts'
import { targetSnapshotParticipant } from './target-snapshot.ts'
import { permissionBasisGuardParticipant, permissionBasisParticipant } from './permission-basis.ts'
import { projectionReadHandler } from './projection-read.ts'
import { PROJECTION_READ_MEMBERS } from './storage-combinations.ts'
import {
  TENANT_SETTINGS_CONFIGURATION,
  tenantSettingsCurrentParticipants,
} from './tenant-settings-current.ts'

export const GOVERNANCE_PROJECTION_READ = 'harness.governance-projection-read'

type Materials = Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>

function projectionRead(all: Pick<SqlMaterialCatalog, 'participants' | 'migrations'>) {
  const members = PROJECTION_READ_MEMBERS.map(name =>
    all.participants.find(participant => participant.participant === name),
  )
  return members.every(member => member !== undefined)
    ? [projectionReadHandler(GOVERNANCE_PROJECTION_READ, members, all)]
    : []
}

export function governanceStorageMaterials(
  release: ToolRelease,
  core: Pick<SqlMaterialCatalog, 'participants' | 'migrations'>,
): Materials {
  const owners = [
    assetsSqlMaterials(),
    governanceSqlMaterials(),
    settingsSqlMaterials(),
    settingsStandaloneMaterials(),
    settingsCatalogMaterials(),
  ]
  const participants = [
    ...owners.flatMap(owner => owner.participants),
    ...settingsValueProjectionMaterials(),
    ...permissionSqlParticipants().filter(
      value => value.participant === SUPPORT_PARTICIPANT.participant,
    ),
    ...(release.kind === 'trusted' ? [toolPermissionReleaseParticipant(release)] : []),
    governanceCurrentParticipant(),
    governanceCatalogCurrentParticipant(),
    targetSnapshotParticipant(),
    unmappedPermissionSnapshotParticipant(),
    ...SESSION_PERMISSION_BASIS_MODES.map(mode =>
      sessionPermissionBasisParticipant({ mode, requiredConstraintIds: [] }),
    ),
    permissionBasisParticipant(),
    permissionBasisGuardParticipant(),
    ...tenantSettingsCurrentParticipants(TENANT_SETTINGS_CONFIGURATION),
  ]
  const migrations = owners.flatMap(owner => owner.migrations)
  return {
    participants,
    migrations,
    readHandlers: [
      ...owners.flatMap(owner => owner.readHandlers),
      ...projectionRead({
        participants: [...core.participants, ...participants],
        migrations: [...core.migrations, ...migrations],
      }),
    ],
  }
}
