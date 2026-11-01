// The pure part of the `authorization` row (DP-4): the Session and Agent policy tables, the
// maintenance grant table with its read port, the cell resolution for branched operations, and
// the audit. No plugin, no service key, no dependency on the assembly. The plugin that wires the
// two access checks onto these tables is APP-6b.
export {
  cite,
  resolveCell,
  type Branch,
  type BranchInput,
  type Citation,
  type DecisionItemId,
  type DenyCell,
  type MatrixCell,
  type MemberCell,
  type PendingCell,
  type PolicyCell,
  type PolicyRow,
  type PrincipalColumn,
  type ReceivedFactKind,
  type ResolvedCell,
  type RoutedKind,
  type SystemPurpose,
} from './cells.ts'
export { SESSION_POLICY } from './session-policy.ts'
export { AGENT_POLICY } from './agent-policy.ts'
export { DECISION_ITEMS, PENDING_LABEL, type DecisionItem } from './decision-items.ts'
export {
  AGENT_HOST_COMPONENT,
  MAINTENANCE_GRANTS,
  MAINTENANCE_GRANT_REVISION,
  TOOL_RESIDENCY_COMPONENT,
  releaseMaintenanceGrants,
  type GrantHolder,
  type ReleaseGrant,
} from './grants.ts'
export {
  COLUMNS,
  auditPolicy,
  holderProjection,
  type PolicyAudit,
  type PolicyTable,
  type PolicyTables,
  type ProjectedCell,
  type TableAudit,
} from './audit.ts'
