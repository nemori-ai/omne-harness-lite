// 本构建的材料目录（sql-contract §4.2，装配页「租户到事务域的目录 · 组合登记」）：应用在构建时静态导入各拥有者的材料，
// 合成一个目录交给 `storageHost`。波 1 只有会话存储的材料；Model 与 Tool 的耐久记录仓材料由各自的线加进来。
// 目录不声明组合：组合由 `session-storage` 行显式登记（`registerCombination`），提供者打开事务域时不自动登记。
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'

/** 读一次材料文件，返回带摘要的目录。 */
export function storageCatalog(): SqlMaterialCatalog {
  const session = sessionStorageMaterials()
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [...session.participants],
    migrations: [...session.migrations],
    readHandlers: [...session.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
}
