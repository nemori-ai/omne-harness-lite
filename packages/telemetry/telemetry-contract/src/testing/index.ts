// The bounded capturing double of the telemetry port, for tests of the emitting domains. It does
// not import Cordis.
import {
  DISCARD_REASONS,
  TELEMETRY_LIMITS,
  decodeCarrier,
  encodeCarrier,
  validateBinding,
  validateFields,
  type Admission,
  type Binding,
  type Carrier,
  type Emitter,
  type EventDefinition,
  type FieldSchema,
  type LabelSchema,
  type MetricDefinition,
  type Segment,
  type SegmentDefinition,
  type TelemetryPort,
} from '../index.ts'
import { dataMembers } from '../limits.ts'

type CapturedValues = Readonly<Record<string, string | number | boolean>>
type SegmentOutcome = 'ok' | 'failure' | 'unknown'

/** One admitted record, with the snapshot of the binding that it was made under. */
export type CapturedRecord =
  | Readonly<{
      kind: 'event'
      binding: Binding
      definition: EventDefinition<FieldSchema>
      fields: CapturedValues
    }>
  | Readonly<{
      kind: 'metric'
      binding: Binding
      definition: MetricDefinition<LabelSchema>
      value: number
      labels: CapturedValues
    }>
  | Readonly<{
      kind: 'segment-start'
      binding: Binding
      definition: SegmentDefinition
      segment: Carrier
      links: readonly Carrier[]
    }>
  | Readonly<{
      kind: 'segment-event'
      binding: Binding
      definition: EventDefinition<FieldSchema>
      segment: Carrier
      fields: CapturedValues
    }>
  | Readonly<{
      kind: 'segment-end'
      binding: Binding
      definition: SegmentDefinition
      segment: Carrier
      outcome: SegmentOutcome
    }>

type Dropped = Extract<Admission, { kind: 'dropped' }>
type CapturingPlace = { onRelease: (() => void) | undefined; released: boolean }

const DEFAULT_CAPACITY = 1024
const ADMITTED: Admission = Object.freeze({ kind: 'admitted' })
const PATCH_KEYS = ['work', 'attempt', 'call', 'adopted', 'links'] as const
const OUTCOMES: readonly unknown[] = ['ok', 'failure', 'unknown']
const SIGNALS: readonly unknown[] = ['event', 'metric', 'segment']
const DISCARDABLE: readonly unknown[] = DISCARD_REASONS
// A list longer than any binding limit is not copied: validation rejects it as it is.
const COPY_LIMIT = Math.max(TELEMETRY_LIMITS.maxLinks, TELEMETRY_LIMITS.maxAdopted)

function signalOf(definition: unknown): unknown {
  const read = dataMembers(definition)
  return read.kind === 'members' ? read.members.get('signal') : undefined
}

function hasSignal(definition: unknown, signal: string): boolean {
  return signalOf(definition) === signal
}

/** A frozen copy of plain data, so that later changes by the caller do not reach a record. */
function copyData(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length > COPY_LIMIT ? value : Object.freeze(value.map(copyData))
  const read = dataMembers(value)
  if (read.kind !== 'members') return value
  return Object.freeze(
    Object.fromEntries([...read.members].map(([key, item]) => [key, copyData(item)])),
  )
}

/** A frozen, validated copy of a binding, or undefined when the binding is not valid. */
function snapshot(input: unknown): Binding | undefined {
  try {
    const read = dataMembers(input)
    if (read.kind !== 'members') return undefined
    // The scope keeps its identity: legal-identity recognizes the minted object, not a copy.
    const copy = Object.freeze(
      Object.fromEntries(
        [...read.members].map(([key, value]) => [key, key === 'scope' ? value : copyData(value)]),
      ),
    )
    // Validation reads the copy, so what was checked is what is kept.
    const binding = copy as Binding
    return validateBinding(binding).kind === 'ok' ? binding : undefined
  } catch {
    return undefined
  }
}

function patched(binding: Binding, patch: unknown): Binding | undefined {
  const read = dataMembers(patch)
  if (read.kind !== 'members') return undefined
  const next: Record<string, unknown> = { ...binding }
  for (const key of PATCH_KEYS) {
    const value = read.members.get(key)
    if (value !== undefined) next[key] = value
  }
  return snapshot(next)
}

function copyValues(values: unknown): CapturedValues {
  const read = dataMembers(values)
  if (read.kind !== 'members') return Object.freeze({})
  // validateFields admitted these values: string keys with string, number or boolean values.
  return Object.freeze(Object.fromEntries(read.members)) as CapturedValues
}

/**
 * Creates a capturing double of the telemetry port. It admits records in call order up to
 * `capacity` (default 1024) and drops the rest with `capacity`. It checks bindings with
 * `validateBinding` and fields with `validateFields`: an invalid record is dropped with `invalid`
 * and is not captured. `dropped()` counts every dropped record, including each `discard`. No
 * operation throws. Throws TypeError for a capacity that is not a positive integer.
 */
