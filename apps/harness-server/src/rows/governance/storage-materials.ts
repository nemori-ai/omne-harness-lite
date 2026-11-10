import { unmappedPermissionSnapshotParticipant } from './unmapped-permission-snapshot.ts'
import { agentPermissionCurrentParticipant } from './agent-permission-current.ts'
import { toolPermissionCurrentParticipant } from './tool-permission-current.ts'
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

export const SESSION_PERMISSION_WRITE_MODES = ['clear', 'unmapped', 'mapped'] as const
export const sessionPermissionWriteBasis = (
  mode: (typeof SESSION_PERMISSION_WRITE_MODES)[number],
) => sessionPermissionBasisParticipant({ mode, requiredConstraintIds: [] })

/** Materials do not publish assets, create holdings, or authorize an operation. */
export function governanceStorageMaterials(
  release: ToolRelease,
): Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'> {
  const owners = [
    assetsSqlMaterials(),
    governanceSqlMaterials(),
    settingsSqlMaterials(),
    settingsStandaloneMaterials(),
    settingsCatalogMaterials(),
  ]
  return {
    participants: [
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
      agentPermissionCurrentParticipant({ requiredConstraintIds: [] }),
      toolPermissionCurrentParticipant({ requiredConstraintIds: [] }),
      toolPermissionCurrentParticipant({ requiredConstraintIds: [] }, 'agent'),
      ...SESSION_PERMISSION_WRITE_MODES.map(sessionPermissionWriteBasis),
      sessionPermissionResultParticipant(),
    ],
    migrations: owners.flatMap(owner => owner.migrations),
    readHandlers: owners.flatMap(owner => owner.readHandlers),
  }
}
