import { describe, expect, it } from 'vitest'
import {
  decodeCarrier,
  defineEvent,
  defineMetric,
  defineSegment,
  encodeCarrier,
  isSegment,
  type Binding,
  type Segment,
} from '../src/index.ts'
import { createCapturingTelemetry } from '../src/testing/index.ts'
import { aTenantScope, theSystemScope } from './scopes.ts'

const failed = defineEvent({
  owner: 'packages/session/session',
  name: 'omne.session.step.failed',
  version: 1,
  level: 'error',
  schema: { code: { kind: 'enum', values: ['timeout', 'refused'] } },
})
const calls = defineMetric({
  owner: 'packages/model/model',
  name: 'omne.model.calls',
  version: 1,
  unit: '1',
  aggregation: { kind: 'counter' },
  schema: { outcome: { kind: 'enum', values: ['ok', 'failure'] } },
})
const turn = defineSegment({ owner: 'packages/agent/agent', name: 'omne.agent.turn', version: 1 })

const admitted = { kind: 'admitted' }
const invalid = { kind: 'dropped', reason: 'invalid' }

function aBinding(): Binding {
  return {
    scope: aTenantScope(),
    component: 'session',
    instance: { owner: 'apps/harness-server', ref: 'process-1' },
  }
}

function started(value: Segment | { kind: 'dropped' }): Segment {
  if (!isSegment(value)) throw new Error('the segment was dropped')
  return value
}

