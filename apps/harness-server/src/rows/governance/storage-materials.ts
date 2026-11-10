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
import { sessionPermissionBasisParticipant } from './session-permission-basis.ts'
import { sessionPermissionResultParticipant } from './session-permission-result.ts'
import { targetSnapshotParticipant } from './target-snapshot.ts'
import { permissionBasisGuardParticipant, permissionBasisParticipant } from './permission-basis.ts'
import { projectionReadHandler } from './projection-read.ts'
import { PROJECTION_READ_MEMBERS } from './storage-combinations.ts'

export const SESSION_PERMISSION_WRITE_MODES = ['clear', 'unmapped', 'mapped'] as const
export const sessionPermissionWriteBasis = (
  mode: (typeof SESSION_PERMISSION_WRITE_MODES)[number],
) => sessionPermissionBasisParticipant({ mode, requiredConstraintIds: [] })

export const GOVERNANCE_PROJECTION_READ = 'harness.governance-projection-read'

type Materials = Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>

/**
 * No handler when a member is absent, for example without a trusted release: permission checks
 * and catalog reads are then unavailable.
 */
function projectionRead(all: Pick<SqlMaterialCatalog, 'participants' | 'migrations'>) {
  const members = PROJECTION_READ_MEMBERS.map(name =>
    all.participants.find(participant => participant.participant === name),
  )
  return members.every(member => member !== undefined)
    ? [projectionReadHandler(GOVERNANCE_PROJECTION_READ, members, all)]
    : []
}

/**
 * Materials do not publish assets, create holdings, or authorize an operation. `core` holds the
 * Session participants and migrations: the permission basis reads the Session permission.
 */
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
    ...SESSION_PERMISSION_WRITE_MODES.map(sessionPermissionWriteBasis),
    sessionPermissionResultParticipant(),
    permissionBasisParticipant(),
    permissionBasisGuardParticipant(),
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
