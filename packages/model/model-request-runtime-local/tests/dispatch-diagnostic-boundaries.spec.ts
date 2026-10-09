// @module-tag slow
import { describe, expect, it } from 'vitest'
import type {
  DiagnosticScope,
  DiagnosticEvent,
  SessionRuntimeBinding,
  SendResult,
  DispatchResult,
} from '@omne-harness-lite/model-request-runtime'
import type {
  DiagnosticCollectorConfig,
  DiagnosticJournalStore,
  DiagnosticOutputSink,
  DiagnosticRecord,
} from '../src/diagnostics-types.ts'
import { createDiagnosticCollector } from '../src/diagnostics.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { acknowledgementHost, kinds } from './acknowledgement-host-fixture.ts'
import { payload } from './anchored-invocation-fixture.ts'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import { referencePorts } from './reference-ports-fixture.ts'
import { ControlledSettlementOwner } from './settlement-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'
import { deferred } from './anchored-invocation-fixture.ts'
const local: DiagnosticScope = { kind: 'local' }
function fixture(
  options: {
    scope?: DiagnosticScope
    append?: DiagnosticJournalStore['append']
    monotonicClock?: () => number
    wallClock?: () => Date
    queueMaxRecords?: number
    maxFieldBytes?: number
    schedule?: DiagnosticCollectorConfig['schedule']
    sink?: DiagnosticOutputSink
    stderr?: DiagnosticCollectorConfig['stderr']
    query?: DiagnosticJournalStore['query']
  } = {},
) {
  const records: DiagnosticRecord[] = []
  let queryCalls = 0
  let exportCalls = 0
  const store: DiagnosticJournalStore = {
    async append(record) {
      const result = options.append ? await options.append(record) : 'written'
      if (result === 'written') records.push(record)
      return result
    },
    async flush() {},
    async query(query) {
      queryCalls++
      return options.query ? options.query(query) : { rejected: 'unavailable' }
    },
    async exportPage() {
      exportCalls++
      return { rejected: 'unavailable' }
    },
    async close() {
      return { complete: true, coverage: 'complete' }
    },
    health() {
      return {
        pendingQueries: 0,
        pendingQueryIo: 0,
        openQueryHandles: 0,
        pendingQueryCloses: 0,
        timedOutQueries: 0,
        queryCloseFailures: 0,
        expired: 0,
        expiredBytes: 0,
        evicted: 0,
        evictedBytes: 0,
        retainedBytes: 0,
        retainedRecords: 0,
        retainedSegments: 0,
        coverage: 'complete',
      }
    },
  }
  const config: DiagnosticCollectorConfig = {
    collectorId: 'collector-1',
    scope: options.scope ?? local,
    maxRecordBytes: 4096,
    maxFieldBytes: options.maxFieldBytes ?? 512,
    queueMaxRecords: options.queueMaxRecords ?? 128,
    queueMaxBytes: 262144,
    segmentMaxBytes: 8192,
    retainedMaxBytes: 16384,
    retainedMaxSegments: 3,
    retentionMs: 60000,
    queryMaxRecords: 3,
    queryMaxBytes: 8192,
    queryScanMaxBytes: 8192,
    queryConcurrency: 1,
    queryMaxDurationMs: 500,
    exportMaxRecords: 3,
    exportMaxBytes: 8192,
    closeWaitMs: 500,
    stderrMaxReports: 3,
    monotonicClock: options.monotonicClock ?? (() => 10),
    wallClock: options.wallClock ?? (() => new Date('2026-09-28T00:00:00Z')),
    schedule:
      options.schedule ??
      ((ms, callback) => {
        const timer = setTimeout(callback, ms)
        return {
          cancel() {
            clearTimeout(timer)
          },
        }
      }),
    store,
    ...(options.sink ? { sink: options.sink } : {}),
    ...(options.stderr ? { stderr: options.stderr } : {}),
  }
  return {
    collector: createDiagnosticCollector(config),
    config,
    records,
    get queryCalls() {
      return queryCalls
    },
    get exportCalls() {
      return exportCalls
    },
  }
}

