// SPEC「遥测投影」: the facade over the telemetry port. A measurement event becomes a telemetry
// segment or event of the tenant whose work it measures; a diagnostic becomes an event without its
// text. The port is the capturing double of telemetry-contract, so what it admits is what a
// provider would admit (TC-2, TC-4).
import { actingScopeEquals, tenantScope, type TenantId } from '@omne-harness/legal-identity'
import type { EntryId, RunId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import {
  memoryAccess,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionDiagnostic, SessionMeasureEvent } from '../src/index.ts'
import {
  SESSION_SEGMENT_DEFINITION_LIMIT,
  createSessionTelemetry,
  sessionDiagnosticEvent,
  sessionRoundCompleteEvent,
} from '../src/telemetry.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const tenant = memoryAccess('a:tester').tenant
const session: SessionId = sessionId('session-1')
const run = 'run_abc' as RunId
const instance = { owner: '@omne-harness/harness-server', ref: 'session-provider' }

function facade(maxOpenSegments = 8) {
  const capture = createCapturingTelemetry()
  const telemetry = createSessionTelemetry(capture.port, { instance, maxOpenSegments })
  return { capture, telemetry }
}

/** The parts of an event a case varies: the tenant (absent for the no-tenant cases) and the session. */
type Where = Readonly<{ tenant?: TenantId | undefined; session?: SessionId | null }>

function where(input: Where): Readonly<{ session: SessionId | null; tenant?: TenantId }> {
  const own = input.session === undefined ? session : input.session
  return 'tenant' in input && input.tenant === undefined
    ? { session: own }
    : { session: own, tenant: input.tenant ?? tenant }
}

function start(span: number, operation = 'accept', input: Where = {}): SessionMeasureEvent {
  return { kind: 'segment', segment: 'session', phase: 'start', span, operation, ...where(input) }
}

function end(
  span: number,
  outcome: 'ok' | 'failure',
  operation = 'accept',
  input: Where = {},
): SessionMeasureEvent {
  return {
    kind: 'segment',
    segment: 'session',
    phase: 'end',
    span,
    operation,
    ...where(input),
    outcome,
  }
}

function round(
  input: Where & Readonly<{ run: RunId | null; outcome: string | null }>,
): SessionMeasureEvent {
  const { session: own, ...rest } = where(input)
  return {
    kind: 'round-complete',
    session: own ?? session,
    ...rest,
    run: input.run,
    outcome: input.outcome,
    revision: 'rev-1' as SessionRevision,
    entry: 'entry-1' as EntryId,
    operation: operationId('finish'),
  }
}

const diagnostic: SessionDiagnostic = {
  owner: 'C2',
  step: 'invoke',
  tenant,
  session,
  run,
  reason: 'agent-absent',
  detail: 'the Agent drive port is absent',
}

describe('the Session segment', () => {
  it('start and end become one segment named after the operation, scoped to the tenant, with the session as work', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1))
    telemetry.measure(end(1, 'ok'))
    const records = capture.records()
    expect(records.map(record => record.kind)).toEqual(['segment-start', 'segment-end'])
    const [first, last] = records
    if (first?.kind !== 'segment-start' || last?.kind !== 'segment-end') throw new Error('shape')
    expect(first.definition).toMatchObject({ owner: 'session', name: 'omne.session.accept' })
    expect(last.definition).toBe(first.definition)
    expect(last.segment).toBe(first.segment)
    expect(last.outcome).toBe('ok')
    expect(first.binding.component).toBe('session')
    expect(first.binding.instance).toEqual(instance)
    expect(first.binding.work).toEqual({ owner: '@omne-harness/session', ref: 'session-1' })
    expect(first.binding.attempt).toBeUndefined()
    expect(actingScopeEquals(first.binding.scope, tenantScope(tenant))).toBe(true)
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 0 })
  })

  it('a failure outcome ends the segment with failure; the same definition serves the same operation again', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1, 'readWork'))
    telemetry.measure(end(1, 'failure', 'readWork'))
    telemetry.measure(start(2, 'readWork'))
    telemetry.measure(end(2, 'ok', 'readWork'))
    const ends = capture.records().filter(record => record.kind === 'segment-end')
    expect(ends.map(record => record.outcome)).toEqual(['failure', 'ok'])
    const starts = capture.records().filter(record => record.kind === 'segment-start')
    expect(starts[1]?.definition).toBe(starts[0]?.definition)
    expect(starts[0]?.definition.name).toBe('omne.session.readWork')
  })

  it('a directory read names no session: the segment has no work', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1, 'pending', { session: null }))
    telemetry.measure(end(1, 'ok', 'pending', { session: null }))
    const [first] = capture.records()
    expect(first?.kind).toBe('segment-start')
    expect(first?.binding.work).toBeUndefined()
  })

  it('an event without a tenant makes no record and counts as invalid; it is never scoped to system', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1, 'accept', { tenant: undefined }))
    telemetry.measure(end(1, 'ok', 'accept', { tenant: undefined }))
    expect(capture.records()).toEqual([])
    expect(capture.dropped()).toBe(0)
    expect(telemetry.dropped()).toEqual({ invalid: 1, capacity: 0 })
  })

  it('an operation name outside the contract character set makes no record and counts as invalid', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1, 'bad name'))
    telemetry.measure(end(1, 'ok', 'bad name'))
    expect(capture.records()).toEqual([])
    expect(telemetry.dropped()).toEqual({ invalid: 1, capacity: 0 })
  })

  it('the open-segment table is bounded: a start over the limit is dropped and counted, an end frees its entry', () => {
    const { capture, telemetry } = facade(1)
    telemetry.measure(start(1))
    telemetry.measure(start(2))
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 1 })
    telemetry.measure(end(2, 'ok'))
    telemetry.measure(end(1, 'ok'))
    telemetry.measure(start(3))
    telemetry.measure(end(3, 'failure'))
    expect(
      capture
        .records()
        .map(record => (record.kind === 'segment-end' ? record.outcome : record.kind)),
    ).toEqual(['segment-start', 'ok', 'segment-start', 'failure'])
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 1 })
  })

  it('an end without an open start makes no record and is not counted', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(end(9, 'ok'))
    expect(capture.records()).toEqual([])
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 0 })
  })

  it('the definition cache is bounded: an operation over the limit is dropped and counted as capacity', () => {
    const { capture, telemetry } = facade(SESSION_SEGMENT_DEFINITION_LIMIT + 2)
    for (let i = 0; i < SESSION_SEGMENT_DEFINITION_LIMIT; i += 1)
      telemetry.measure(start(i + 1, `op${i}`))
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 0 })
    telemetry.measure(start(1000, 'one-more'))
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 1 })
    expect(capture.records()).toHaveLength(SESSION_SEGMENT_DEFINITION_LIMIT)
    // A known operation still goes through.
    telemetry.measure(start(1001, 'op0'))
    expect(capture.records()).toHaveLength(SESSION_SEGMENT_DEFINITION_LIMIT + 1)
  })

  it('refuses a maxOpenSegments that is not a positive integer', () => {
    const { capture } = facade()
    expect(() => createSessionTelemetry(capture.port, { instance, maxOpenSegments: 0 })).toThrow(
      TypeError,
    )
  })
})