describe('createCapturingTelemetry', () => {
  it('captures events, metrics and segments in call order with their binding', () => {
    const telemetry = createCapturingTelemetry()
    const binding = aBinding()
    const emitter = telemetry.port.bind(binding)

    expect(emitter.event(failed, { code: 'timeout' })).toEqual(admitted)
    expect(emitter.record(calls, 1, { outcome: 'ok' })).toEqual(admitted)
    const segment = started(emitter.startSegment(turn))
    expect(segment.event(failed, { code: 'refused' })).toEqual(admitted)
    expect(segment.end('failure')).toEqual(admitted)

    expect(telemetry.records()).toEqual([
      { kind: 'event', binding, definition: failed, fields: { code: 'timeout' } },
      { kind: 'metric', binding, definition: calls, value: 1, labels: { outcome: 'ok' } },
      { kind: 'segment-start', binding, definition: turn, segment: segment.carrier, links: [] },
      {
        kind: 'segment-event',
        binding,
        definition: failed,
        segment: segment.carrier,
        fields: { code: 'refused' },
      },
      {
        kind: 'segment-end',
        binding,
        definition: turn,
        segment: segment.carrier,
        outcome: 'failure',
      },
    ])
    expect(telemetry.dropped()).toBe(0)
  })

  it('gives each segment a distinct carrier that decodes', () => {
    const emitter = createCapturingTelemetry().port.bind(aBinding())
    const first = started(emitter.startSegment(turn))
    const second = started(emitter.startSegment(turn))

    expect(decodeCarrier(first.carrier)).toMatchObject({ kind: 'ok', carrier: first.carrier })
    expect(decodeCarrier(second.carrier)).toMatchObject({ kind: 'ok' })
    expect(second.carrier).not.toBe(first.carrier)
  })

  it('records the links given to startSegment', () => {
    const telemetry = createCapturingTelemetry()
    const link = encodeCarrier({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    })
    started(telemetry.port.bind(aBinding()).startSegment(turn, { links: [link] }))

    expect(telemetry.records()[0]).toMatchObject({ kind: 'segment-start', links: [link] })
  })

  it('keeps the binding it was given even when the caller changes the object later', () => {
    const telemetry = createCapturingTelemetry()
    const binding = { ...aBinding(), adopted: [{ owner: 'packages/agent/agent', ref: 'def-1' }] }
    const emitter = telemetry.port.bind(binding)

    binding.component = 'changed'
    binding.adopted.push({ owner: 'x', ref: 'y' })
    emitter.event(failed, { code: 'timeout' })

    expect(telemetry.records()[0]?.binding).toEqual({
      ...aBinding(),
      adopted: [{ owner: 'packages/agent/agent', ref: 'def-1' }],
    })
  })

  it('drops records over the capacity and counts them', () => {
    const telemetry = createCapturingTelemetry({ capacity: 2 })
    const emitter = telemetry.port.bind(aBinding())

    emitter.event(failed, { code: 'timeout' })
    emitter.event(failed, { code: 'refused' })
    expect(emitter.event(failed, { code: 'timeout' })).toEqual({
      kind: 'dropped',
      reason: 'capacity',
    })
    expect(emitter.startSegment(turn)).toEqual({ kind: 'dropped', reason: 'capacity' })

    expect(telemetry.records()).toHaveLength(2)
    expect(telemetry.dropped()).toBe(2)
  })

  it('makes Segment.end idempotent', () => {
    const telemetry = createCapturingTelemetry()
    const segment = started(telemetry.port.bind(aBinding()).startSegment(turn))

    expect(segment.end()).toEqual(admitted)
    expect(segment.end('ok')).toEqual(admitted)

    expect(telemetry.records().filter(record => record.kind === 'segment-end')).toEqual([
      expect.objectContaining({ outcome: 'unknown' }),
    ])
  })

  it('drops an event on an ended segment with closed', () => {
    const telemetry = createCapturingTelemetry()
    const segment = started(telemetry.port.bind(aBinding()).startSegment(turn))
    segment.end('ok')

    expect(segment.event(failed, { code: 'timeout' })).toEqual({
      kind: 'dropped',
      reason: 'closed',
    })
    expect(telemetry.records()).toHaveLength(2)
    expect(telemetry.dropped()).toBe(1)
  })

  it('derives a new emitter with bind and leaves the original one unchanged', () => {
    const telemetry = createCapturingTelemetry()
    const binding = aBinding()
    const original = telemetry.port.bind(binding)
    const work = { owner: 'packages/session/session', ref: 'ses-1' }
    const derived = original.bind({ work })

    derived.event(failed, { code: 'timeout' })
    original.event(failed, { code: 'refused' })

    expect(telemetry.records().map(record => record.binding)).toEqual([
      { ...binding, work },
      binding,
    ])
  })

  it('does not let bind change the scope, component or instance', () => {
    const telemetry = createCapturingTelemetry()
    const binding = aBinding()
    const derived = telemetry.port.bind(binding).bind({
      scope: theSystemScope(),
      component: 'cordis',
      instance: { owner: 'x', ref: 'y' },
    } as never)

    derived.event(failed, { code: 'timeout' })

    expect(telemetry.records()[0]?.binding).toEqual(binding)
  })

  it('answers dropped(invalid) for invalid fields, keeps them out of the records and counts them', () => {
    const telemetry = createCapturingTelemetry()
    const emitter = telemetry.port.bind(aBinding())

    expect(emitter.event(failed, { code: 'crashed' } as never)).toEqual(invalid)
    expect(emitter.event(failed, { code: 'timeout', message: 'secret' } as never)).toEqual(invalid)
    expect(emitter.record(calls, 1, { outcome: new Error('x') } as never)).toEqual(invalid)

    expect(telemetry.records()).toEqual([])
    expect(telemetry.dropped()).toBe(3)
  })

  it('answers dropped(invalid) for metric values that are not finite or are negative counter values', () => {
    const telemetry = createCapturingTelemetry()
    const emitter = telemetry.port.bind(aBinding())

    expect(emitter.record(calls, NaN, { outcome: 'ok' })).toEqual(invalid)
    expect(emitter.record(calls, -1, { outcome: 'ok' })).toEqual(invalid)
    expect(emitter.record(calls, '1' as never, { outcome: 'ok' })).toEqual(invalid)
    expect(telemetry.records()).toEqual([])
  })

  it('answers dropped(invalid) for every operation of an emitter with an invalid binding', () => {
    const telemetry = createCapturingTelemetry()
    const emitter = telemetry.port.bind({ ...aBinding(), scope: { kind: 'system' } } as never)

    expect(emitter.event(failed, { code: 'timeout' })).toEqual(invalid)
    expect(emitter.record(calls, 1, { outcome: 'ok' })).toEqual(invalid)
    expect(emitter.startSegment(turn)).toEqual(invalid)
    expect(emitter.bind({}).event(failed, { code: 'timeout' })).toEqual(invalid)
    expect(telemetry.records()).toEqual([])
    expect(telemetry.dropped()).toBe(4)
  })

  it('answers dropped(invalid) when a definition has the wrong signal', () => {
    const emitter = createCapturingTelemetry().port.bind(aBinding())

    expect(emitter.event(calls as never, { outcome: 'ok' } as never)).toEqual(invalid)
    expect(emitter.record(failed as never, 1, { code: 'timeout' } as never)).toEqual(invalid)
    expect(emitter.startSegment(failed as never)).toEqual(invalid)
  })

  it('never throws, whatever the input', () => {
    const telemetry = createCapturingTelemetry()
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('trap')
        },
        ownKeys() {
          throw new Error('trap')
        },
        getOwnPropertyDescriptor() {
          throw new Error('trap')
        },
      },
    )
    const junk: unknown[] = [undefined, null, 1, 'x', [], hostile]

    for (const value of junk) {
      const emitter = telemetry.port.bind(value as never)
      const good = telemetry.port.bind(aBinding())
      expect(() => emitter.event(failed, { code: 'timeout' })).not.toThrow()
      expect(() => good.event(value as never, value as never)).not.toThrow()
      expect(() => good.record(value as never, value as never, value as never)).not.toThrow()
      expect(() => good.startSegment(value as never, value as never)).not.toThrow()
      expect(() => good.bind(value as never)).not.toThrow()
      expect(() => good.bind(value as never).event(failed, { code: 'timeout' })).not.toThrow()
      const segment = started(good.startSegment(turn))
      expect(() => segment.event(value as never, value as never)).not.toThrow()
      expect(() => segment.end(value as never)).not.toThrow()
    }
    expect(telemetry.records().every(record => record.binding.component === 'session')).toBe(true)
  })

  it('answers dropped(invalid) for invalid startSegment links and an invalid end outcome', () => {
    const telemetry = createCapturingTelemetry()
    const emitter = telemetry.port.bind(aBinding())

    expect(emitter.startSegment(turn, { links: ['not-a-carrier' as never] })).toEqual(invalid)
    const segment = started(emitter.startSegment(turn))
    expect(segment.end('done' as never)).toEqual(invalid)
    expect(segment.end('ok')).toEqual(admitted)
  })

  it('clear empties the records and resets the dropped count', () => {
    const telemetry = createCapturingTelemetry({ capacity: 1 })
    const emitter = telemetry.port.bind(aBinding())
    emitter.event(failed, { code: 'timeout' })
    emitter.event(failed, { code: 'timeout' })

    telemetry.clear()

    expect(telemetry.records()).toEqual([])
    expect(telemetry.dropped()).toBe(0)
    expect(emitter.event(failed, { code: 'refused' })).toEqual(admitted)
  })

  it('returns records that the caller cannot change', () => {
    const telemetry = createCapturingTelemetry()
    telemetry.port.bind(aBinding()).event(failed, { code: 'timeout' })
    const records = telemetry.records()

    expect(Object.isFrozen(records)).toBe(true)
    expect(Object.isFrozen(records[0])).toBe(true)
  })

  it.each([0, -1, 1.5, NaN])('rejects the capacity %s with TypeError', capacity => {
    expect(() => createCapturingTelemetry({ capacity })).toThrow(TypeError)
  })
})

describe('isSegment', () => {
  it('tells a segment from a dropped answer', () => {
    const emitter = createCapturingTelemetry().port.bind(aBinding())

    expect(isSegment(emitter.startSegment(turn))).toBe(true)
    expect(isSegment({ kind: 'dropped', reason: 'capacity' })).toBe(false)
    expect(isSegment(null)).toBe(false)
    expect(isSegment({ carrier: 'x' })).toBe(false)
  })
})
