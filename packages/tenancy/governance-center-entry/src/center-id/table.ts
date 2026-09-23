// 治理中心标识那一格：表、行形状、值类型（入口契约 S-27、S-28；入口节点 design「中心标识：迁移片段与读或铸」）。
// 本包只碰这一张表（节点约束第 4 条，结构规则 single-table-entry）。

export const GOVERNANCE_CENTER_TABLE = 'governance_center'

/** 那一格所在的行：本包只写这一个 `slot` 值。 */
export const CENTER_SLOT = 'center'

/** `center_id` 为 NULL 即「未铸」。 */
export interface GovernanceCenterTable {
  readonly governance_center: {
    readonly slot: string
    readonly center_id: string | null
  }
}

declare const governanceCenterIdBrand: unique symbol

/** S-27：128 位随机值的规范形式，恰为 32 个小写十六进制字符；相等即逐字符相等。 */
export type GovernanceCenterId = string & { readonly [governanceCenterIdBrand]: true }

const CANONICAL = /^[0-9a-f]{32}$/

export function isGovernanceCenterId(value: unknown): value is GovernanceCenterId {
  return typeof value === 'string' && CANONICAL.test(value)
}
