import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { dispatchSqlMaterials } from '@omne-harness/dispatch-local'
import { mediaSqlMaterials } from '@omne-harness/media-storage-sql'
import { notificationSqlMaterials } from '@omne-harness/notification-local'
import { workspaceSqlMaterials } from '@omne-harness/workspace-local'
import { loadProductionRelease, type ToolRelease } from '../../entry/tool-release.ts'
import { calendarStorageMaterials } from '../calendar/authority.ts'
import { scheduleStorageMaterials } from '../schedule/guard.ts'
import { governanceStorageMaterials } from '../governance/storage-materials.ts'
import { storageCatalog } from './catalog.ts'

export async function productionStorageCatalog(
  readRelease: () => Promise<ToolRelease> = loadProductionRelease,
): Promise<SqlMaterialCatalog> {
  const core = storageCatalog()
  const governance = governanceStorageMaterials(await readRelease(), core)
  const domains = [
    governance,
    calendarStorageMaterials(),
    scheduleStorageMaterials(),
    notificationSqlMaterials(),
    dispatchSqlMaterials(),
    mediaSqlMaterials(),
    workspaceSqlMaterials(),
  ]
  return {
    ...core,
    participants: [...core.participants, ...domains.flatMap(owner => owner.participants)],
    migrations: [...core.migrations, ...domains.flatMap(owner => owner.migrations)],
    readHandlers: [...core.readHandlers, ...domains.flatMap(owner => owner.readHandlers)],
  }
}
