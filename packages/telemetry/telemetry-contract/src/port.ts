import type { Binding } from './binding.ts'
import type { Carrier } from './carrier.ts'
import type {
  EventDefinition,
  FieldSchema,
  Fields,
  LabelSchema,
  MetricDefinition,
  SegmentDefinition,
} from './definitions.ts'

export type DropReason =
  | 'disabled'
  | 'sampled'
  | 'invalid'
  | 'policy'
  | 'capacity'
  | 'expired'
  | 'closed'

/** The local admission of one record. `admitted` is not a delivery receipt. */
export type Admission =
  | { readonly kind: 'admitted' }
  | { readonly kind: 'dropped'; readonly reason: DropReason }

export interface Segment {
  readonly carrier: Carrier
  event<S extends FieldSchema>(
    definition: EventDefinition<S>,
    fields: NoInfer<Fields<S>>,
  ): Admission
  /** Idempotent. The outcome is the outcome of the measured span, not a business result. */
  end(outcome?: 'ok' | 'failure' | 'unknown'): Admission
}

export interface Emitter {
  event<S extends FieldSchema>(
    definition: EventDefinition<S>,
    fields: NoInfer<Fields<S>>,
  ): Admission
  record<S extends LabelSchema>(
    definition: MetricDefinition<S>,
    value: number,
    labels: NoInfer<Fields<S>>,
  ): Admission
  startSegment(
    definition: SegmentDefinition,
    options?: Readonly<{ links?: readonly Carrier[] }>,
  ): Segment | Extract<Admission, { kind: 'dropped' }>
  /** Derives an emitter with a changed correlation. The original emitter does not change. */
  bind(patch: Partial<Pick<Binding, 'work' | 'attempt' | 'call' | 'adopted' | 'links'>>): Emitter
}

/** The telemetry port. Slice 1 exposes `bind` only; `health()` comes with slice 2. */
export interface TelemetryPort {
  bind(binding: Binding): Emitter
}

/** Tells a started segment from the dropped answer of `startSegment`. */
export function isSegment(value: unknown): value is Segment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'carrier' in value &&
    typeof value.carrier === 'string' &&
    'event' in value &&
    typeof value.event === 'function' &&
    'end' in value &&
    typeof value.end === 'function'
  )
}

/**
 * What a provider reports when it closes. Four confirmation boundaries are distinct: the return
 * of a flush, the callback of a local write function, the acknowledgement of a collector
 * protocol, and the record being queryable in a back end. `flush` and `boundary` name the
 * strongest one that the provider saw; nothing in this report claims a later one.
 */
export type CloseReport = Readonly<{
  generation: string
  admission: 'closed'
  admitted: number
  dropped: number
  droppedBy: Readonly<Partial<Record<DropReason, number>>>
  pending: number
  flush: 'completed-to-boundary' | 'failed' | 'deadline' | 'unconfirmed'
  boundary: 'local-sink' | 'collector' | 'none'
  transport: 'closed' | 'failed' | 'unconfirmed'
}>