describe('the round-complete event', () => {
  it('becomes omne.session.round-complete with the run as attempt, the outcome as enum and the operation as ref', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(round({ run, outcome: 'failed' }))
    const [record] = capture.records()
    expect(record?.kind).toBe('event')
    if (record?.kind !== 'event') throw new Error('shape')
    expect(record.definition).toBe(sessionRoundCompleteEvent)
    expect(record.definition.name).toBe('omne.session.round-complete')
    expect(record.fields).toEqual({ outcome: 'failed', operation: operationId('finish') })
    expect(record.binding.work).toEqual({ owner: '@omne-harness/session', ref: 'session-1' })
    expect(record.binding.attempt).toEqual({ owner: '@omne-harness/session', ref: 'run_abc' })
    expect(actingScopeEquals(record.binding.scope, tenantScope(tenant))).toBe(true)
  })

  it('an unknown or absent outcome is `unknown`; an absent run leaves no attempt; no tenant counts as invalid', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(round({ run: null, outcome: null }))
    telemetry.measure(round({ run, outcome: 'something-else' }))
    telemetry.measure(round({ run, outcome: 'completed', tenant: undefined }))
    const events = capture.records().filter(record => record.kind === 'event')
    expect(events.map(record => record.fields.outcome)).toEqual(['unknown', 'unknown'])
    expect(events[0]?.binding.attempt).toBeUndefined()
    expect(telemetry.dropped()).toEqual({ invalid: 1, capacity: 0 })
  })
})

describe('the diagnostic event', () => {
  it('becomes omne.session.diagnostic with owner, step and reason as enums and without the detail text', () => {
    const { capture, telemetry } = facade()
    telemetry.diagnose(diagnostic)
    const [record] = capture.records()
    if (record?.kind !== 'event') throw new Error('shape')
    expect(record.definition).toBe(sessionDiagnosticEvent)
    expect(record.definition).toMatchObject({ name: 'omne.session.diagnostic', level: 'warn' })
    expect(record.fields).toEqual({ owner: 'C2', step: 'invoke', reason: 'agent-absent' })
    expect(Object.keys(record.fields)).not.toContain('detail')
    expect(JSON.stringify(record)).not.toContain('the Agent drive port')
    expect(record.binding.work).toEqual({ owner: '@omne-harness/session', ref: 'session-1' })
    expect(record.binding.attempt).toEqual({ owner: '@omne-harness/session', ref: 'run_abc' })
    expect(actingScopeEquals(record.binding.scope, tenantScope(tenant))).toBe(true)
  })

  it('a reason outside the known values is `other`; a null run leaves no attempt', () => {
    const { capture, telemetry } = facade()
    telemetry.diagnose({ ...diagnostic, owner: 'S1', step: 'read', run: null, reason: 'denied' })
    const [record] = capture.records()
    if (record?.kind !== 'event') throw new Error('shape')
    expect(record.fields).toEqual({ owner: 'S1', step: 'read', reason: 'other' })
    expect(record.binding.attempt).toBeUndefined()
  })
})

describe('over the real instance', () => {
  const open: Harness[] = []
  afterEach(async () => {
    for (const h of open.splice(0)) await h.close()
  })

  it('an accept through the instance is captured as one segment of the tenant, with its outcome', async () => {
    const capture = createCapturingTelemetry()
    const telemetry = createSessionTelemetry(capture.port, { instance, maxOpenSegments: 16 })
    const h = await harness({ backend: memoryBackend, measure: telemetry.measure })
    open.push(h)
    await h.create()
    capture.clear()
    await h.accept('input-1')
    succeeded(await h.faces('coordinator').work.readWork(h.access()), 'readWork')
    const names = capture.records().map(record => `${record.kind}:${record.definition.name}`)
    expect(names).toEqual([
      'segment-start:omne.session.accept',
      'segment-end:omne.session.accept',
      'segment-start:omne.session.readWork',
      'segment-end:omne.session.readWork',
    ])
    for (const record of capture.records())
      expect(actingScopeEquals(record.binding.scope, tenantScope(h.access().tenant))).toBe(true)
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 0 })
  })
})
