import {
  DISCARD_REASONS,
  TELEMETRY_LIMITS,
  decodeCarrier,
  defineEvent,
  defineMetric,
  defineSegment,
  encodeCarrier,
  validateBinding,
  validateFields,
  type Admission,
  type Binding,
  type Carrier,
  type DiscardReason,
  type Emitter,
  type EventDefinition,
  type FieldSchema,
  type LabelSchema,
  type MetricDefinition,
  type Segment,
  type SegmentDefinition,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import type { TelemetryClock } from './options.ts'
import { dropped, type Dropped, type Pipeline, type SegmentPlace } from './pipeline.ts'
import { recordScope, type RecordScope, type RecordValues, type SegmentOutcome } from './record.ts'

type Bound = Readonly<{ binding: Binding; scope: RecordScope }>

const PATCH_KEYS = ['work', 'attempt', 'call', 'adopted', 'links'] as const
const OUTCOMES: readonly unknown[] = ['ok', 'failure', 'unknown']
const DISCARDABLE: readonly unknown[] = DISCARD_REASONS
const COPY_LIMIT = Math.max(TELEMETRY_LIMITS.maxLinks, TELEMETRY_LIMITS.maxAdopted)

function ownData(value: unknown): Map<PropertyKey, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const members = new Map<PropertyKey, unknown>()
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !('value' in descriptor)) return undefined
    members.set(key, descriptor.value)
  }
  return members
}

// Validate the frozen copy, not the input: what was validated is what is written.
// A value that is not plain data is kept as it is, and validation rejects it.
function copyData(value: unknown): unknown {
  if (Array.isArray(value))
    return value.length > COPY_LIMIT ? value : Object.freeze(value.map(copyData))
  const members = ownData(value)
  if (members === undefined) return value
  return Object.freeze(Object.fromEntries([...members].map(([key, item]) => [key, copyData(item)])))
}

function snapshot(input: unknown): Bound | undefined {
  const members = ownData(input)
  if (members === undefined) return undefined
  const copy = Object.freeze(
    Object.fromEntries(
      [...members].map(([key, value]) => [key, key === 'scope' ? value : copyData(value)]),
    ),
  )
  const binding = copy as Binding
  if (validateBinding(binding).kind !== 'ok') return undefined
  const scope = recordScope(binding.scope)
  return scope === undefined ? undefined : { binding, scope }
}

function patched(bound: Bound, patch: unknown): Bound | undefined {
  const members = ownData(patch)
  if (members === undefined) return undefined
  const next: Record<string, unknown> = { ...bound.binding }
  for (const key of PATCH_KEYS) {
    const value = members.get(key)
    if (value !== undefined) next[key] = value
  }
  return snapshot(next)
}

function checkedValues(
  schema: Readonly<{ schema: FieldSchema }>,
  values: unknown,
): RecordValues | undefined {
  const copy = copyData(values)
  return validateFields(schema, copy).kind === 'ok' ? (copy as RecordValues) : undefined
}

function linksOf(links: unknown): readonly Carrier[] | undefined {
  if (links === undefined) return []
  if (!Array.isArray(links) || links.length > TELEMETRY_LIMITS.maxLinks) return undefined
  const decoded: Carrier[] = []
  for (const link of links) {
    const result = decodeCarrier(link)
    if (result.kind === 'invalid') return undefined
    decoded.push(result.carrier)
  }
  return decoded
}

