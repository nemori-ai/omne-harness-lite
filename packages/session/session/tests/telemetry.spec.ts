// SPEC「遥测投影」: the facade over the telemetry port. A measurement event becomes a telemetry
// segment or event of the tenant whose work it measures, or of the system for a system-scope read; a
// diagnostic becomes an event without its text. The port is the capturing double of telemetry-contract, so what it admits is what a
// provider would admit (TC-2, TC-4). A record of tenant work without a tenant goes to the port's
// `discard`, so the provider counts it; the test records each discard by name and reason.
import {
  actingScopeEquals,
  systemScope,
  tenantScope,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  EntryId,
  ResidentKey,
  RunId,
  SessionId,
  SessionRevision,
} from '@omne-harness/session-contract'
import {
  memoryAccess,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import type { Emitter, TelemetryPort } from '@omne-harness/telemetry-contract'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

/** The facade over the capturing double, with every `discard` the facade makes, by name and reason. */
function facade(options: Readonly<{ capacity?: number }> = {}) {
  const capture = createCapturingTelemetry(options)
  const discards: Array<readonly [string, string]> = []
  const port: TelemetryPort = {
    bind: binding => capture.port.bind(binding),
    discard: (definition, reason) => {
      discards.push([definition.name, reason])
      return capture.port.discard(definition, reason)
    },
  }
  const telemetry = createSessionTelemetry(port, { instance })
  return { capture, discards, telemetry }
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
    const { capture, discards, telemetry } = facade()
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
    expect(capture.dropped()).toBe(0)
    expect(discards).toEqual([])
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

  it('a start without a tenant is discarded through the port as invalid, under the segment it would have been; its end does nothing', () => {
    const { capture, discards, telemetry } = facade()
    telemetry.measure(start(1, 'pending', { tenant: undefined, session: null }))
    telemetry.measure(end(1, 'ok', 'pending', { tenant: undefined, session: null }))
    expect(capture.records()).toEqual([])
    expect(discards).toEqual([['omne.session.pending', 'invalid']])
    expect(capture.dropped()).toBe(1)
  })

  it('a segment of a system-scope read is a fact of the service: scope `system`, component `session`, no work, nothing discarded', () => {
    const { capture, discards, telemetry } = facade()
    const system = { session: null, scope: 'system' } as const
    telemetry.measure({
      kind: 'segment',
      segment: 'session',
      phase: 'start',
      span: 1,
      operation: 'references',
      ...system,
    })
    telemetry.measure({
      kind: 'segment',
      segment: 'session',
      phase: 'end',
      span: 1,
      operation: 'references',
      ...system,
      outcome: 'ok',
    })
    const records = capture.records()
    expect(records.map(record => record.kind)).toEqual(['segment-start', 'segment-end'])
    const [first] = records
    expect(first?.definition.name).toBe('omne.session.references')
    expect(first?.binding.component).toBe('session')
    expect(first?.binding.instance).toEqual(instance)
    expect(first?.binding.work).toBeUndefined()
    expect(actingScopeEquals(first!.binding.scope, systemScope())).toBe(true)
    expect(capture.dropped()).toBe(0)
    expect(discards).toEqual([])
  })

  it('a start that names both a tenant and the system scope is discarded as invalid, never bound to `system`', () => {
    const { capture, discards, telemetry } = facade()
    telemetry.measure({
      kind: 'segment',
      segment: 'session',
      phase: 'start',
      span: 1,
      operation: 'releasedScopes',
      session: null,
      tenant,
      scope: 'system',
    })
    expect(capture.records()).toEqual([])
    expect(discards).toEqual([['omne.session.releasedScopes', 'invalid']])
    expect(capture.dropped()).toBe(1)
  })

  it('an operation name the contract refuses is discarded through the port as invalid and makes no record', () => {
    const { capture, discards, telemetry } = facade()
    telemetry.measure(start(1, 'bad name'))
    telemetry.measure(end(1, 'ok', 'bad name'))
    expect(capture.records()).toEqual([])
    expect(discards).toEqual([['omne.session.bad name', 'invalid']])
    expect(capture.dropped()).toBe(1)
  })

  it('a start the provider drops is not paired: its end ends nothing and counts nothing', () => {
    const { capture, telemetry } = facade({ capacity: 1 })
    telemetry.measure(start(1))
    telemetry.measure(start(2))
    expect(capture.dropped()).toBe(1)
    telemetry.measure(end(2, 'ok'))
    expect(capture.records().map(record => record.kind)).toEqual(['segment-start'])
    expect(capture.dropped()).toBe(1)
  })

  it('an end without an open start makes no record and is not counted', () => {
    const { capture, discards, telemetry } = facade()
    telemetry.measure(end(9, 'ok'))
    expect(capture.records()).toEqual([])
    expect(capture.dropped()).toBe(0)
    expect(discards).toEqual([])
  })

  it('the definition cache is bounded: an operation over the limit still gets its segment, made again each time', () => {
    const { capture, telemetry } = facade()
    for (let i = 0; i < SESSION_SEGMENT_DEFINITION_LIMIT; i += 1)
      telemetry.measure(start(i + 1, `op${i}`))
    telemetry.measure(start(1000, 'one-more'))
    telemetry.measure(start(1001, 'one-more'))
    telemetry.measure(start(1002, 'op0'))
    const starts = capture.records().filter(record => record.kind === 'segment-start')
    expect(starts).toHaveLength(SESSION_SEGMENT_DEFINITION_LIMIT + 3)
    expect(capture.dropped()).toBe(0)
    const [uncachedFirst, uncachedSecond, cached] = starts.slice(-3)
    expect(uncachedFirst?.definition.name).toBe('omne.session.one-more')
    expect(uncachedSecond?.definition).toEqual(uncachedFirst?.definition)
    expect(uncachedSecond?.definition).not.toBe(uncachedFirst?.definition)
    expect(cached?.definition).toBe(starts[0]?.definition)
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

  it('an unknown or absent outcome is `unknown`; an absent run leaves no attempt; no tenant is discarded through the port as invalid', () => {
    const { capture, discards, telemetry } = facade()
    telemetry.measure(round({ run: null, outcome: null }))
    telemetry.measure(round({ run, outcome: 'something-else' }))
    telemetry.measure(round({ run, outcome: 'completed', tenant: undefined }))
    const events = capture.records().filter(record => record.kind === 'event')
    expect(events.map(record => record.fields.outcome)).toEqual(['unknown', 'unknown'])
    expect(events[0]?.binding.attempt).toBeUndefined()
    expect(discards).toEqual([['omne.session.round-complete', 'invalid']])
    expect(capture.dropped()).toBe(1)
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

  it('a failure kind a Session port answers stays itself; a reason outside the known values is `other`; a null run leaves no attempt', () => {
    const { capture, telemetry } = facade()
    telemetry.diagnose({
      ...diagnostic,
      owner: 'S1',
      step: 'read',
      run: null,
      reason: 'unavailable',
    })
    telemetry.diagnose({ ...diagnostic, owner: 'S1', step: 'read', run: null, reason: 'exotic' })
    const [known, outside] = capture.records()
    if (known?.kind !== 'event' || outside?.kind !== 'event') throw new Error('shape')
    expect(known.fields).toEqual({ owner: 'S1', step: 'read', reason: 'unavailable' })
    expect(outside.fields).toEqual({ owner: 'S1', step: 'read', reason: 'other' })
    expect(known.binding.attempt).toBeUndefined()
  })

  it('a tenant that legal-identity did not mint is discarded through the port as invalid; the detail text never reaches the port', () => {
    const { capture, discards, telemetry } = facade()
    const unminted = { organization: 'org_x', account: 'acc_y' } as unknown as TenantId
    telemetry.diagnose({ ...diagnostic, tenant: unminted })
    expect(capture.records()).toEqual([])
    expect(discards).toEqual([['omne.session.diagnostic', 'invalid']])
    expect(capture.dropped()).toBe(1)
  })
})

describe('over the real instance', () => {
  const open: Harness[] = []
  afterEach(async () => {
    for (const h of open.splice(0)) await h.close()
  })

  it('an accept through the instance is captured as one segment of the tenant, with its outcome', async () => {
    const capture = createCapturingTelemetry()
    const telemetry = createSessionTelemetry(capture.port, { instance })
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
    expect(capture.dropped()).toBe(0)
  })

  it('directory reads through the instance: `pending` is scoped to its tenant, `references` to the system; nothing is discarded', async () => {
    const capture = createCapturingTelemetry()
    const telemetry = createSessionTelemetry(capture.port, { instance })
    const h = await harness({ backend: memoryBackend, measure: telemetry.measure })
    open.push(h)
    await h.create()
    capture.clear()
    const maintainer = h.faces('maintainer').reconciliation
    await maintainer.pending({
      principal: 'a:tester',
      tenant: h.access().tenant,
      after: null,
      limit: 10,
    })
    await maintainer.references({
      principal: 'a:tester',
      scope: 'system',
      key: 'resident-1' as ResidentKey,
      after: null,
      limit: 10,
    })
    const starts = capture.records().filter(record => record.kind === 'segment-start')
    expect(starts.map(record => record.definition.name)).toEqual([
      'omne.session.pending',
      'omne.session.references',
    ])
    const [pending, references] = starts
    expect(actingScopeEquals(pending!.binding.scope, tenantScope(h.access().tenant))).toBe(true)
    expect(actingScopeEquals(references!.binding.scope, systemScope())).toBe(true)
    expect(capture.records().filter(record => record.kind === 'segment-end')).toHaveLength(2)
    expect(capture.dropped()).toBe(0)
  })
})

describe('provider release and measurement pairing', () => {
  it('does not restore a pair released before start returns', () => {
    const capture = createCapturingTelemetry()
    const endSegment = vi.fn()
    const port: TelemetryPort = {
      ...capture.port,
      bind(binding) {
        const emitter = capture.port.bind(binding)
        return {
          ...emitter,
          startSegment(definition, options) {
            const segment = emitter.startSegment(definition)
            options?.onRelease?.()
            return 'carrier' in segment ? { ...segment, end: endSegment } : segment
          },
        }
      },
    }
    const telemetry = createSessionTelemetry(port, { instance })
    telemetry.measure(start(1))
    telemetry.measure(end(1, 'ok'))
    expect(endSegment).not.toHaveBeenCalled()
  })

  it('an old release cannot remove the current pair of a reused measurement span', () => {
    const capture = createCapturingTelemetry()
    const releases: Array<NonNullable<Parameters<Emitter['startSegment']>[1]>> = []
    const port: TelemetryPort = {
      ...capture.port,
      bind(binding) {
        const emitter = capture.port.bind(binding)
        return {
          ...emitter,
          startSegment(definition, options) {
            releases.push(options ?? {})
            return emitter.startSegment(definition)
          },
        }
      },
    }
    const telemetry = createSessionTelemetry(port, { instance })
    telemetry.measure(start(1))
    telemetry.measure(start(1))
    releases[0]?.onRelease?.()
    telemetry.measure(end(1, 'ok'))
    const records = capture.records()
    expect(records).toHaveLength(3)
    expect(records[2]).toMatchObject({
      kind: 'segment-end',
      segment: records[1]?.kind === 'segment-start' ? records[1].segment : undefined,
    })
  })

  it('clear releases the pair so a late measurement end does not call a cleared segment', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1))
    capture.clear()
    telemetry.measure(end(1, 'ok'))
    expect(capture.records()).toEqual([])
    expect(capture.dropped()).toBe(0)
  })
})
