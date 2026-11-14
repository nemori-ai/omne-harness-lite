import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { loadProductionRelease, type ToolRelease } from '../../entry/tool-release.ts'
import { governanceStorageMaterials } from '../governance/storage-materials.ts'
import { storageCatalog } from './catalog.ts'

export async function productionStorageCatalog(
  readRelease: () => Promise<ToolRelease> = loadProductionRelease,
): Promise<SqlMaterialCatalog> {
  const core = storageCatalog()
  const governance = governanceStorageMaterials(await readRelease(), core)
  return {
    ...core,
    participants: [...core.participants, ...governance.participants],
    migrations: [...core.migrations, ...governance.migrations],
    readHandlers: [...core.readHandlers, ...governance.readHandlers],
  }
}
