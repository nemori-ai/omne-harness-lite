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

export type Admission =
  | { readonly kind: 'admitted' }
  | { readonly kind: 'dropped'; readonly reason: DropReason }

export type TelemetryDefinition =
  | EventDefinition<FieldSchema>
  | MetricDefinition<LabelSchema>
  | SegmentDefinition

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
    options?: Readonly<{ links?: readonly Carrier[]; onRelease?: () => void }>,
  ): Segment | Extract<Admission, { kind: 'dropped' }>
  bind(patch: Partial<Pick<Binding, 'work' | 'attempt' | 'call' | 'adopted' | 'links'>>): Emitter
}

export interface TelemetryPort {
  bind(binding: Binding): Emitter
  discard(
    definition: TelemetryDefinition,
    reason: DiscardReason,
  ): Extract<Admission, { kind: 'dropped' }>
}

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

export type CloseDropReason = DropReason | 'output'

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
