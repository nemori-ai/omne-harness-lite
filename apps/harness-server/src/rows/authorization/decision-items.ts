// The D items of the policy draft §7: cells that need a new product rule. Each writes which rule
// is missing and that the cell denies until the rule exists. The adapter never reads them; they
// are the account of why a `deny-pending` cell is a denial.
import type { SessionAccessOperation } from '@omne-harness/session-contract'
import type { DecisionItemId, PrincipalColumn } from './cells.ts'

/** The text a rendered table shows for a `deny-pending` cell. */
export const PENDING_LABEL = '默认拒绝，D 项待产品裁定'

export type DecisionItem = Readonly<{
  id: DecisionItemId
  table: 'session'
  operation: SessionAccessOperation
  column: PrincipalColumn
  /** The product rule that is missing, in the words of the policy draft §7. */
  missingRule: string
  defaultVerdict: 'denied'
  label: typeof PENDING_LABEL
}>

function item(
  id: DecisionItemId,
  operation: SessionAccessOperation,
  column: PrincipalColumn,
  missingRule: string,
): DecisionItem {
  return Object.freeze({
    id,
    table: 'session',
    operation,
    column,
    missingRule,
    defaultVerdict: 'denied',
    label: PENDING_LABEL,
  })
}

export const DECISION_ITEMS: Readonly<Record<DecisionItemId, DecisionItem>> = Object.freeze({
  'D-1': item(
    'D-1',
    'configureAutoArchive',
    'login',
    '谁持有「租户设置资格」。SW:187 写「修改须具相应租户设置资格」，SS:611 只写资格名。ID-16 的具名资格只有组织成本账目读取。默认团队方案（IA:39、41）没有写普通成员能否修改本租户的设置。',
  ),
  'D-2': item(
    'D-2',
    'setRelation',
    'login',
    '两条。第一，谁持有「会话管理资格」，可以把自己的主会话标记常驻（SW:187）。第二，建立子会话与 handoff 关系的授权由谁定义。SW:175 写「派发与通信的授权及可靠投递归相应业务」，SS:610 只写「关系依据」，相应业务的授权规则还没有正文。',
  ),
})
