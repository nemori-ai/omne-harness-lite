// 治理中心入口层：兑现 composition.governance-center-entry v1，落在传输绑定 composition.governance-center-entry-https-json v1 上。
// 设计：.meta_harness/design/realization/packages/tenancy/governance-center-entry/。
// 布局常量（结构规则按它写）：src/ops/**（运维面）、src/events.ts（事件声明）、src/transport/**（客户端面）、
// src/json.ts（严格 JSON 解析器）、src/routing/**（路由表与判定次序）、src/center-id/**（中心标识）。
// 消费者：apps/tenancy-host（装两个插件、合迁移片段、把核对放进 upgrade.checks、构造 openSignal、等 serving）。
export {
  GovernanceCenterClockTimeoutError,
  governanceCenterEntryPlugin,
  GovernanceCenterEntryConfigSchema,
  type GovernanceCenterEntryConfig,
} from './plugin.ts'
export {
  governanceCenterOpsPlugin,
  GovernanceCenterOpsConfigSchema,
  type GovernanceCenterOpsConfig,
} from './ops/plugin.ts'
export type { DeploymentKeyLoad, DeploymentParameters } from './ops/health.ts'
export { OPS_SOCKET_NAME, OpsSocketError, type OpsSocketFailure } from './ops/socket.ts'
export { RECEIVE_LIMITS, type ReceiveLimits } from './ops/limits.ts'
export { createOfflineMaintenance, type OfflineMaintenanceOptions } from './maintenance/offline.ts'
export { validMaintenanceLocation } from './maintenance/inputs.ts'
export {
  failureResult as maintenanceFailureResult,
  type MaintenanceResult,
} from './maintenance/results.ts'
export { readOpsReplyBody } from './ops/maintenance-wire.ts'
export {
  governanceCenterSnapshotCheck,
  readSnapshotCenterId,
  CENTER_SNAPSHOT_TABLES,
} from './center-id/snapshot.ts'
export type { ServingNotice } from './ops/notice.ts'
export {
  serving as SERVING_EVENT,
  stopped as STOPPED_EVENT,
  defect as DEFECT_EVENT,
  listening as LISTENING_EVENT,
} from './events.ts'
export { TLS_HANDSHAKE_TIMEOUT_MS, TlsMaterialError } from './transport/client-face.ts'
export { governanceCenterMigrations } from './center-id/migrations.ts'
export {
  governanceCenterPreflight,
  GOVERNANCE_CENTER_PREFLIGHT_CHECK,
} from './center-id/preflight.ts'
export {
  GovernanceCenterIdentityError,
  type GovernanceCenterIdentityFailure,
} from './center-id/read-or-mint.ts'
export {
  GOVERNANCE_CENTER_TABLE,
  type GovernanceCenterId,
  isGovernanceCenterId,
} from './center-id/table.ts'
export {
  ACCEPTED_PROTOCOL_VERSIONS,
  PUBLIC_HEALTH_ROUTE,
  ROUTE_IDS,
  type RouteId,
} from './routing/route-ids.ts'
