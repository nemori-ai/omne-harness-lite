// clock 服务。设计：.meta_harness/design/realization/packages/infra/clock/。
export {
  LeaseClock,
  ClockRollbackDetected,
  systemTimeSources,
  type TimeSources,
  type LeaseClockOptions,
} from './clock.ts'
export {
  clockLeaseMigration,
  LEASE_WIDTH_MS,
  RENEW_PERIOD_MS,
  CLOCK_LEASE_TABLE,
  type ClockLeaseTable,
} from './lease.ts'
export { clockPlugin, ClockConfig, CLOCK_SERVICE } from './plugin.ts'
