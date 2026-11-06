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

/** Any of the three definitions. */
export type TelemetryDefinition =
  | EventDefinition<FieldSchema>
  | MetricDefinition<LabelSchema>
  | SegmentDefinition

/**
 * The reasons a caller may give for a record it could not form. The other reasons are facts of the
 * provider, which a caller cannot claim.
 */
export type DiscardReason = Extract<DropReason, 'invalid' | 'policy' | 'capacity'>

export const DISCARD_REASONS: readonly DiscardReason[] = Object.freeze([
  'invalid',
  'policy',
  'capacity',
])

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

/** The telemetry port. Slice 1 exposes `bind` and `discard`; `health()` comes with slice 2. */
export interface TelemetryPort {
  bind(binding: Binding): Emitter
  /**
   * Registers one record that the caller could not form, so that the provider counts it as dropped
   * with `reason` (TC-4: a fact of tenant work without a tenant). `definition` names the record
   * that was not formed. Nothing is written.
   */
  discard(
    definition: TelemetryDefinition,
    reason: DiscardReason,
  ): Extract<Admission, { kind: 'dropped' }>
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
 * The keys of `CloseReport.droppedBy`: every `DropReason`, and `output` for a record that was
 * admitted and then failed at the outlet. `output` is a fact of the close report only; it is never
 * the reason of an `Admission`.
 */
export type CloseDropReason = DropReason | 'output'

/**
 * What a provider reports when it closes. `dropped` is the sum of the members of `droppedBy`.
 * Four confirmation boundaries are distinct: the return of a flush, the callback of a local write
 * function, the acknowledgement of a collector protocol, and the record being queryable in a back
 * end. `flush` and `boundary` name the strongest one that the provider saw; nothing in this
 * report claims a later one.
 */
export type CloseReport = Readonly<{
  generation: string
  admission: 'closed'
  admitted: number
  dropped: number
  droppedBy: Readonly<Partial<Record<CloseDropReason, number>>>
  pending: number
  flush: 'completed-to-boundary' | 'failed' | 'deadline' | 'unconfirmed'
  boundary: 'local-sink' | 'collector' | 'none'
  transport: 'closed' | 'failed' | 'unconfirmed'
}>
