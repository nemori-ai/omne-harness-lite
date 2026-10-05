// 公开集成与资源责任见 SPEC.md；未迁业务继续消费精确治理入口规格及其传输绑定。
// 布局常量（结构规则按它写）：src/ops/**（运维面）、src/transport/**（客户端面）、
// src/json.ts（严格 JSON 解析器）、src/routing/**（路由表与判定次序）、src/center-id/**（中心标识）。
// apps/tenancy-host 装配管理绑定、迁移及资源服务；独立消费者调用同一工厂。
export {
  GovernanceCenterClockTimeoutError,
  GovernanceCenterEntryConfigSchema,
  type GovernanceCenterEntryConfig,
} from './entry-config.ts'
export { GovernanceCenterOpsConfigSchema, type GovernanceCenterOpsConfig } from './ops/config.ts'
export { createGovernanceCenterEntry } from './entry.ts'
export { createGovernanceCenterOps } from './ops/entry.ts'
export {
  GovernanceCenterWorkStopped,
  type GovernanceCenterWork,
  type GovernanceCenterLogger,
} from './work.ts'
export type { GovernanceCenterEntryDependencies, EntryNotifications } from './entry-dependencies.ts'
export type { GovernanceCenterOpsDependencies, OpsNotifications } from './ops/dependencies.ts'
export type { DeploymentKeyLoad, DeploymentParameters } from './ops/health.ts'
export { OPS_SOCKET_NAME, OpsSocketError, type OpsSocketFailure } from './ops/socket.ts'
export { RECEIVE_LIMITS, type ReceiveLimits } from './ops/limits.ts'
export { createOfflineMaintenance } from './maintenance/assembly.ts'
export type { OfflineMaintenanceOptions } from './maintenance/maintenance-options.ts'
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
export { GOVERNANCE_CENTER_TABLE } from './center-id/table.ts'

export type { EntryServices } from './service-faces.ts'
