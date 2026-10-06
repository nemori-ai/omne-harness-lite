// 纯公开面与正式 Cordis 绑定分开。
export { LeaseClock, type LeaseClockOptions } from './clock.ts'
export {
  ClockRollbackDetected,
  isRolledBack,
  systemTimeSources,
  LEASE_WIDTH_MS,
  RENEW_PERIOD_MS,
  type TimeSources,
  type ClockLogger,
} from './lease-policy.ts'
export {
  clockLeaseMigration,
  clockMigrations,
  CLOCK_LEASE_TABLE,
  type ClockLeaseTable,
} from './lease.ts'
export { clockPreflight, CLOCK_PREFLIGHT_CHECK } from './preflight.ts'
export { ClockConfig } from './config.ts'
export { clockSnapshotCheck, CLOCK_SNAPSHOT_TABLES } from './snapshot.ts'
