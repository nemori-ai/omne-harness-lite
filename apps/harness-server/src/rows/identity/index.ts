// `identity` 行（DP-3 决策记录第 6 条、R1-D27）：包装 identity 持久提供者的插件 `IdentitySqlPlugin`。
// 没有关闭阶段。它 inject 受信名 `storage`（受信存储子树）与根上的 `identityClock` 入口对象，
// 提供 `identityOperations`、`tenantStanding` 与 `identityGovernance`（ID-18，K9）。三项出自同一个提供者
// 实例、同一份 identity-sql 记录，所以治理端口的撤销与切换对 `recognizeLogin` 生效。
// `tenantStanding` 与 `identityGovernance` 是受信名（R2-D203 P-9），本行在受信作用域里提供它们。
// 配置是两个登录时长与两个邀请时长（`PT<秒>S`），由成员插件自己校验。
import {
  identityClockKey,
  identityGovernanceKey,
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
    provides: [identityOperationsKey, tenantStandingKey, identityGovernanceKey],
    injects: [storageKey, identityClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: IdentitySqlPlugin,
})
