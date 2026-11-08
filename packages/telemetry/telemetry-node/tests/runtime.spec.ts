import {
  TELEMETRY_LIMITS,
  decodeCarrier,
  defineMetric,
  isSegment,
  type Binding,
} from '@omne-harness/telemetry-contract'
import { describe, expect, it } from 'vitest'
import { createTelemetryRuntime, type TelemetryRecord } from '../src/index.ts'
import {
  BUDGETS,
  INSTANCE,
  aTenantScope,
  countingBytes,
  fieldOf,
  handling,
  harness,
  idsOf,
  loginFailed,
  manualClock,
  nextTurn,
  requests,
  systemBinding,
} from './support.ts'

const FIELDS = { code: 'identity.fault', retried: false, attempts: 1, request: 'req-1' } as const

function bypass<T>(value: unknown): T {
  // The test reaches past the contract types on purpose: the runtime checks actual values.
  return value as T
}

describe('admission and the writer outlet', () => {
  it('writes one record of the documented shape for a valid event', async () => {
    const { runtime, written } = harness()
    const binding: Binding = {
      ...systemBinding(),
      work: { owner: 'access', ref: 'op-1' },
      call: { owner: 'access', ref: 'call-1' },
    }

    const answer = runtime.port.bind(binding).event(loginFailed, FIELDS)
    expect(answer).toEqual({ kind: 'admitted' })
    expect(written).toEqual([])
    await nextTurn()

    expect(written).toEqual([
      {
        kind: 'telemetry',
        signal: 'event',
        time: '2026-11-05T00:00:00.000Z',
        generation: 'g1',
        owner: 'access',
        name: 'omne.entry.diagnostic',
        version: 1,
        level: 'warn',
        scope: { kind: 'system' },
        component: 'server-entry',
        instance: { owner: 'apps/harness-server', ref: 'server-entry' },
        work: { owner: 'access', ref: 'op-1' },
        call: { owner: 'access', ref: 'call-1' },
        fields: FIELDS,
      },
    ])
  })

  it('writes the scope in the text form of the legal-identity codec', async () => {
    const { runtime, written } = harness()
    runtime.port.bind({ ...systemBinding(), scope: aTenantScope() }).event(loginFailed, FIELDS)
    await nextTurn()

    expect(written[0]?.scope).toEqual({
      kind: 'tenant',
      tenant: {
        organization: 'org_0123456789abcdefghjkmnpqrs',
        account: 'acc_0123456789abcdefghjkmnpqrs',
      },
    })
  })

  it('drops invalid fields and an invalid binding without writing, and counts each', async () => {
    const { runtime, written } = harness()
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.event(loginFailed, bypass({ ...FIELDS, prompt: 'hello' }))).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(emitter.event(loginFailed, bypass({ ...FIELDS, attempts: 11 }))).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    const unminted = runtime.port.bind(bypass({ ...systemBinding(), scope: { kind: 'system' } }))
    expect(unminted.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'invalid' })
    await nextTurn()

    expect(written).toEqual([])
    const report = await runtime.close(1000)
    expect(report.droppedBy).toEqual({ invalid: 3 })
    expect(report.admitted).toBe(0)
  })

  it('drops a record whose serialized size is above maxRecordBytes', async () => {
    const { runtime, written } = harness({ budgets: { maxRecordBytes: 300 } })
    const emitter = runtime.port.bind({
      ...systemBinding(),
      work: { owner: 'access', ref: 'w'.repeat(256) },
    })

    expect(emitter.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'invalid' })
    await nextTurn()
    expect(written).toEqual([])
  })

  it('answers dropped(invalid) for an input that throws while it is read', () => {
    const { runtime } = harness()
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap')
        },
      },
    )

    expect(runtime.port.bind(systemBinding()).event(loginFailed, bypass(hostile))).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(runtime.port.bind(bypass(hostile)).event(loginFailed, FIELDS)).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
  })

  it('writes a metric record with its value and labels', async () => {
    const { runtime, written } = harness()
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.record(requests, 1, { outcome: 'failure' })).toEqual({ kind: 'admitted' })
    expect(emitter.record(requests, -1, { outcome: 'ok' })).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(emitter.record(requests, Number.NaN, { outcome: 'ok' })).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    await nextTurn()

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      signal: 'metric',
      name: 'omne.entry.requests',
      value: 1,
      fields: { outcome: 'failure' },
    })
  })
})

