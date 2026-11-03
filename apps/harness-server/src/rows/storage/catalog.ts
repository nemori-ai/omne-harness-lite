// 本构建的材料目录（sql-contract §4.2，装配页「租户到事务域的目录 · 组合登记」）：应用在构建时静态导入各拥有者的材料，
// 合成一个目录交给 `storageHost`。波 1 有会话存储与 identity 持久提供者两份材料；波 2 并入 Model 耐久记录仓的材料
// （R2-D6，`model` 参加者与会话日志同一事务域）；Tool 的耐久记录仓材料由 L-TOOL 加进来。
// 目录不声明组合：组合由 `session-storage` 行与 `identity` 行各自显式登记（`registerCombination`），提供者打开事务域时不自动登记。
import { identitySqlMaterials } from '@omne-harness/identity-sql'
import { modelStorageMaterials } from '@omne-harness/model-storage-sql'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'

/**
 * 发行层写明的会话读口输出上限：20 MiB（qiwei.pan 2026-11-03）。session-storage-sql 没有默认值，由本构建显式传入。
 * 装配要让 `storage` 行的 `maxReadResultBytes` 不小于它，`globalReadResultBytes` 不小于同时在途读数乘它
 * （sqlite-provider 规格 §12.1）。它还不在 `serve.distribution.json` 里：配置通道由 Reduce B3 承接（R2-D89，R2-D81 后续）。
 */
export const DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES = 20971520

/** 读一次材料文件，返回带摘要的目录。 */
export function storageCatalog(): SqlMaterialCatalog {
  const owners = [
    sessionStorageMaterials({
      readOutputLimitBytes: DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES,
    }),
    identitySqlMaterials(),
    modelStorageMaterials(),
  ]
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: owners.flatMap(owner => owner.participants),
    migrations: owners.flatMap(owner => owner.migrations),
    readHandlers: owners.flatMap(owner => owner.readHandlers),
    declaredCombinations: { tenant: null, system: null },
  }
}