it('a credential diagnostic microtask sees the original first reservation released', async () => {
  const owner = new ControlledSettlementOwner()
  const world = await acknowledgementHost({ owner })
  const calls = createCallContainerStore<TestPlan, object>()
  let runtime: ReturnType<typeof createModelRuntime> | undefined
  let armed = false
  let queued = false
  const trace: string[] = []
  let probe: 'reserved' | 'occupied' | 'closed' | undefined
  const { collector } = fixture({
    scope: { kind: 'tenant', tenant: world.host.tenant },
    sink: {
      mode: 'sync',
      record(record) {
        if (
          !armed ||
          queued ||
          record.source !== 'runtime' ||
          record.stage !== 'credential' ||
          record.outcome !== 'accepted'
        )
          return
        queued = true
        trace.push('credential-accepted-record')
        queueMicrotask(() => {
          const attempt = calls.reserve({ session: world.host.session, callId: ref.callId })
          if ('reservation' in attempt) {
            probe = 'reserved'
            attempt.reservation.release()
          } else probe = 'occupied' in attempt ? 'occupied' : 'closed'
          trace.push(`microtask:${probe}`)
        })
      },
    },
  })
  let ref: { session: typeof world.host.session; callId: string }
  try {
    runtime = createModelRuntime({
      ...world.construction,
      ...referencePorts(world.host, calls),
      calls,
      diagnosticCollector: collector,
    })
    const opened = await runtime.service.openCall(world.request('p6_d_reservation_probe'))
    if (!('ref' in opened)) throw new Error(`open failed ${JSON.stringify(opened)}`)
    ref = opened.ref
    armed = true
    const result = await runtime.service.dispatch(ref)
    trace.push('dispatch-returned')
    expect(result).toHaveProperty('replyPending')
    expect(trace).toEqual(['credential-accepted-record', 'microtask:reserved', 'dispatch-returned'])
    expect(queued).toBe(true)
    expect(probe).toBe('reserved')
    expect(world.wire.sends()).toBe(1)
  } finally {
    if (runtime !== undefined) expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    expect(owner.active).toBe(0)
    expect(await collector.close()).toEqual({ complete: true, coverage: 'complete' })
    await world.host.close()
  }
})

type Fault =
  'none' | 'legacy_throw' | 'legacy_reject' | 'engineering_record' | 'engineering_close' | 'absent'
async function withDiagnosticHostWithoutFailureReader(
  kind: 'observer' | 'settlement',
  fault: Fault,
  work: (observed: {
    readonly legacy: string[]
    readonly engineering: DiagnosticRecord[]
    readonly reports: string[]
    readonly result: DispatchResult
    readonly responses: readonly unknown[]
    readonly logKinds: readonly unknown[]
    readonly sendAttempts: number
    readonly receiverStops: number
    readonly active: number
  }) => void,
): Promise<void> {
  const owner = new ControlledSettlementOwner()
  const world = await acknowledgementHost({ owner })
  const calls = createCallContainerStore<TestPlan, object>()
  let runtime: ReturnType<typeof createModelRuntime> | undefined
  const legacy: string[] = []
  const engineering: DiagnosticRecord[] = []
  const reports: string[] = []
  const receiverStopped = deferred<void>()
  let sendAttempts = 0,
    receiverStops = 0
  const { collector } = fixture({
    scope: { kind: 'tenant', tenant: world.host.tenant },
    sink: {
      mode: 'sync',
      record(record) {
        engineering.push(record)
      },
    },
  })
  try {
    const bound = await world.construction.sessions.bind(world.host.session)
    if (!('binding' in bound)) throw new Error('original binding unavailable')
    const binding: SessionRuntimeBinding = {
      ...bound.binding,
      observers: {
        authorize() {
          return {
            observer: {
              check: () => ({ valid: true }),
              open: () => ({
                receiver: {
                  receive() {
                    throw new Error('controlled observer consumer failure')
                  },
                  stop() {
                    receiverStops++
                    receiverStopped.resolve()
                  },
                  stopped: receiverStopped.promise,
                },
              }),
              close: async () => ({ released: true }),
            },
          }
        },
      },
    }
    const failure: SendResult<object> = { failed: { source: 'http_status', statusCode: 503 } }
    const diagnosticCollector = {
      emitter: (...args: Parameters<typeof collector.emitter>) => {
        const emitter = collector.emitter(...args)
        return {
          record(event: DiagnosticEvent) {
            if (
              fault === 'engineering_record' &&
              (event.source === 'observer' || event.stage === 'settlement')
            )
              throw new Error('controlled engineering record failure')
            return emitter.record(event)
          },
          close() {
            emitter.close()
            if (fault === 'engineering_close')
              throw new Error('controlled engineering close failure')
          },
        }
      },
    }
    runtime = createModelRuntime({
      ...world.construction,
      ...referencePorts(world.host, calls),
      calls,
      sessions: {
        async bind() {
          return { binding }
        },
      },
      ...(fault === 'absent' ? {} : { diagnosticCollector }),
      transport: {
        ...world.construction.transport,
        acquire(...args) {
          const acquired = world.construction.transport.acquire(...args)
          if (!('lease' in acquired)) return acquired
          return {
            lease: {
              ...acquired.lease,
              transport: {
                ...acquired.lease.transport,
                async send(...sendArgs) {
                  sendAttempts++
                  return kind === 'settlement'
                    ? failure
                    : await acquired.lease.transport.send(...sendArgs)
                },
              },
            },
          }
        },
      },
      policy: {
        ...world.construction.policy,
        diagnostic(event) {
          if (event.kind === 'model_observer.delivery') {
            legacy.push(event.kind)
            if (fault === 'legacy_throw') throw new Error('controlled legacy observer failure')
            if (fault === 'legacy_reject')
              return Promise.reject(new Error('controlled non-synchronous observer diagnostic'))
          }
          if (event.kind.startsWith('model_runtime.diagnostic_')) reports.push(event.kind)
        },
      },
      diagnostic(event) {
        legacy.push(event.kind)
        if (fault === 'legacy_throw') throw new Error('controlled legacy settlement failure')
        if (fault === 'legacy_reject')
          return Promise.reject(new Error('controlled non-synchronous settlement diagnostic'))
      },
    })
    const opened = await runtime.service.openCall(
      world.request(
        `p6_d1_${kind}_${fault}`,
        kind === 'observer'
          ? {
              observer: {
                session: world.host.session,
                endpoint: {
                  open() {
                    throw new Error('trusted authorization owns receiver creation')
                  },
                },
                observer_max_buffered_events: 8,
                observer_max_buffered_bytes: 100000,
              },
            }
          : {},
      ),
    )
    if (!('ref' in opened)) throw new Error(`original open failed ${JSON.stringify(opened)}`)
    const result = await runtime.service.dispatch(opened.ref)
    const entries = await world.entries()
    const logKinds = kinds(entries)
    const responses = entries.flatMap(entry => {
      const value = payload(entry)
      return 'ok' in judgeModelResponse(value) ? [value] : []
    })
    work({
      legacy,
      engineering,
      reports,
      result,
      logKinds,
      responses,
      sendAttempts,
      receiverStops,
      active: owner.active,
    })
  } finally {
    if (runtime !== undefined) expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    expect(owner.active).toBe(0)
    expect(await collector.close()).toEqual({ complete: true, coverage: 'complete' })
    await world.host.close()
  }
}