describe('outlet failures (G1, G2)', () => {
  it('keeps the caller unaffected when the writer always throws, and counts output errors', async () => {
    const { runtime, clock, summaries } = harness({
      write: () => {
        throw new Error('stdout closed')
      },
    })
    const emitter = runtime.port.bind(systemBinding())

    for (let round = 0; round < 3; round += 1) {
      for (let index = 0; index < 5; index += 1)
        expect(emitter.event(loginFailed, FIELDS)).toEqual({ kind: 'admitted' })
      await nextTurn()
      clock.advance(100)
    }

    // Fifteen failures inside one interval of 1000 ms: one summary line, not fifteen.
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toContain('outputErrors=1')
    clock.advance(1000)
    emitter.event(loginFailed, FIELDS)
    await nextTurn()
    expect(summaries).toHaveLength(2)
    expect(summaries[1]).toContain('outputErrors=16')

    const report = await runtime.close(1000)
    // The runtime never feeds its own failures back into its queue.
    expect(report.admitted).toBe(16)
    expect(report.droppedBy).toEqual({ output: 16 })
    expect(report.dropped).toBe(16)
    expect(report.flush).toBe('failed')
  })

  it('swallows a summary sink that throws', async () => {
    const { runtime } = harness({
      write: () => {
        throw new Error('stdout closed')
      },
      summary: () => {
        throw new Error('stderr closed')
      },
    })

    expect(runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)).toEqual({
      kind: 'admitted',
    })
    await nextTurn()
    await expect(runtime.close(1000)).resolves.toMatchObject({ admission: 'closed' })
  })

  it('writes the other records of a batch when one record fails at the outlet', async () => {
    const { runtime, written } = harness({
      write: (record, list) => {
        if (fieldOf(record, 'request') === 'poison') throw new TypeError('cannot serialize')
        list.push(record)
      },
    })
    const emitter = runtime.port.bind(systemBinding())

    emitter.event(loginFailed, { ...FIELDS, request: 'a' })
    emitter.event(loginFailed, { ...FIELDS, request: 'poison' })
    emitter.event(loginFailed, { ...FIELDS, request: 'b' })
    await nextTurn()

    expect(written.map(record => fieldOf(record, 'request'))).toEqual(['a', 'b'])
    const report = await runtime.close(1000)
    expect(report.admitted).toBe(3)
    expect(report.droppedBy).toEqual({ output: 1 })
    expect(report.dropped).toBe(1)
  })

  it('sums dropped over every key of droppedBy, with output among them', async () => {
    const { runtime } = harness({
      write: () => {
        throw new Error('stdout closed')
      },
    })
    const emitter = runtime.port.bind(systemBinding())
    emitter.event(loginFailed, FIELDS)
    emitter.event(loginFailed, bypass({ ...FIELDS, prompt: 'x' }))
    runtime.port.discard(handling, 'policy')
    await nextTurn()

    const report = await runtime.close(1000)
    expect(report.droppedBy).toEqual({ invalid: 1, policy: 1, output: 1 })
    expect(report.dropped).toBe(3)
  })
})

describe('the bounded queue (N3)', () => {
  it('drops exactly the admissions above maxQueueItems while the outlet does not drain', async () => {
    const { runtime, written } = harness({ budgets: { maxQueueItems: 50 } })
    const emitter = runtime.port.bind(systemBinding())
    const answers = []

    for (let index = 0; index < 50 + 1000; index += 1) {
      const answer = emitter.event(loginFailed, FIELDS)
      expect(answer).not.toBeInstanceOf(Promise)
      answers.push(answer.kind === 'dropped' ? answer.reason : answer.kind)
    }

    expect(answers.filter(kind => kind === 'admitted')).toHaveLength(50)
    expect(answers.filter(kind => kind === 'capacity')).toHaveLength(1000)
    expect(written).toEqual([])
    const report = await runtime.close(1000)
    expect(report.admitted).toBe(50)
    expect(report.droppedBy).toEqual({ capacity: 1000 })
    expect(written).toHaveLength(50)
  })

  it('drops by bytes when the queue holds maxQueueBytes', () => {
    const { runtime } = harness({ budgets: { maxQueueBytes: 1000 } })
    const emitter = runtime.port.bind(systemBinding())
    const answers = Array.from({ length: 10 }, () => emitter.event(loginFailed, FIELDS).kind)

    expect(answers.indexOf('dropped')).toBeGreaterThan(0)
    expect(answers.slice(answers.indexOf('dropped')).every(kind => kind === 'dropped')).toBe(true)
  })
})

describe('content protection (G3)', () => {
  it('drops an Error object, an sk- token and a bearer text in non-ref fields', async () => {
    const { runtime, written } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const secrets = [
      { ...FIELDS, code: new Error('sk-live-123') },
      { ...FIELDS, code: 'sk-live-0123456789' },
      { ...FIELDS, retried: 'Bearer x' },
      { ...FIELDS, request: 'Bearer x' },
    ]

    for (const fields of secrets)
      expect(emitter.event(loginFailed, bypass(fields))).toEqual({
        kind: 'dropped',
        reason: 'invalid',
      })
    await nextTurn()

    expect(written).toEqual([])
  })
})

