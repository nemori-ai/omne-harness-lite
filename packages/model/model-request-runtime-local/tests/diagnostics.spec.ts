import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDiagnosticCollector } from '../src/diagnostics.ts'
import type { DiagnosticCollectorConfig, DiagnosticJournalStore, DiagnosticOutputSink, DiagnosticRecord, DiagnosticScope } from '../src/diagnostics-types.ts'
import type { DiagnosticEvent } from '@omne-harness-lite/model-request-runtime'

const local: DiagnosticScope = { kind: 'local' }
const tenant: DiagnosticScope = {
  kind: 'tenant',
  tenant: unwrap(parseTenantId({ organization: 'tenant-org', account: 'tenant-a' })),
}
const otherTenant: DiagnosticScope = {
  kind: 'tenant',
  tenant: unwrap(parseTenantId({ organization: 'tenant-org', account: 'tenant-b' })),
}
const event: DiagnosticEvent = {
  source: 'transport',
  stage: 'send',
  outcome: 'completed',
  facts: { kind: 'transport', httpStatus: 503, touch: 'touched' },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

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
    queueMaxRecords: options.queueMaxRecords ?? 4,
    queueMaxBytes: 8192,
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

describe('diagnostic collector', () => {
  it('keeps actual observer stage and reason values and rejects invented ones', async () => {
    const { collector, records } = fixture()
    expect(
      collector.record(
        {
          source: 'observer',
          stage: 'observer',
          outcome: 'rejected',
          facts: {
            kind: 'observer',
            observerStage: 'offer',
            reason: 'observer_scope_mismatch',
            position: new LosslessNumber('9007199254740993'),
            bufferedEvents: 0,
            bufferedBytes: 0,
          },
        },
        local,
      ),
    ).toHaveProperty('recorded')
    expect(
      collector.record(
        {
          source: 'observer',
          stage: 'observer',
          outcome: 'rejected',
          facts: { kind: 'observer', observerStage: 'snapshot', reason: 'scope_mismatch' },
        } as unknown as DiagnosticEvent,
        local,
      ),
    ).toEqual({ dropped: 'invalid' })
    await collector.close()
    expect(records).toHaveLength(1)
    const metrics = collector.metrics(local)
    if ('rejected' in metrics) throw new Error('local metrics unavailable')
    expect(metrics.observerRejections).toEqual([
      { stage: 'offer', reason: 'observer_scope_mismatch', count: 1 },
    ])
  })

  it('accepts the exact truncated outcome but rejects an unlisted response outcome', async () => {
    const { collector, records } = fixture()
    const truncated: DiagnosticEvent = {
      source: 'invocation',
      stage: 'reply_handoff',
      outcome: 'completed',
      facts: { kind: 'progress', responseOutcome: 'truncated' },
    }
    expect(collector.record(truncated, local)).toHaveProperty('recorded')
    expect(
      collector.record(
        {
          ...truncated,
          facts: { kind: 'progress', responseOutcome: 'mystery' },
        } as unknown as DiagnosticEvent,
        local,
      ),
    ).toEqual({ dropped: 'invalid' })
    await collector.close()
    expect(records[0]?.facts).toEqual({ kind: 'progress', responseOutcome: 'truncated' })
  })

  it('preserves an independently sourced HTTP 503 and rejects unlisted raw details before append', async () => {
    const { collector, records } = fixture()
    expect(collector.record(event, local)).toEqual({
      recorded: { collectorId: 'collector-1', sequence: '1' },
    })
    let getterCalled = false
    const invalid = {
      ...event,
      facts: {
        kind: 'transport',
        httpStatus: 503,
        get raw() {
          getterCalled = true
          return 'credential-503'
        },
      },
    }
    expect(collector.record(invalid as DiagnosticEvent, local)).toEqual({ dropped: 'invalid' })
    expect(getterCalled).toBe(false)
    expect(await collector.close()).toMatchObject({ complete: true })
    expect(records).toHaveLength(1)
    expect(records[0]?.facts).toEqual({ kind: 'transport', httpStatus: 503, touch: 'touched' })
    expect(JSON.stringify(records)).not.toContain('credential-503')
    expect(collector.health()).toMatchObject({
      acceptedSequence: '1',
      writtenSequence: '1',
      flushedSequence: '1',
      invalidRecords: 1,
      coverage: 'degraded',
    })
  })

  it('keeps two interleaved emitters and explicit causality separate', async () => {
    const { collector, records } = fixture({ scope: tenant })
    const a = collector.emitter(tenant, {
      executionId: 'exec-a',
      session: 'session-a',
      call: 'call-1',
      dispatch: 1,
    })
    const b = collector.emitter(tenant, {
      executionId: 'exec-b',
      session: 'session-b',
      call: 'call-1',
      dispatch: 1,
    })
    const a1 = a.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'started',
      facts: { kind: 'decision' },
    })
    b.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'completed',
      facts: { kind: 'decision' },
    })
    a.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'completed',
      facts: { kind: 'decision' },
    })
    if (!('recorded' in a1)) throw new Error('first event not admitted')
    const next = collector.emitter(tenant, { executionId: 'exec-a-next', causedBy: a1.recorded })
    next.record({
      source: 'runtime',
      stage: 'retry',
      outcome: 'accepted',
      facts: { kind: 'progress', retry: 'again' },
    })
    a.close()
    b.close()
    next.close()
    await collector.close()
    expect(records.map(record => record.association?.executionId)).toEqual([
      'exec-a',
      'exec-b',
      'exec-a',
      'exec-a-next',
    ])
    expect(records[3]?.association?.causedBy).toEqual({ collectorId: 'collector-1', sequence: '1' })
    expect(records[1]?.association?.session).toBe('session-b')
    expect(records[2]?.association?.session).toBe('session-a')
  })

  it('rejects wrong tenant and read scope before touching the store', async () => {
    const fixtureValue = fixture({ scope: tenant })
    const { collector } = fixtureValue
    expect(collector.record(event, local)).toEqual({ dropped: 'invalid' })
    expect(() => collector.emitter(local, { executionId: 'wrong' })).toThrow()
    expect(await collector.query({ scope: local, limit: 1, maxBytes: 4096 })).toEqual({
      rejected: 'forbidden',
    })
    expect(
      await collector.exportPage(
        {
          scope: otherTenant,
          limit: 1,
          maxBytes: 4096,
        },
        { maxRecords: 1, maxBytes: 4096 },
      ),
    ).toEqual({ rejected: 'forbidden' })
    expect(
      await collector.exportPage(
        { scope: tenant, limit: 1, maxBytes: 4096 },
        { maxRecords: 4, maxBytes: 4096 },
      ),
    ).toEqual({ rejected: 'invalidInput' })
    expect(fixtureValue.queryCalls).toBe(0)
    expect(fixtureValue.exportCalls).toBe(0)
    expect(collector.metrics(local)).toEqual({ rejected: 'forbidden' })
    await collector.close()
  })

  it('copies a validated TenantId pair and compares its two components by value', async () => {
    const supplied: DiagnosticScope = { kind: 'tenant', tenant: { ...tenant.tenant } }
    const { collector, records } = fixture({ scope: supplied })
    if (supplied.kind !== 'tenant' || otherTenant.kind !== 'tenant') throw new Error('fixture')
    Reflect.set(supplied.tenant, 'account', otherTenant.tenant.account)
    expect(
      collector.record(event, { kind: 'tenant', tenant: { ...tenant.tenant } }),
    ).toHaveProperty('recorded')
    expect(collector.record(event, otherTenant)).toEqual({ dropped: 'invalid' })
    expect(collector.metrics(otherTenant)).toEqual({ rejected: 'forbidden' })
    await collector.close()
    expect(records[0]?.scope).toEqual(tenant)
  })

  it('allows zero only as the fixed through watermark of an empty journal', async () => {
    const empty = { collectorId: 'collector-1', sequence: '0' }
    const { collector, config } = fixture({
      query: async query => ({
        page: { records: [], through: query.through ?? empty, coverage: 'complete' },
      }),
    })
    expect(
      await collector.query({ scope: local, limit: 1, maxBytes: 4096, through: empty }),
    ).toEqual({ page: { records: [], through: empty, coverage: 'complete' } })
    expect(await collector.query({ scope: local, limit: 1, maxBytes: 4096, after: empty })).toEqual(
      { rejected: 'invalidInput' },
    )
    expect(
      await collector.query({
        scope: local,
        limit: 1,
        maxBytes: 4096,
        through: { collectorId: 'other', sequence: '0' },
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      await collector.query({ scope: tenant, limit: 1, maxBytes: 4096, through: empty }),
    ).toEqual({ rejected: 'forbidden' })
    expect(() => collector.emitter(local, { executionId: 'x', causedBy: empty })).toThrow()
    expect(config.store).toBeDefined()
    await collector.close()
  })

  it('keeps pending writes owned and bounds the queue by count', async () => {
    const hold = deferred<'written'>()
    let scheduleCount = 0
    const { collector, records } = fixture({
      queueMaxRecords: 1,
      append: () => hold.promise,
      schedule(ms, callback) {
        scheduleCount++
        if (scheduleCount === 1) {
          queueMicrotask(callback)
          return { cancel() {} }
        }
        const timer = setTimeout(callback, ms)
        return {
          cancel() {
            clearTimeout(timer)
          },
        }
      },
    })
    expect(collector.record(event, local)).toHaveProperty('recorded')
    expect(collector.record(event, local)).toEqual({ dropped: 'queue_full' })
    expect(collector.health()).toMatchObject({
      acceptedSequence: '1',
      queuedRecords: 1,
      dropped: 1,
      coverage: 'degraded',
    })
    const firstClose = await collector.close()
    expect(firstClose).toHaveProperty('incomplete')
    expect(collector.health()).toMatchObject({ writeState: 'closing', queuedRecords: 1 })
    hold.resolve('written')
    await Promise.resolve()
    await Promise.resolve()
    expect(await collector.close()).toMatchObject({ complete: true })
    expect(records).toHaveLength(1)
    expect(records[0]?.sequence).toBe('1')
  })

  it('omits unknown clock values and exposes metric overflow without fabricating zero', async () => {
    const badClock = fixture({ wallClock: () => new Date(NaN), monotonicClock: () => NaN })
    badClock.collector.record(event, local)
    await badClock.collector.close()
    expect(badClock.records[0]).not.toHaveProperty('observedAt')
    expect(badClock.records[0]).not.toHaveProperty('elapsedMs')
    expect(badClock.collector.health()).toMatchObject({ clockFailures: 4, coverage: 'degraded' })

    let now = 0
    const overflow = fixture({ monotonicClock: () => now })
    const emitter = overflow.collector.emitter(local, { executionId: 'duration' })
    emitter.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'started',
      facts: { kind: 'decision' },
    })
    now = 1e18
    emitter.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'completed',
      facts: { kind: 'decision' },
    })
    const metrics = overflow.collector.metrics(local)
    expect(metrics).toHaveProperty('stageDurations.0.sum', 'unknown')
    expect(overflow.collector.health().coverage).toBe('degraded')
    await overflow.collector.close()

    let fractionalNow = 0.5
    const fractional = fixture({ monotonicClock: () => fractionalNow })
    const fractionalEmitter = fractional.collector.emitter(local, { executionId: 'fractional' })
    fractionalEmitter.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'started',
      facts: { kind: 'decision' },
    })
    fractionalNow = 1.75
    fractionalEmitter.record({
      source: 'runtime',
      stage: 'admission',
      outcome: 'completed',
      facts: { kind: 'decision' },
    })
    expect(fractional.collector.metrics(local)).toHaveProperty('stageDurations.0.sum', 1.25)
    await fractional.collector.close()
  })

  it('rejects illegal construction limits instead of creating an unbounded collector', () => {
    const valid = fixture()
    expect(valid.collector.health().writeState).toBe('open')
    expect(valid.collector.health()).toMatchObject({
      retainedRecords: 0,
      expiredBytes: 0,
      evictedBytes: 0,
    })
    expect(() => fixture({ maxFieldBytes: 0 })).toThrow('invalid diagnostic configuration')
  })

  it('snapshots capacity and rejects an accessor configuration without reading it', async () => {
    const held = deferred<'written'>()
    const { collector, config } = fixture({ queueMaxRecords: 1, append: () => held.promise })
    expect(Reflect.set(config, 'queueMaxRecords', 100)).toBe(true)
    expect(collector.record(event, local)).toHaveProperty('recorded')
    expect(collector.record(event, local)).toEqual({ dropped: 'queue_full' })
    held.resolve('written')

    let read = false
    const bad = { ...config }
    Object.defineProperty(bad, 'maxRecordBytes', {
      enumerable: true,
      get() {
        read = true
        return 4096
      },
    })
    expect(() => createDiagnosticCollector(bad)).toThrow('invalid diagnostic configuration')
    expect(read).toBe(false)
    await collector.close()
  })

  it('isolates a failing synchronous sink from the journal and its recorded fact', async () => {
    const { collector, records } = fixture({
      sink: {
        mode: 'sync',
        record() {
          throw new Error('private error text')
        },
      },
    })
    expect(collector.record(event, local)).toHaveProperty('recorded')
    expect(await collector.close()).toMatchObject({ complete: true, coverage: 'degraded' })
    expect(records).toHaveLength(1)
    expect(collector.health()).toMatchObject({ sinkFailures: 1, coverage: 'degraded' })
    expect(JSON.stringify(records)).not.toContain('private error text')
  })

  it('keeps an unresolved async sink owned, bounds its waiting queue and allows journal progress', async () => {
    const pending = deferred<void>()
    let delivered = 0
    const fixtureValue = fixture({
      sink: {
        mode: 'async',
        maxPending: 1,
        maxQueuedRecords: 1,
        maxQueuedBytes: 4096,
        record() {
          delivered++
          return delivered === 1 ? pending.promise : Promise.resolve()
        },
      },
      schedule(_ms, callback) {
        queueMicrotask(callback)
        return { cancel() {} }
      },
    })
    const { collector, records } = fixtureValue
    collector.record(event, local)
    collector.record(event, local)
    collector.record(event, local)
    expect(collector.health()).toMatchObject({
      pendingSinks: 2,
      sinkDropped: 1,
      coverage: 'degraded',
    })
    expect(await collector.close()).toHaveProperty('incomplete')
    pending.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(records).toHaveLength(3)
    expect(delivered).toBe(2)
  })

  it('preserves exact JSON-number identities, usage and cost beyond JS safe integers', async () => {
    const { collector, records } = fixture()
    const large = new LosslessNumber('9007199254740993')
    const exactCost = new LosslessNumber('0.000000000000000001')
    const settlement: DiagnosticEvent = {
      source: 'runtime',
      stage: 'settlement',
      outcome: 'completed',
      facts: {
        kind: 'progress',
        settlement: 'committed',
        submissions: large,
        tailConflicts: large,
        inputTokens: large,
        costUsd: exactCost,
      },
    }
    expect(
      collector.record(settlement, local, {
        executionId: 'exact',
        attempt: large,
        dispatch: large,
      }),
    ).toHaveProperty('recorded')
    const inexact: unknown = {
      ...settlement,
      facts: { kind: 'progress', settlement: 'committed', submissions: Number('9007199254740993') },
    }
    expect(collector.record(inexact as DiagnosticEvent, local)).toEqual({ dropped: 'invalid' })
    expect(
      collector.record(settlement, local, {
        executionId: 'rounded',
        dispatch: Number('9007199254740993'),
      }),
    ).toEqual({ dropped: 'invalid' })
    await collector.close()
    expect(records[0]?.facts).toEqual(settlement.facts)
    const encoded = writeJsonLossless(records[0])
    expect(encoded).toContain('"dispatch":9007199254740993')
    expect(encoded).toContain('"attempt":9007199254740993')
    expect(encoded).toContain('"submissions":9007199254740993')
    expect(encoded).toContain('"costUsd":0.000000000000000001')
  })

  it('bounds category-only fallback reports and isolates a failing reporter', async () => {
    const categories: string[] = []
    const { collector } = fixture({
      stderr(category) {
        categories.push(category)
      },
    })
    for (let index = 0; index < 4; index++) {
      const invalid: unknown = { ...event, facts: { kind: 'transport', raw: 'secret' } }
      expect(collector.record(invalid as DiagnosticEvent, local)).toEqual({ dropped: 'invalid' })
    }
    expect(categories).toEqual(['invalid', 'invalid', 'invalid'])
    await collector.close()

    const broken = fixture({
      stderr() {
        throw new Error('private stderr failure')
      },
    })
    const invalid: unknown = { ...event, facts: { kind: 'transport', raw: 'secret' } }
    broken.collector.record(invalid as DiagnosticEvent, local)
    expect(broken.collector.health()).toMatchObject({ stderrFailures: 1, coverage: 'degraded' })
    await broken.collector.close()
  })
})
