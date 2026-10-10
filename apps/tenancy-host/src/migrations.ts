// 迁移的合成（design「存储装配：迁移由 owner 导出片段、本节点合成」）与数据格式核对（「升级的整体性」只读核对第 1 行）。
// 本节点不改任何片段的内容；只定次序、给出跨 owner 那条外键的目标与名字。
import {
  ACCOUNT_ID_COLUMN,
  ACCOUNT_TABLE,
  accountIdentityMigrations,
} from '@omne-harness-lite/account-identity-sql'
import { clockMigrations } from '@omne-harness-lite/clock-lease'
import { governanceCenterMigrations } from '@omne-harness-lite/governance-center-entry-node'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance-sql'
import {
  type MigrationFragment,
  type PreflightCheck,
  composedMigrationName,
} from '@omne-harness-lite/storage'

/** AI R-7 ⇔ OG R-6 那一条外键的名字：`organization.owner_account → account(account_id)`，ON DELETE RESTRICT、不延迟。 */
export const ORGANIZATION_OWNER_ACCOUNT_FK = 'organization_owner_account_fk'

const organizationMigrations = organizationGovernanceMigrations({
  ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
  ownerAccountForeignKey: ORGANIZATION_OWNER_ACCOUNT_FK,
})

/**
 * 合成次序（M-9：编号名一经发布不改、不重排，新片段只追加在末尾）：
 * AI 在前（外键目标先存在）→ OG 工厂（外键目标与名字由本节点给，目标取 AI 导出的常量）→ clock → 入口层。
 */
export const hostMigrationFragments: readonly MigrationFragment[] = Object.freeze([
  // The first six organization fragments precede clock in the published global prefix.
  ...accountIdentityMigrations.slice(0, 1),
  ...organizationMigrations.slice(0, 6),
  ...clockMigrations,
  ...governanceCenterMigrations,
  ...accountIdentityMigrations.slice(1),
  ...organizationMigrations.slice(6),
])

/** 一组片段合成后的迁移名序列（与 `composeMigrations` 同一编号规则）。 */
export function composedMigrationNames(fragments: readonly MigrationFragment[]): readonly string[] {
  return Object.freeze(
    fragments.map((fragment, index) => composedMigrationName(index + 1, fragment)),
  )
}

export const DATA_FORMAT_CHECK = 'data-format'

/**
 * 数据格式能否接手：库里登记的迁移名序列（空库为空序列）必须是本次合成序列的**前缀**。
 * 登记了本版本不认识的名字、或次序不同 ⇒ 这份数据来自更新的或别的版本 ⇒ 不过，并写出第一个对不上的迁移名。
 * 只看提供者在同一读事务里读好的 `appliedMigrations`；「登记被清空而数据还在」不归这一条，归入口层的中心标识表核对。
 */
export function dataFormatPreflight(known: readonly string[]): PreflightCheck {
  return async ({ appliedMigrations }) => {
    for (const [index, applied] of appliedMigrations.entries()) {
      const expected = known[index]
      if (applied !== expected)
        return {
          ok: false,
          check: DATA_FORMAT_CHECK,
          detail: `this version cannot take over the stored data format: registered migration #${String(index + 1)} is "${applied}", this version ${expected === undefined ? 'knows no further migration' : `expects "${expected}"`}`,
        }
    }
    return { ok: true }
  }
}
