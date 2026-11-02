// `identity` 行（DP-3 决策记录第 6 条、R1-D27）：包装 identity 持久提供者的插件 `IdentitySqlPlugin`。
// 没有关闭阶段。它 inject 受信名 `storage`（受信存储子树）与根上的 `identityClock` 入口对象，
// 提供 `identityOperations` 与 `tenantStanding`。配置是两个 `PT<秒>S` 时长，由成员插件自己校验。
// 清单比 `src/s0/stubs.ts` 的同一行多 inject `identityClock`：装配页的 AAP-8 替代路径补丁尚未登记（R1-D27）。
import {
  identityClockKey,
  identityOperationsKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export const identityRow = defineRow({
  row: 'identity',
  implementation: 'real',
  manifest: {
    provides: [identityOperationsKey, tenantStandingKey],
    injects: [storageKey, identityClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: IdentitySqlPlugin,
})
