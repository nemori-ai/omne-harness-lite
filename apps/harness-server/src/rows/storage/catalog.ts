// 本构建的材料目录（sql-contract §4.2，装配页「租户到事务域的目录 · 组合登记」）：应用在构建时静态导入各拥有者的材料，
// 合成一个目录交给 `storageHost`。波 1 有会话存储与 identity 持久提供者两份材料；Model 与 Tool 的耐久记录仓材料由各自的线加进来。
// 目录不声明组合：组合由 `session-storage` 行与 `identity` 行各自显式登记（`registerCombination`），提供者打开事务域时不自动登记。
import { identitySqlMaterials } from '@omne-harness/identity-sql'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'

/** 读一次材料文件，返回带摘要的目录。 */
export function storageCatalog(): SqlMaterialCatalog {
  const owners = [sessionStorageMaterials(), identitySqlMaterials()]
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: owners.flatMap(owner => owner.participants),
    migrations: owners.flatMap(owner => owner.migrations),
    readHandlers: owners.flatMap(owner => owner.readHandlers),
    declaredCombinations: { tenant: null, system: null },
  }
}
