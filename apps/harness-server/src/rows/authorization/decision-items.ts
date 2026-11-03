// The D items of the policy draft §7: cells that need a new product rule. Each writes which rule
// is missing and that the cell denies until the rule exists. The adapter never reads them; they
// are the account of why a `deny-pending` cell is a denial. None is open now.
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

/**
 * No D item is open: R2-D204 (P-1) closed D-1 and D-2 by making `setRelation` and
 * `configureAutoArchive` member cells for the login principal. The mechanism stays so that a cell
 * waiting for a product rule can be written again with its item.
 */
export const DECISION_ITEMS: Readonly<Partial<Record<DecisionItemId, DecisionItem>>> =
  Object.freeze({})
