// The pure telemetry contract. This package does not import Cordis, a Node built-in or an SDK; the
// Cordis service definition is the member `@omne-harness/telemetry-cordis-contract` and the
// capturing double is at `./testing`.
export { validateBinding, type Binding, type OwnedRef, type TelemetryScope } from './binding.ts'
export { decodeCarrier, encodeCarrier, type Carrier } from './carrier.ts'
export {
  defineEvent,
  defineMetric,
  defineSegment,
  type EventDefinition,
  type FieldRule,
  type FieldSchema,
  type Fields,
  type LabelRule,
  type LabelSchema,
  type MetricDefinition,
  type SegmentDefinition,
} from './definitions.ts'
export { validateFields } from './fields.ts'
export { TELEMETRY_LIMITS, type ValidationResult } from './limits.ts'
export {
  DISCARD_REASONS,
  isSegment,
  type Admission,
  type CloseDropReason,
  type CloseReport,
  type DiscardReason,
  type DropReason,
  type Emitter,
  type Segment,
  type TelemetryDefinition,
  type TelemetryPort,
} from './port.ts'
