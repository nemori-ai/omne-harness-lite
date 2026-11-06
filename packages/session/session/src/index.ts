// The root entry of the Cordis-free Session implementation (docs/public-api.md). The member reads
// every outside capability from the factory parameters and imports no Cordis.
export type { BeforeAdmitSlot, Current, SessionDependencies } from './dependencies.ts'
export {
  defaultSchedulingPolicy,
  type SchedulingPolicy,
  type SessionConfiguration,
} from './policy.ts'
export {
  createSessionInstance,
  type MaintenanceHandle,
  type SessionInstance,
  type SessionInstanceOptions,
} from './instance.ts'
export type {
  SessionMeasure,
  SessionMeasureEvent,
  SessionRoundCompleteEvent,
  SessionSegmentEvent,
  TenantId,
} from './measure.ts'
export type { SessionDiagnose, SessionDiagnostic } from './diagnostics.ts'
export {
  createSessionTelemetry,
  sessionDiagnosticEvent,
  sessionRoundCompleteEvent,
  type SessionTelemetry,
  type SessionTelemetryBase,
} from './telemetry.ts'
