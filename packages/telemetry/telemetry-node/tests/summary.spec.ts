import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { summarizeTelemetry } from '../src/summary.ts'
import { handling, harness, loginFailed, nextTurn, systemBinding } from './support.ts'

const T0 = '2026-11-05T00:00:00.000Z'
const SYSTEM = { kind: 'system' } as const
const ORG_A = {
  organization: 'org_0123456789abcdefghjkmnpqrs',
  account: 'acc_0123456789abcdefghjkmnpqrs',
}
const ORG_B = {
  organization: 'org_abcdefghjkmnpqrs0123456789',
  account: 'acc_abcdefghjkmnpqrs0123456789',
}

type Head = { time?: string; scope?: unknown; owner?: string; name?: string }

function head(input: Head): Record<string, unknown> {
  return {
    kind: 'telemetry',
    time: input.time ?? T0,
    generation: 'g1',
    owner: input.owner ?? 'access',
    name: input.name ?? 'omne.entry.handle',
    version: 1,
    scope: input.scope ?? SYSTEM,
    component: 'server-entry',
    instance: { owner: 'apps/harness-server', ref: 'run-1' },
  }
}

function segmentStart(ids: { trace: string; span: string }, input: Head = {}): string {
  return JSON.stringify({ ...head(input), signal: 'segment-start', ...ids })
}

function segmentEnd(
  end: { trace: string; span: string; durationMs: number; outcome?: string },
  input: Head = {},
): string {
  return JSON.stringify({ ...head(input), signal: 'segment-end', outcome: 'ok', ...end })
}

function event(level: string, input: Head = {}): string {
  return JSON.stringify({ ...head(input), signal: 'event', level, fields: {} })
}

function log(level: string, time = T0): string {
  return JSON.stringify({
    kind: 'telemetry',
    signal: 'log',
    time,
    owner: 'cordis',
    name: 'omne.cordis.log',
    version: 1,
    level,
    scope: SYSTEM,
    component: 'app',
    fields: { text: 'message' },
  })
}

function ends(durations: readonly number[], outcomes: readonly string[], input: Head = {}) {
  return durations.map((durationMs, index) =>
    segmentEnd(
      { trace: `t${String(index)}`, span: 's', durationMs, outcome: outcomes[index] ?? 'ok' },
      input,
    ),
  )
}

function tenantOf(members: typeof ORG_A): TenantId {
  const parsed = tenantCodec.parse(JSON.stringify(members))
  if (!parsed.ok) throw new Error('test tenant text did not parse')
  return parsed.value
}

describe('summarizeTelemetry: segments', () => {
  it('groups segment-end records by owner and name, with outcomes and nearest-rank percentiles', () => {
    // 1..20 in a shuffled order. Nearest rank: p50 is the 10th value, p95 the 19th, p99 the 20th.
    const shuffled = [7, 20, 3, 14, 1, 18, 9, 12, 5, 16, 2, 19, 11, 6, 15, 4, 13, 8, 17, 10]
    const outcomes = [
      ...Array<string>(15).fill('ok'),
      'failure',
      'failure',
      'failure',
      'unknown',
      'unknown',
    ]
    const lines = [
      ...ends(shuffled, outcomes),
      ...ends([40], ['ok'], { owner: 'session', name: 'omne.session.turn' }),
    ]

    const summary = summarizeTelemetry(lines)

    expect(summary.segments).toEqual([
      {
        owner: 'session',
        name: 'omne.session.turn',
        count: 1,
        outcomes: { ok: 1, failure: 0, unknown: 0 },
        durationMs: { min: 40, p50: 40, p95: 40, p99: 40, max: 40 },
      },
      {
        owner: 'access',
        name: 'omne.entry.handle',
        count: 20,
        outcomes: { ok: 15, failure: 3, unknown: 2 },
        durationMs: { min: 1, p50: 10, p95: 19, p99: 20, max: 20 },
      },
    ])
  })

  it('takes the value at rank ceil(p/100 * n) of the sorted durations', () => {
    // n = 3: ranks 2, 3, 3. Sorted: 5, 7, 100.
    const summary = summarizeTelemetry(ends([100, 5, 7], ['ok', 'ok', 'ok']))

    expect(summary.segments[0]?.durationMs).toEqual({
      min: 5,
      p50: 7,
      p95: 100,
      p99: 100,
      max: 100,
    })
  })

  it('counts a segment-start without a segment-end of the same trace and span as unfinished', () => {
    const lines = [
      segmentStart({ trace: 't1', span: 's1' }),
      segmentStart({ trace: 't1', span: 's2' }),
      segmentStart({ trace: 't2', span: 's1' }),
      segmentEnd({ trace: 't1', span: 's1', durationMs: 3 }),
      segmentEnd({ trace: 't3', span: 's3', durationMs: 4 }),
    ]

    const summary = summarizeTelemetry(lines)

    expect(summary.unfinished).toBe(2)
    expect(summary.segments[0]?.count).toBe(2)
  })
})