describe('original service diagnostic boundaries over actual runtime and SQL', () => {
  it.each([
    'none',
    'legacy_throw',
    'legacy_reject',
    'engineering_record',
    'engineering_close',
    'absent',
  ] satisfies readonly Fault[])(
    'observer faults %s preserve business facts and ownership',
    async fault => {
      await withDiagnosticHostWithoutFailureReader('observer', fault, observed => {
        expect(observed.result).toHaveProperty('replyPending')
        expect(observed.logKinds).toEqual([
          'model_selection_changed',
          'model_call_created',
          'model_call_dispatched',
          'model_call_opened',
          'model_call_reply_ready',
        ])
        expect(observed.sendAttempts).toBe(1)
        expect(observed.receiverStops).toBe(1)
        expect(observed.active).toBe(0)
        expect(observed.legacy.length).toBeGreaterThan(0)
        if (fault === 'legacy_throw' || fault === 'legacy_reject')
          expect(observed.legacy).toEqual(['model_observer.delivery'])
        if (
          fault === 'legacy_throw' ||
          fault === 'legacy_reject' ||
          fault === 'engineering_record' ||
          fault === 'engineering_close'
        )
          expect(observed.reports).toContain('model_runtime.diagnostic_sink_failed')
        if (fault !== 'engineering_record' && fault !== 'absent') {
          const record = observed.engineering.find(record => record.source === 'observer')
          expect(record).toMatchObject({
            stage: 'observer',
            outcome: 'failed',
            facts: { kind: 'observer', reason: 'consumer_failed' },
          })
          expect(record?.association).toMatchObject({
            call: 'a22-call-1',
            dispatch: 1,
            session: expect.any(String),
            executionId: expect.any(String),
            causedBy: { collectorId: 'collector-1', sequence: expect.any(String) },
          })
        }
      })
    },
  )
  it.each([
    'none',
    'legacy_throw',
    'legacy_reject',
    'engineering_record',
    'engineering_close',
    'absent',
  ] satisfies readonly Fault[])(
    'settlement faults %s preserve business facts and ownership',
    async fault => {
      await withDiagnosticHostWithoutFailureReader('settlement', fault, observed => {
        expect(observed.result).toEqual({ unavailable: true })
        expect(observed.responses).toHaveLength(1)
        expect(observed.responses[0]).toMatchObject({
          id: 'a22-response-1',
          outcome: 'failed',
          failure: { cause: 'upstream_unavailable' },
        })
        expect(observed.sendAttempts).toBe(1)
        expect(observed.active).toBe(0)
        expect(observed.logKinds).toContain('model_call_dispatched')
        expect(observed.legacy.length).toBeGreaterThan(0)
        if (fault === 'legacy_throw' || fault === 'legacy_reject')
          expect(observed.legacy).toHaveLength(1)
        if (fault !== 'engineering_record' && fault !== 'absent') {
          const records = observed.engineering.filter(record => record.stage === 'settlement')
          expect(records.length).toBeGreaterThan(0)
          expect(records[0]?.association).toMatchObject({
            call: 'a22-call-1',
            dispatch: 1,
            response: 'a22-response-1',
            session: expect.any(String),
            executionId: expect.any(String),
          })
        }
      })
    },
  )
})