function segmentOptions(options: unknown): Parameters<Emitter['startSegment']>[1] {
  if (options === undefined) return {}
  const members = ownData(options)
  if (members === undefined) return undefined
  const links = linksOf(members.get('links'))
  const onRelease = members.get('onRelease')
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

function checker<D extends object>(
  signal: string,
  define: (input: D) => D,
): (value: unknown) => D | undefined {
  const checked = new WeakMap<object, D>()
  return value => {
    if (typeof value !== 'object' || value === null) return undefined
    const known = checked.get(value)
    if (known !== undefined) return known
    if (ownData(value)?.get('signal') !== signal) return undefined
    let copy: D
    try {
      copy = define(value as D)
    } catch {
      return undefined
    }
    if (Object.isFrozen(value)) checked.set(value, copy)
    return copy
  }
}

const eventDefinition = checker<EventDefinition<FieldSchema>>('event', defineEvent)
const metricDefinition = checker<MetricDefinition<LabelSchema>>('metric', defineMetric)
const segmentDefinition = checker<SegmentDefinition>('segment', defineSegment)

function isDefinition(value: unknown): boolean {
  return (
    eventDefinition(value) !== undefined ||
    metricDefinition(value) !== undefined ||
    segmentDefinition(value) !== undefined
  )
}

export type EmitterDeps = Readonly<{
  pipeline: Pipeline
  generation: string
  clock: TelemetryClock
  randomBytes: (size: number) => Uint8Array
}>

function hex(bytes: Uint8Array, length: number): string | undefined {
  const text = Buffer.from(bytes).toString('hex')
  if (text.length !== length) return undefined
  return /^0+$/.test(text) ? `${text.slice(0, -1)}1` : text
}

export function createPort(deps: EmitterDeps): TelemetryPort {
  const { pipeline, clock } = deps

  function guarded<T>(operation: () => T | Dropped): T | Dropped {
    try {
      return operation()
    } catch {
      return pipeline.drop('invalid')
    }
  }

  function admitting<T>(operation: () => T | Dropped): T | Dropped {
    return guarded(() => (pipeline.accepting() ? operation() : pipeline.drop('closed')))
  }

  function head(
    bound: Bound,
    definition: Readonly<{ owner: string; name: string; version: number }>,
  ) {
    const { binding, scope } = bound
    return {
      kind: 'telemetry',
      time: clock.now().toISOString(),
      generation: deps.generation,
      owner: definition.owner,
      name: definition.name,
      version: definition.version,
      scope,
      component: binding.component,
      instance: binding.instance,
      ...(binding.work !== undefined && { work: binding.work }),
      ...(binding.attempt !== undefined && { attempt: binding.attempt }),
      ...(binding.call !== undefined && { call: binding.call }),
      ...(binding.adopted !== undefined && { adopted: binding.adopted }),
      ...(binding.links !== undefined && { links: binding.links }),
    } as const
  }

  function startedSegment(
    bound: Bound,
    definition: SegmentDefinition,
    ids: Readonly<{ trace: string; span: string; carrier: Carrier }>,
    place: SegmentPlace,
  ): Segment {
    let ended: Admission | undefined
    return Object.freeze({
      carrier: ids.carrier,
      event(event: unknown, fields: unknown): Admission {
        return admitting(() => {
          if (ended !== undefined) return pipeline.drop('closed')
          if (!pipeline.isOpen(place)) return pipeline.drop('expired')
          const checked = eventDefinition(event)
          const values = checked && checkedValues(checked, fields)
          if (checked === undefined || values === undefined) return pipeline.drop('invalid')
          return pipeline.admit({
            ...head(bound, checked),
            signal: 'segment-event',
            level: checked.level,
            trace: ids.trace,
            span: ids.span,
            fields: values,
          })
        })
      },
      end(outcome: unknown = 'unknown'): Admission {
        return guarded(() => {
          if (ended !== undefined) return ended
          if (!OUTCOMES.includes(outcome)) return pipeline.drop('invalid')
          // An expired segment was counted when its place was taken back; its end is not counted
          // again, also after close began, when it answers `closed` like every record.
          if (!pipeline.isOpen(place)) {
            ended =
              place.state === 'closed'
                ? pipeline.drop('closed')
                : dropped(pipeline.accepting() ? 'expired' : 'closed')
            return ended
          }
          pipeline.closeSegment(place)
          ended = guarded(() =>
            pipeline.admit({
              ...head(bound, definition),
              signal: 'segment-end',
              trace: ids.trace,
              span: ids.span,
              outcome: outcome as SegmentOutcome,
              durationMs: clock.monotonicMs() - place.openedAt,
            }),
          )
          return ended
        })
      },
    })
  }

  function newIds(): Readonly<{ trace: string; span: string; carrier: Carrier }> | undefined {
    const trace = hex(deps.randomBytes(16), 32)
    const span = hex(deps.randomBytes(8), 16)
    if (trace === undefined || span === undefined) return undefined
    return { trace, span, carrier: encodeCarrier({ traceId: trace, spanId: span, sampled: true }) }
  }

  function startSegment(bound: Bound, definition: unknown, options: unknown): Segment | Dropped {
    const checked = segmentDefinition(definition)
    const checkedOptions = segmentOptions(options)
    if (checked === undefined || checkedOptions === undefined) return pipeline.drop('invalid')
    const ids = newIds()
    if (ids === undefined) return pipeline.drop('invalid')
    const place = pipeline.openSegment(checkedOptions.onRelease)
    if (place === undefined) return pipeline.drop('capacity')
    let segment: Segment | undefined
    try {
      const start = head(bound, checked)
      const allLinks = [...(start.links ?? []), ...(checkedOptions.links ?? [])]
      const admission = pipeline.admit({
        ...start,
        ...(allLinks.length > 0 && { links: allLinks }),
        signal: 'segment-start',
        trace: ids.trace,
        span: ids.span,
      })
      if (admission.kind === 'dropped') return admission
      segment = startedSegment(bound, checked, ids, place)
      return segment
    } finally {
      if (segment === undefined) pipeline.closeSegment(place)
    }
  }

  function boundEmitter(bound: Bound): Emitter {
    return Object.freeze({
      event(definition: unknown, fields: unknown): Admission {
        return admitting(() => {
          const checked = eventDefinition(definition)
          const values = checked && checkedValues(checked, fields)
          if (checked === undefined || values === undefined) return pipeline.drop('invalid')
          return pipeline.admit({
            ...head(bound, checked),
            signal: 'event',
            level: checked.level,
            fields: values,
          })
        })
      },
      record(definition: unknown, value: unknown, labels: unknown): Admission {
        return admitting(() => {
          const checked = metricDefinition(definition)
          const values = checked && checkedValues(checked, labels)
          if (checked === undefined || values === undefined) return pipeline.drop('invalid')
          if (typeof value !== 'number' || !Number.isFinite(value)) return pipeline.drop('invalid')
          if (checked.aggregation.kind === 'counter' && value < 0) return pipeline.drop('invalid')
          return pipeline.admit({
            ...head(bound, checked),
            signal: 'metric',
            value,
            fields: values,
          })
        })
      },
      startSegment(definition: unknown, options?: unknown): Segment | Dropped {
        return admitting(() => startSegment(bound, definition, options))
      },
      bind(patch: unknown): Emitter {
        try {
          return emitter(patched(bound, patch))
        } catch {
          return emitter(undefined)
        }
      },
    })
  }

  const invalidEmitter: Emitter = Object.freeze({
    event: () => admitting(() => pipeline.drop('invalid')),
    record: () => admitting(() => pipeline.drop('invalid')),
    startSegment: () => admitting(() => pipeline.drop('invalid')),
    bind: () => invalidEmitter,
  })

  function emitter(bound: Bound | undefined): Emitter {
    return bound === undefined ? invalidEmitter : boundEmitter(bound)
  }

  return Object.freeze({
    bind(binding: Binding): Emitter {
      try {
        return emitter(snapshot(binding))
      } catch {
        return invalidEmitter
      }
    },
    discard(definition: unknown, reason: unknown): Dropped {
      return admitting(() => {
        if (!isDefinition(definition) || !DISCARDABLE.includes(reason))
          return pipeline.drop('invalid')
        return pipeline.drop(reason as DiscardReason)
      })
    },
  })
}