export function createCapturingTelemetry(options: Readonly<{ capacity?: number }> = {}): {
  readonly port: TelemetryPort
  records(): readonly CapturedRecord[]
  dropped(): number
  clear(): void
} {
  const capacity = options.capacity ?? DEFAULT_CAPACITY
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new TypeError('capturing telemetry: capacity is a positive integer')
  let records: CapturedRecord[] = []
  let dropped = 0
  let segments = 0
  const places = new Set<CapturingPlace>()

  function drop(reason: Dropped['reason']): Dropped {
    dropped += 1
    return Object.freeze({ kind: 'dropped', reason })
  }

  function admit(record: CapturedRecord): Admission {
    if (records.length >= capacity) return drop('capacity')
    records.push(Object.freeze(record))
    return ADMITTED
  }

  /** Runs one operation; an input that throws while it is read is dropped as invalid. */
  function guarded<T>(operation: () => T | Dropped): T | Dropped {
    try {
      return operation()
    } catch {
      return drop('invalid')
    }
  }

  function nextCarrier(): Carrier {
    segments += 1
    return encodeCarrier({
      traceId: segments.toString(16).padStart(32, '0'),
      spanId: segments.toString(16).padStart(16, '0'),
      sampled: true,
    })
  }

  function linksOf(links: unknown): readonly Carrier[] | undefined {
    if (links === undefined) return Object.freeze([])
    if (!Array.isArray(links) || links.length > TELEMETRY_LIMITS.maxLinks) return undefined
    const decoded: Carrier[] = []
    for (const link of links) {
      const result = decodeCarrier(link)
      if (result.kind === 'invalid') return undefined
      decoded.push(result.carrier)
    }
    return Object.freeze(decoded)
  }

  function segmentOptions(options: unknown): Parameters<Emitter['startSegment']>[1] {
    if (options === undefined) return {}
    const read = dataMembers(options)
    if (read.kind !== 'members') return undefined
    const links = linksOf(read.members.get('links'))
    const onRelease = read.members.get('onRelease')
    if (links === undefined || (onRelease !== undefined && typeof onRelease !== 'function'))
      return undefined
    return {
      links,
      ...(onRelease === undefined
        ? {}
        : {
            onRelease: () => {
              onRelease()
            },
          }),
    }
  }

  function release(place: CapturingPlace): void {
    if (!places.delete(place)) return
    place.released = true
    const notify = place.onRelease
    place.onRelease = undefined
    try {
      notify?.()
    } catch {
      // Release is complete even when its observer fails.
    }
  }

  function startedSegment(
    binding: Binding,
    definition: SegmentDefinition,
    carrier: Carrier,
    place: CapturingPlace,
  ): Segment {
    let ended: Admission | undefined
    return Object.freeze({
      carrier,
      event(event: EventDefinition<FieldSchema>, fields: unknown): Admission {
        return guarded(() => {
          if (ended !== undefined || place.released) return drop('closed')
          if (!hasSignal(event, 'event') || validateFields(event, fields).kind !== 'ok')
            return drop('invalid')
          return admit({
            kind: 'segment-event',
            binding,
            definition: event,
            segment: carrier,
            fields: copyValues(fields),
          })
        })
      },
      end(outcome: unknown = 'unknown'): Admission {
        return guarded(() => {
          if (ended !== undefined) return ended
          if (!OUTCOMES.includes(outcome)) return drop('invalid')
          if (place.released) {
            ended = drop('closed')
            return ended
          }
          release(place)
          ended = admit({
            kind: 'segment-end',
            binding,
            definition,
            segment: carrier,
            // OUTCOMES holds exactly the three outcomes.
            outcome: outcome as SegmentOutcome,
          })
          return ended
        })
      },
    })
  }

  function emitter(binding: Binding | undefined): Emitter {
    return Object.freeze({
      event(definition: EventDefinition<FieldSchema>, fields: unknown): Admission {
        return guarded(() => {
          if (binding === undefined || !hasSignal(definition, 'event')) return drop('invalid')
          if (validateFields(definition, fields).kind !== 'ok') return drop('invalid')
          return admit({ kind: 'event', binding, definition, fields: copyValues(fields) })
        })
      },
      record(
        definition: MetricDefinition<LabelSchema>,
        value: unknown,
        labels: unknown,
      ): Admission {
        return guarded(() => {
          if (binding === undefined || !hasSignal(definition, 'metric')) return drop('invalid')
          if (typeof value !== 'number' || !Number.isFinite(value)) return drop('invalid')
          if (definition.aggregation.kind === 'counter' && value < 0) return drop('invalid')
          if (validateFields(definition, labels).kind !== 'ok') return drop('invalid')
          return admit({ kind: 'metric', binding, definition, value, labels: copyValues(labels) })
        })
      },
      startSegment(definition: SegmentDefinition, options?: unknown): Segment | Dropped {
        return guarded(() => {
          if (binding === undefined || !hasSignal(definition, 'segment')) return drop('invalid')
          const checkedOptions = segmentOptions(options)
          if (checkedOptions === undefined) return drop('invalid')
          const carrier = nextCarrier()
          const admission = admit({
            kind: 'segment-start',
            binding,
            definition,
            segment: carrier,
            links: checkedOptions.links ?? [],
          })
          if (admission.kind === 'dropped') return admission
          const place = { onRelease: checkedOptions.onRelease, released: false }
          places.add(place)
          return startedSegment(binding, definition, carrier, place)
        })
      },
      bind(patch: unknown): Emitter {
        try {
          return emitter(binding === undefined ? undefined : patched(binding, patch))
        } catch {
          return emitter(undefined)
        }
      },
    })
  }

  /** A record the caller could not form: counted under its reason; nothing is captured. */
  function discard(definition: unknown, reason: unknown): Dropped {
    return guarded(() => {
      if (!SIGNALS.includes(signalOf(definition)) || !DISCARDABLE.includes(reason))
        return drop('invalid')
      // DISCARDABLE holds exactly the discard reasons.
      return drop(reason as Dropped['reason'])
    })
  }

  return Object.freeze({
    port: Object.freeze({ bind: (binding: Binding) => emitter(snapshot(binding)), discard }),
    records: () => Object.freeze([...records]),
    dropped: () => dropped,
    clear: () => {
      for (const place of places) release(place)
      records = []
      dropped = 0
    },
  })
}
