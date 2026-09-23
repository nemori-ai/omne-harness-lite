// clock 服务。设计：.meta_harness/design/realization/packages/infra/clock/。
export {
  LeaseClock,
  ClockRollbackDetected,
  isRolledBack,
  systemTimeSources,
  type TimeSources,
  type LeaseClockOptions,
  type ClockLogger,
} from './clock.ts'
export {
  clockLeaseMigration,
  clockMigrations,
  LEASE_WIDTH_MS,
  RENEW_PERIOD_MS,
  CLOCK_LEASE_TABLE,
  type ClockLeaseTable,
} from './lease.ts'
export { clockPreflight, CLOCK_PREFLIGHT_CHECK } from './preflight.ts'
export { clockPlugin, ClockConfig, CLOCK_SERVICE } from './plugin.ts'