describe('summarizeTelemetry: events and logs', () => {
  it('counts event and segment-event records by owner, name and level, and log records by level', () => {
    const lines = [
      event('warn', { owner: 'access', name: 'omne.entry.diagnostic' }),
      event('warn', { owner: 'access', name: 'omne.entry.diagnostic' }),
      event('error', { owner: 'access', name: 'omne.entry.diagnostic' }),
      JSON.stringify({
        ...head({ owner: 'session', name: 'omne.session.step' }),
        signal: 'segment-event',
        level: 'info',
        trace: 't1',
        span: 's1',
        fields: {},
      }),
      log('error'),
      log('error'),
      log('warn'),
    ]

    const summary = summarizeTelemetry(lines)

    expect(summary.events).toEqual([
      { owner: 'access', name: 'omne.entry.diagnostic', level: 'warn', count: 2 },
      { owner: 'access', name: 'omne.entry.diagnostic', level: 'error', count: 1 },
      { owner: 'session', name: 'omne.session.step', level: 'info', count: 1 },
    ])
    expect(summary.logs).toEqual({ error: 2, warn: 1, info: 0, debug: 0 })
  })

  it('reads the records that the runtime writes', async () => {
    const { runtime, clock, written } = harness()
    const emitter = runtime.port.bind(systemBinding())
    const segment = emitter.startSegment(handling)
    if (!('end' in segment)) throw new Error('the segment did not open')
    segment.event(loginFailed, {
      code: 'identity.fault',
      retried: false,
      attempts: 1,
      request: 'r',
    })
    clock.advance(30)
    segment.end('failure')
    emitter.startSegment(handling)
    emitter.event(loginFailed, {
      code: 'identity.denied',
      retried: true,
      attempts: 2,
      request: 'r',
    })
    runtime.ingestLog({ time: T0, level: 'warn', component: 'app', text: 'slow disk' })
    await nextTurn()
    await runtime.close(1000)

    const summary = summarizeTelemetry(written.map(record => JSON.stringify(record)))

    expect(summary).toEqual({
      segments: [
        {
          owner: 'access',
          name: 'omne.entry.handle',
          count: 1,
          outcomes: { ok: 0, failure: 1, unknown: 0 },
          durationMs: { min: 30, p50: 30, p95: 30, p99: 30, max: 30 },
        },
      ],
      events: [{ owner: 'access', name: 'omne.entry.diagnostic', level: 'warn', count: 2 }],
      logs: { error: 0, warn: 1, info: 0, debug: 0 },
      unfinished: 1,
      skipped: { invalid: 0, otherKinds: 0 },
      window: { from: T0, to: '2026-11-05T00:00:00.030Z' },
    })
  })
})

describe('summarizeTelemetry: input that is not a telemetry record', () => {
  it('skips and counts invalid lines and records of other kinds, and still counts the rest', () => {
    const lines = [
      'not json',
      '[1, 2]',
      '{"no":"kind"}',
      JSON.stringify({ ...head({}), signal: 'segment-end', trace: 't', span: 's', outcome: 'ok' }),
      JSON.stringify({
        ...head({ time: 'yesterday' }),
        signal: 'event',
        level: 'info',
        fields: {},
      }),
      JSON.stringify({ kind: 'tree', rows: [] }),
      JSON.stringify({ kind: 'row-state', row: 'telemetry', state: 'ACTIVE' }),
      '',
      '   ',
      segmentEnd({ trace: 't1', span: 's1', durationMs: 8 }),
      log('info'),
    ]

    const summary = summarizeTelemetry(lines)

    expect(summary.skipped).toEqual({ invalid: 5, otherKinds: 2 })
    expect(summary.segments[0]?.count).toBe(1)
    expect(summary.logs.info).toBe(1)
  })
})

describe('summarizeTelemetry: filters', () => {
  it('keeps only the records whose scope is the given tenant', () => {
    const lines = [
      ...ends([10, 20], ['ok', 'ok'], { scope: { kind: 'tenant', tenant: ORG_A } }),
      ...ends([30], ['ok'], { scope: { kind: 'tenant', tenant: ORG_B } }),
      ...ends([40], ['ok']),
      event('warn', { scope: { kind: 'tenant', tenant: ORG_A } }),
      event('warn', { scope: { kind: 'tenant', tenant: ORG_B } }),
      log('error'),
    ]

    const summary = summarizeTelemetry(lines, { tenant: tenantOf(ORG_A) })

    expect(summary.segments).toEqual([
      expect.objectContaining({ count: 2, durationMs: expect.objectContaining({ max: 20 }) }),
    ])
    expect(summary.events).toEqual([expect.objectContaining({ count: 1 })])
    expect(summary.logs).toEqual({ error: 0, warn: 0, info: 0, debug: 0 })
  })

  it('keeps the records from `from` inclusive to `to` exclusive, and reports their span', () => {
    const lines = [
      log('error', '2026-11-05T00:00:00.000Z'),
      log('error', '2026-11-05T00:00:01.000Z'),
      log('error', '2026-11-05T00:00:01.500Z'),
      log('error', '2026-11-05T00:00:02.000Z'),
    ]

    const summary = summarizeTelemetry(lines, {
      from: new Date('2026-11-05T00:00:01.000Z'),
      to: new Date('2026-11-05T00:00:02.000Z'),
    })

    expect(summary.logs.error).toBe(2)
    expect(summary.window).toEqual({
      from: '2026-11-05T00:00:01.000Z',
      to: '2026-11-05T00:00:01.500Z',
    })
  })

  it('reports no window when no record is counted', () => {
    expect(summarizeTelemetry(['not json']).window).toBeNull()
  })
})
