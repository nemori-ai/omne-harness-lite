// The Node provider of engineering telemetry, slice 1. This entry does not import Cordis; the
// plugins and the Cordis log bridge are at `./cordis`.
export { createDisabledTelemetry } from './disabled.ts'
export type {
  TelemetryBudgets,
  TelemetryClock,
  TelemetryOutlet,
  TelemetryRuntimeOptions,
} from './options.ts'
export type { LogLevel, LogRecordInput, RecordScope, TelemetryRecord } from './record.ts'
export { createTelemetryRuntime, type TelemetryRuntime } from './runtime.ts'
export {
  summarizeTelemetry,
  type DurationStats,
  type EventSummary,
  type SegmentSummary,
  type SummaryFilter,
  type TelemetrySummary,
} from './summary.ts'