describe('segments (TC-14)', () => {
  it('writes start, events with the same span, and one end with a duration', async () => {
    const { runtime, clock, written } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const segment = emitter.startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')

    expect(segment.event(loginFailed, FIELDS)).toEqual({ kind: 'admitted' })
    clock.advance(42)
    expect(segment.end('failure')).toEqual({ kind: 'admitted' })
    expect(segment.end('ok')).toEqual({ kind: 'admitted' })
    expect(segment.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'closed' })
    await nextTurn()

    const carrier = decodeCarrier(segment.carrier)
    if (carrier.kind !== 'ok') throw new Error('expected a carrier')
    expect(written.map(record => record.signal)).toEqual([
      'segment-start',
      'segment-event',
      'segment-end',
    ])
    for (const record of written)
      expect(idsOf(record)).toEqual({ trace: carrier.traceId, span: carrier.spanId })
    expect(written[2]).toMatchObject({ outcome: 'failure', durationMs: 42 })
  })

  it('answers dropped(invalid) for an unknown outcome and leaves the segment open', async () => {
    const { runtime, written } = harness()
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')

    expect(segment.end(bypass('done'))).toEqual({ kind: 'dropped', reason: 'invalid' })
    expect(segment.end()).toEqual({ kind: 'admitted' })
    await nextTurn()
    expect(written.at(-1)).toMatchObject({ signal: 'segment-end', outcome: 'unknown' })
  })

  it('refuses a segment above maxOpenSegments and frees the place when one ends', () => {
    const { runtime } = harness({ budgets: { maxOpenSegments: 2 } })
    const emitter = runtime.port.bind(systemBinding())
    const first = emitter.startSegment(handling)
    emitter.startSegment(handling)

    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'capacity' })
    if (!isSegment(first)) throw new Error('expected a segment')
    first.end('ok')
    first.end('ok')
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'capacity' })
  })

  it('frees the segment place when the identity source throws, so the next segment starts', () => {
    const bytes = countingBytes()
    let failures = 1
    const { runtime } = harness({
      budgets: { maxOpenSegments: 1 },
      randomBytes: size => {
        if (failures > 0) {
          failures -= 1
          throw new Error('entropy source closed')
        }
        return bytes(size)
      },
    })
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'invalid' })
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
  })

  it('writes the links of the binding and of the start options on the start record', async () => {
    const { runtime, written } = harness()
    const inbound = decodeCarrier(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`)
    const local = decodeCarrier(`00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`)
    if (inbound.kind !== 'ok' || local.kind !== 'ok') throw new Error('bad carriers')
    const emitter = runtime.port.bind({ ...systemBinding(), links: [inbound.carrier] })

    emitter.startSegment(handling, { links: [local.carrier] })
    expect(emitter.startSegment(handling, bypass({ links: ['not-a-carrier'] }))).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    await nextTurn()

    expect(written).toHaveLength(1)
    expect(written[0]?.links).toEqual([inbound.carrier, local.carrier])
    expect(idsOf(written[0]).trace).not.toBe(inbound.traceId)
  })
})

describe('segment lifetime (TN-6)', () => {
  const DROPPED_EXPIRED = { kind: 'dropped', reason: 'expired' } as const

  it('expires a segment open longer than maxSegmentLifetimeMs: its place frees, its end answers dropped(expired) and writes nothing, and a younger segment is unaffected', async () => {
    const { runtime, clock, written } = harness({
      budgets: { maxOpenSegments: 2, maxSegmentLifetimeMs: 100 },
    })
    const emitter = runtime.port.bind(systemBinding())
    const old = emitter.startSegment(handling)
    clock.advance(50)
    const young = emitter.startSegment(handling)
    if (!isSegment(old) || !isSegment(young)) throw new Error('expected two segments')
    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'capacity' })

    clock.advance(51)
    // The old segment is 101 ms open, the young one 51 ms: one place is free again.
    const third = emitter.startSegment(handling)
    expect(isSegment(third)).toBe(true)
    expect(old.end('ok')).toEqual(DROPPED_EXPIRED)
    expect(old.end('ok')).toEqual(DROPPED_EXPIRED)
    expect(young.end('ok')).toEqual({ kind: 'admitted' })
    await nextTurn()

    expect(written.map(record => record.signal)).toEqual([
      'segment-start',
      'segment-start',
      'segment-start',
      'segment-end',
    ])
    expect(written[3]).toMatchObject({ durationMs: 51 })
    expect(idsOf(written[3])).toEqual(idsOf(written[1]))
    const report = await runtime.close(1000)
    expect(report.droppedBy).toEqual({ capacity: 1, expired: 1 })
    expect(report.dropped).toBe(2)
  })

  it('counts an expired segment once, and each event on it after that under expired', async () => {
    const { runtime, clock, summaries, written } = harness({
      budgets: { maxSegmentLifetimeMs: 100 },
    })
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')
    await nextTurn()
    clock.advance(101)

    expect(segment.event(loginFailed, FIELDS)).toEqual(DROPPED_EXPIRED)
    expect(segment.event(loginFailed, FIELDS)).toEqual(DROPPED_EXPIRED)
    expect(segment.end('failure')).toEqual(DROPPED_EXPIRED)
    await nextTurn()

    expect(summaries).toEqual([
      'telemetry generation=g1 admitted=1 queued=0 openSegments=0 outputErrors=0 dropped.expired=1',
    ])
    expect(written.map(record => record.signal)).toEqual(['segment-start'])
    expect((await runtime.close(1000)).droppedBy).toEqual({ expired: 3 })
  })

  it('keeps a segment open at exactly the lifetime, and expires it one millisecond later', () => {
    const { runtime, clock } = harness({ budgets: { maxSegmentLifetimeMs: 100 } })
    const emitter = runtime.port.bind(systemBinding())
    const exact = emitter.startSegment(handling)
    const over = emitter.startSegment(handling)
    if (!isSegment(exact) || !isSegment(over)) throw new Error('expected two segments')

    clock.advance(100)
    expect(exact.end('ok')).toEqual({ kind: 'admitted' })
    clock.advance(1)
    expect(over.end('ok')).toEqual(DROPPED_EXPIRED)
  })

  it('uses one hour as the lifetime when the budget is absent', () => {
    const { runtime, clock } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const first = emitter.startSegment(handling)
    const second = emitter.startSegment(handling)
    if (!isSegment(first) || !isSegment(second)) throw new Error('expected two segments')

    clock.advance(3_600_000)
    expect(first.end('ok')).toEqual({ kind: 'admitted' })
    clock.advance(1)
    expect(second.end('ok')).toEqual(DROPPED_EXPIRED)
  })

  it('takes back the places of overdue segments at close, into the report and not a summary line', async () => {
    const { runtime, clock, summaries, written } = harness({
      budgets: { maxSegmentLifetimeMs: 100 },
    })
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')
    clock.advance(101)

    const report = await runtime.close(1000)
    expect(report.droppedBy).toEqual({ expired: 1 })
    expect(summaries).toEqual([])
    expect(written.map(record => record.signal)).toEqual(['segment-start'])
    expect(segment.end('ok')).toEqual({ kind: 'dropped', reason: 'closed' })
  })

  it('does not count the end of a segment taken back at the close check a second time', async () => {
    const { runtime, clock, written } = harness({ budgets: { maxSegmentLifetimeMs: 100 } })
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')
    clock.advance(101)

    const closing = runtime.close(1000)
    expect(segment.end('ok')).toEqual({ kind: 'dropped', reason: 'closed' })

    const report = await closing
    expect(report.droppedBy).toEqual({ expired: 1 })
    expect(report.dropped).toBe(1)
    expect(written.map(record => record.signal)).toEqual(['segment-start'])
  })

  it('counts the end of a segment that outlives the lifetime after close began under closed only', async () => {
    const { runtime, clock, written } = harness({ budgets: { maxSegmentLifetimeMs: 100 } })
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')
    clock.advance(100)

    const closing = runtime.close(1000)
    clock.advance(1)
    expect(segment.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'closed' })
    expect(segment.end('ok')).toEqual({ kind: 'dropped', reason: 'closed' })

    const report = await closing
    expect(report.droppedBy).toEqual({ closed: 2 })
    expect(report.dropped).toBe(2)
    expect(written.map(record => record.signal)).toEqual(['segment-start'])
  })

  it('refuses a maxSegmentLifetimeMs that is present and not a positive integer', () => {
    expect(() => harness({ budgets: { maxSegmentLifetimeMs: 0 } })).toThrow(/maxSegmentLifetimeMs/)
    expect(() => harness({ budgets: { maxSegmentLifetimeMs: 1.5 } })).toThrow(TypeError)
    expect(() => harness({ budgets: bypass({ maxSegmentLifetimeMs: '100' }) })).toThrow(TypeError)
  })
})

describe('bind derivation (TC-15)', () => {
  it('derives an emitter with a new call and leaves the original unchanged', async () => {
    const { runtime, written } = harness()
    const original = runtime.port.bind({ ...systemBinding(), call: { owner: 'access', ref: 'c1' } })
    const derived = original.bind({
      call: { owner: 'access', ref: 'c2' },
      ...bypass<object>({ component: 'intruder', scope: undefined }),
    })

    derived.event(loginFailed, FIELDS)
    original.event(loginFailed, FIELDS)
    await nextTurn()

    expect(written.map(record => record.call?.ref)).toEqual(['c2', 'c1'])
    expect(written.map(record => record.component)).toEqual(['server-entry', 'server-entry'])
  })

  it('keeps the snapshot of a binding that the caller changes later', async () => {
    const { runtime, written } = harness()
    const binding = { ...systemBinding(), work: { owner: 'access', ref: 'w1' } }
    const emitter = runtime.port.bind(binding)
    binding.work.ref = 'w2'

    emitter.event(loginFailed, FIELDS)
    await nextTurn()
    expect(written[0]?.work?.ref).toBe('w1')
  })

  it('derives an emitter that drops everything from an invalid patch', () => {
    const { runtime } = harness()
    const derived = runtime.port.bind(systemBinding()).bind({ call: bypass({ owner: 'x' }) })

    expect(derived.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'invalid' })
  })
})

describe('discard', () => {
  it('counts a record the caller could not form under its reason, writes nothing, and leaves admitted unchanged', async () => {
    const { runtime, written } = harness()

    expect(runtime.port.discard(handling, 'invalid')).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(runtime.port.discard(loginFailed, 'invalid')).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(runtime.port.discard(requests, 'capacity')).toEqual({
      kind: 'dropped',
      reason: 'capacity',
    })
    runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)
    const report = await runtime.close(1000)

    expect(written.map(record => record.signal)).toEqual(['event'])
    expect(report).toMatchObject({
      admitted: 1,
      dropped: 3,
      droppedBy: { invalid: 2, capacity: 1 },
    })
  })

  it('answers dropped(invalid) for a reason the caller cannot claim, a definition the contract refuses, and an input that throws while it is read', async () => {
    const { runtime } = harness()
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap')
        },
      },
    )

    expect(runtime.port.discard(handling, bypass('closed'))).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(runtime.port.discard(bypass({ ...handling, name: 'bad name' }), 'policy')).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(runtime.port.discard(bypass(hostile), 'policy')).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(await runtime.close(1000)).toMatchObject({ dropped: 3, droppedBy: { invalid: 3 } })
  })

  it('answers dropped(closed) once the runtime closes', async () => {
    const { runtime } = harness()
    const closing = runtime.close(1000)

    expect(runtime.port.discard(handling, 'invalid')).toEqual({
      kind: 'dropped',
      reason: 'closed',
    })
    expect(await closing).toMatchObject({ dropped: 1, droppedBy: { closed: 1 } })
  })
})

describe('close (CloseReport)', () => {
  it('stops admission, drains to the local sink and reports the boundary', async () => {
    const { runtime, written } = harness()
    const emitter = runtime.port.bind(systemBinding())
    emitter.event(loginFailed, FIELDS)
    emitter.event(loginFailed, FIELDS)

    const closing = runtime.close(1000)
    expect(emitter.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'closed' })
    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'closed' })
    expect(runtime.ingestLog({ time: 't', level: 'warn', component: 'x', text: 'y' })).toEqual({
      kind: 'dropped',
      reason: 'closed',
    })
    const report = await closing

    expect(written).toHaveLength(2)
    expect(report).toEqual({
      generation: 'g1',
      admission: 'closed',
      admitted: 2,
      dropped: 3,
      droppedBy: { closed: 3 },
      pending: 0,
      flush: 'completed-to-boundary',
      boundary: 'local-sink',
      transport: 'closed',
    })
    expect(runtime.close(1)).toBe(closing)
  })
})

describe('close at the deadline', () => {
  it('writes what fits before the deadline and reports the rest as pending', async () => {
    let advance: (ms: number) => void = () => undefined
    const { runtime, clock, written } = harness({
      write: (record, list) => {
        list.push(record)
        advance(40)
      },
    })
    advance = ms => clock.advance(ms)
    const emitter = runtime.port.bind(systemBinding())
    for (let index = 0; index < 5; index += 1) emitter.event(loginFailed, FIELDS)

    const report = await runtime.close(100)

    expect(written).toHaveLength(3)
    expect(report).toMatchObject({
      flush: 'deadline',
      boundary: 'local-sink',
      transport: 'unconfirmed',
      admitted: 5,
      pending: 2,
    })
    expect(report.transport).not.toBe('closed')
  })

  it('reports boundary none when no record reached the sink before the deadline', async () => {
    const { runtime } = harness()
    runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)

    const report = await runtime.close(0)
    expect(report).toMatchObject({ flush: 'deadline', boundary: 'none', pending: 1 })
  })
})

describe('log records from the bridge', () => {
  it('admits a log record with the run instance, the generation and a truncated text', async () => {
    const { runtime, written } = harness({ budgets: { maxLogTextLength: 5 } })

    expect(
      runtime.ingestLog({
        time: '2026-11-05T00:00:01.000Z',
        level: 'warn',
        component: 'row:server-entry',
        text: 'abcdefgh',
        bootstrap: true,
      }),
    ).toEqual({ kind: 'admitted' })
    expect(
      runtime.ingestLog(bypass({ level: 'loud', component: 'x', text: 'y', time: 't' })),
    ).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    await nextTurn()

    expect(written).toEqual([
      {
        kind: 'telemetry',
        signal: 'log',
        time: '2026-11-05T00:00:01.000Z',
        generation: 'g1',
        owner: 'cordis',
        name: 'omne.cordis.log',
        version: 1,
        level: 'warn',
        scope: { kind: 'system' },
        component: 'row:server-entry',
        instance: INSTANCE,
        fields: { text: 'abcde' },
        bootstrap: true,
      } satisfies TelemetryRecord,
    ])
  })
})

describe('options', () => {
  it('keeps the budgets captured at creation when the caller changes its object later', () => {
    const budgets = { ...BUDGETS, maxQueueItems: 2 }
    const runtime = createTelemetryRuntime({
      generation: 'g1',
      instance: INSTANCE,
      clock: manualClock(),
      randomBytes: countingBytes(),
      outlet: { kind: 'writer', write: () => undefined },
      budgets,
      summary: () => undefined,
    })
    budgets.maxQueueItems = 1
    const emitter = runtime.port.bind(systemBinding())

    expect([1, 2, 3].map(() => emitter.event(loginFailed, FIELDS).kind)).toEqual([
      'admitted',
      'admitted',
      'dropped',
    ])
  })

  it('treats a deadline that is not a finite positive number as zero', async () => {
    const { runtime } = harness()
    runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)

    expect(await runtime.close(Number.NaN)).toMatchObject({ flush: 'deadline', pending: 1 })
  })

  it('refuses a missing or non-positive budget', () => {
    expect(() => harness({ budgets: { maxQueueItems: 0 } })).toThrow(TypeError)
    expect(() => harness({ budgets: { maxRecordBytes: 1.5 } })).toThrow(TypeError)
    expect(() => harness({ budgets: bypass({ summaryIntervalMs: undefined }) })).toThrow(
      /summaryIntervalMs/,
    )
    expect(() => harness({ instance: bypass({ owner: 'x' }) })).toThrow(TypeError)
    expect(() => harness({ generation: '' })).toThrow(TypeError)
  })
})

const DROPPED_INVALID = { kind: 'dropped', reason: 'invalid' } as const
const carrierOf = (trace: string, span: string) => {
  const decoded = decodeCarrier(`00-${trace.repeat(32)}-${span.repeat(16)}-01`)
  if (decoded.kind !== 'ok') throw new Error('bad carrier')
  return decoded.carrier
}

describe('the snapshot of a binding', () => {
  it('copies the links of a binding, so a link pushed after bind, past the limit, does not reach a record', async () => {
    const { runtime, written } = harness()
    const links = Array.from({ length: TELEMETRY_LIMITS.maxLinks }, (_, index) =>
      carrierOf((index + 1).toString(16), 'b'),
    )
    const emitter = runtime.port.bind({ ...systemBinding(), links })
    links.push(carrierOf('e', 'f'))

    expect(emitter.event(loginFailed, FIELDS)).toEqual({ kind: 'admitted' })
    await nextTurn()
    expect(written[0]?.links).toHaveLength(TELEMETRY_LIMITS.maxLinks)
  })

  it('keeps the original member when a patch names it as undefined', async () => {
    const { runtime, written } = harness()
    const original = runtime.port.bind({ ...systemBinding(), call: { owner: 'access', ref: 'c1' } })
    const derived = original.bind(bypass<object>({ call: undefined }))

    expect(derived.event(loginFailed, FIELDS)).toEqual({ kind: 'admitted' })
    await nextTurn()
    expect(written[0]?.call).toEqual({ owner: 'access', ref: 'c1' })
  })

  it('answers dropped(invalid) from every operation of an invalid binding, and bind on it stays invalid', () => {
    const { runtime } = harness()
    const invalid = runtime.port.bind(bypass({ ...systemBinding(), component: '' }))

    expect(invalid.event(loginFailed, FIELDS)).toEqual(DROPPED_INVALID)
    expect(invalid.record(requests, 1, { outcome: 'ok' })).toEqual(DROPPED_INVALID)
    expect(invalid.startSegment(handling)).toEqual(DROPPED_INVALID)
    expect(invalid.bind({}).event(loginFailed, FIELDS)).toEqual(DROPPED_INVALID)

    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys')
        },
      },
    )
    expect(runtime.port.bind(bypass(hostile)).event(loginFailed, FIELDS)).toEqual(DROPPED_INVALID)
    expect(
      runtime.port.bind(systemBinding()).bind(bypass(hostile)).event(loginFailed, FIELDS),
    ).toEqual(DROPPED_INVALID)
  })
})

describe('definitions and values at the port', () => {
  it('drops a definition of another signal, one that the contract refuses, and one that is not an object', () => {
    const { runtime } = harness()
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.event(bypass(requests), { outcome: 'ok' })).toEqual(DROPPED_INVALID)
    expect(emitter.record(bypass(loginFailed), 1, { outcome: 'ok' })).toEqual(DROPPED_INVALID)
    expect(emitter.startSegment(bypass(loginFailed))).toEqual(DROPPED_INVALID)
    expect(
      emitter.event(bypass<typeof loginFailed>({ ...loginFailed, owner: 'not a token!' }), FIELDS),
    ).toEqual(DROPPED_INVALID)
    expect(emitter.record(bypass({}), 1, {})).toEqual(DROPPED_INVALID)
    expect(emitter.record(bypass(null), 1, {})).toEqual(DROPPED_INVALID)
  })

  it('admits a gauge below zero and a counter at zero, and drops a counter below zero', async () => {
    const { runtime, written } = harness()
    const depth = defineMetric({
      owner: 'access',
      name: 'omne.entry.depth',
      version: 1,
      unit: '1',
      aggregation: { kind: 'gauge' },
      schema: {},
    })
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.record(depth, -1, {})).toEqual({ kind: 'admitted' })
    expect(emitter.record(requests, 0, { outcome: 'ok' })).toEqual({ kind: 'admitted' })
    expect(emitter.record(requests, -1, { outcome: 'ok' })).toEqual(DROPPED_INVALID)
    await nextTurn()
    expect(written.map(record => ('value' in record ? record.value : null))).toEqual([-1, 0])
  })
})

describe('segment identities, links and places', () => {
  it('uses the identity bytes as given: the trace and span are their hex, an all-zero identity ends in 1, the carrier is sampled', () => {
    const { runtime } = harness({
      randomBytes: size =>
        size === 16
          ? Uint8Array.from({ length: 16 }, (_, index) => index + 1)
          : new Uint8Array(size),
    })
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')

    expect(decodeCarrier(segment.carrier)).toEqual({
      kind: 'ok',
      carrier: segment.carrier,
      traceId: '0102030405060708090a0b0c0d0e0f10',
      spanId: '0000000000000001',
      sampled: true,
    })
  })

  it('drops a segment whose identity source gives the wrong size, without taking a segment place', () => {
    const bytes = countingBytes()
    let short = true
    const { runtime } = harness({
      budgets: { maxOpenSegments: 1 },
      randomBytes: size => {
        if (short) {
          short = false
          return new Uint8Array(1)
        }
        return bytes(size)
      },
    })
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.startSegment(handling)).toEqual(DROPPED_INVALID)
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
  })

  it('starts with empty options and writes no links member, takes exactly maxLinks links, and refuses one more', async () => {
    const { runtime, written } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const links = Array.from({ length: TELEMETRY_LIMITS.maxLinks + 1 }, (_, index) =>
      carrierOf((index + 1).toString(16), 'd'),
    )

    expect(isSegment(emitter.startSegment(handling, {}))).toBe(true)
    expect(isSegment(emitter.startSegment(handling, { links: links.slice(0, -1) }))).toBe(true)
    expect(emitter.startSegment(handling, { links })).toEqual(DROPPED_INVALID)
    await nextTurn()

    expect(written).toHaveLength(2)
    expect(written[0]).not.toHaveProperty('links')
    expect(written[1]?.links).toEqual(links.slice(0, -1))
  })

  it('writes the fields of a segment event as given, drops invalid ones, and counts the duration from the start', async () => {
    const { runtime, clock, written } = harness()
    clock.advance(10)
    const segment = runtime.port.bind(systemBinding()).startSegment(handling)
    if (!isSegment(segment)) throw new Error('expected a segment')

    expect(segment.event(loginFailed, bypass({ ...FIELDS, extra: 1 }))).toEqual(DROPPED_INVALID)
    expect(segment.event(loginFailed, FIELDS)).toEqual({ kind: 'admitted' })
    clock.advance(42)
    expect(segment.end('ok')).toEqual({ kind: 'admitted' })
    await nextTurn()

    expect(written.map(record => record.signal)).toEqual([
      'segment-start',
      'segment-event',
      'segment-end',
    ])
    expect(fieldOf(written[1], 'code')).toBe(FIELDS.code)
    expect(written[1]).toMatchObject({ fields: FIELDS })
    expect(written[2]).toMatchObject({ durationMs: 42 })
  })

  it('answers dropped(capacity) and frees the segment place when the queue refuses the start record', async () => {
    const { runtime } = harness({ budgets: { maxQueueItems: 1, maxOpenSegments: 1 } })
    const emitter = runtime.port.bind(systemBinding())

    expect(emitter.event(loginFailed, FIELDS)).toEqual({ kind: 'admitted' })
    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'capacity' })
    await nextTurn()
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
  })
})

describe('the summary line and the byte limits', () => {
  it('names the generation and the counts after a drop, once per interval, again at the boundary, and never after close', async () => {
    const { runtime, clock, summaries } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const invalid = bypass<typeof FIELDS>({ prompt: 'x' })

    clock.advance(600)
    emitter.event(loginFailed, invalid)
    expect(summaries).toEqual([
      'telemetry generation=g1 admitted=0 queued=0 openSegments=0 outputErrors=0 dropped.invalid=1',
    ])
    clock.advance(100)
    emitter.event(loginFailed, invalid)
    expect(summaries).toHaveLength(1)
    clock.advance(900)
    emitter.event(loginFailed, invalid)
    expect(summaries).toHaveLength(2)
    expect(summaries[1]).toBe(
      'telemetry generation=g1 admitted=0 queued=0 openSegments=0 outputErrors=0 dropped.invalid=3',
    )

    await runtime.close(1000)
    clock.advance(5000)
    expect(emitter.event(loginFailed, FIELDS)).toEqual({ kind: 'dropped', reason: 'closed' })
    expect(summaries).toHaveLength(2)
  })

  it('admits a record of exactly maxRecordBytes and drops one byte over; takes exactly maxQueueBytes', async () => {
    const { runtime, written } = harness()
    runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)
    await nextTurn()
    const size = Buffer.byteLength(JSON.stringify(written[0]), 'utf8')

    const exact = harness({ budgets: { maxRecordBytes: size } })
    expect(exact.runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)).toEqual({
      kind: 'admitted',
    })
    const under = harness({ budgets: { maxRecordBytes: size - 1 } })
    expect(under.runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)).toEqual(
      DROPPED_INVALID,
    )
    const queue = harness({ budgets: { maxQueueBytes: size * 2 } })
    const emitter = queue.runtime.port.bind(systemBinding())
    expect([1, 2, 3].map(() => emitter.event(loginFailed, FIELDS))).toEqual([
      { kind: 'admitted' },
      { kind: 'admitted' },
      { kind: 'dropped', reason: 'capacity' },
    ])
  })
})

describe('copies and limits at the boundary', () => {
  it('copies the field values at admission, also from an object without a prototype: a member changed later does not reach the record', async () => {
    const { runtime, written } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const plain: Record<string, unknown> = { ...FIELDS }
    const bare: Record<string, unknown> = Object.assign(Object.create(null), FIELDS)

    expect(emitter.event(loginFailed, bypass(plain))).toEqual({ kind: 'admitted' })
    expect(emitter.event(loginFailed, bypass(bare))).toEqual({ kind: 'admitted' })
    plain['request'] = 'changed-later'
    bare['request'] = 'changed-later'
    await nextTurn()

    expect(written.map(record => fieldOf(record, 'request'))).toEqual(['req-1', 'req-1'])
  })

  it('writes no links member on a start record when neither the binding nor the options carry links', async () => {
    const { runtime, written } = harness()
    runtime.port.bind(systemBinding()).startSegment(handling)
    await nextTurn()
    expect(written).toHaveLength(1)
    expect(written[0]).not.toHaveProperty('links')
  })

  it('lists every drop reason on the summary line', () => {
    const { runtime, clock, summaries } = harness({
      budgets: { maxQueueItems: 1, summaryIntervalMs: 1 },
    })
    const emitter = runtime.port.bind(systemBinding())
    emitter.event(loginFailed, bypass<typeof FIELDS>({ prompt: 'x' }))
    emitter.event(loginFailed, FIELDS)
    clock.advance(1)
    emitter.event(loginFailed, FIELDS)
    expect(summaries.at(-1)).toBe(
      'telemetry generation=g1 admitted=1 queued=1 openSegments=0 outputErrors=0 dropped.invalid=1 dropped.capacity=1',
    )
  })

  it('treats an infinite deadline as zero too', async () => {
    const { runtime } = harness()
    runtime.port.bind(systemBinding()).event(loginFailed, FIELDS)
    expect(await runtime.close(Number.POSITIVE_INFINITY)).toMatchObject({
      flush: 'deadline',
      pending: 1,
    })
  })
})
