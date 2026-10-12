import { setImmediate } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type {
  DiagnosticAssociation,
  DiagnosticBinding,
  DiagnosticEvent,
  DiagnosticScope,
} from '@omne-harness-lite/model-request-runtime'
import {
  createDiagnosticCollector,
  type DiagnosticCloseResult,
  type DiagnosticCollectorConfig,
  type DiagnosticExportLimits,
  type DiagnosticExportResult,
  type DiagnosticHealth,
  type DiagnosticJournalStore,
  type DiagnosticMetrics,
  type DiagnosticOutputSink,
  type DiagnosticQuery,
  type DiagnosticQueryResult,
  type DiagnosticRecord,
  type DiagnosticReportCategory,
} from '@omne-harness-lite/model-request-runtime-local'

const scope: DiagnosticScope = { kind: 'local' }
const collectorId = 'collector-boundaries'
const observedAt = '2026-09-28T00:00:00.000Z'
const reference = (sequence: string) => ({ collectorId, sequence })
const encoded = (record: DiagnosticRecord) => `${writeJsonLossless(record)}\n`
const bytes = (record: DiagnosticRecord) => Buffer.byteLength(encoded(record))

function transport(): DiagnosticEvent {
  return {
    source: 'transport',
    stage: 'send',
    outcome: 'completed',
    facts: { kind: 'transport', httpStatus: 503, touch: 'touched' },
  }
}

function expectedRecord(
  event: DiagnosticEvent,
  sequence = '1',
  association?: DiagnosticAssociation,
): DiagnosticRecord {
  return {
    ...event,
    format: 'model-diagnostics/1',
    collectorId,
    sequence,
    scope: { kind: 'local' },
    ...(association ? { association } : {}),
    observedAt,
    elapsedMs: 0,
  }
}

const seed1 = expectedRecord(transport())
const seed2 = expectedRecord(transport(), '2')
const seed3 = expectedRecord(transport(), '3')
const emptyPage: DiagnosticQueryResult = {
  page: { records: [], through: reference('0'), coverage: 'complete' },
}
const exportQuery: DiagnosticQuery = {
  scope: { kind: 'local' },
  limit: 1,
  maxBytes: 4096,
  through: reference('2'),
}
const exportLimits: DiagnosticExportLimits = { maxRecords: 1, maxBytes: 4096 }

const H: DiagnosticHealth = {
  collectorId,
  writeState: 'closed',
  queuedRecords: 0,
  queuedBytes: 0,
  pendingWrites: 0,
  pendingQueries: 0,
  pendingQueryIo: 0,
  openQueryHandles: 0,
  pendingQueryCloses: 0,
  timedOutQueries: 0,
  queryCloseFailures: 0,
  pendingSinks: 0,
  sinkDropped: 0,
  accepted: 0,
  written: 0,
  invalidRecords: 0,
  unsupportedEvents: 0,
  dropped: 0,
  oversize: 0,
  expired: 0,
  expiredBytes: 0,
  evicted: 0,
  evictedBytes: 0,
  writeFailures: 0,
  flushFailures: 0,
  queryFailures: 0,
  exportFailures: 0,
  clockFailures: 0,
  sinkFailures: 0,
  stderrFailures: 0,
  retainedBytes: 0,
  retainedRecords: 0,
  retainedSegments: 0,
  coverage: 'complete',
}
const M: DiagnosticMetrics = {
  collectorId,
  startedAt: observedAt,
  stageEvents: [],
  stageDurations: [],
  observerRejections: [],
  dropped: {
    invalid: 0,
    unsupported: 0,
    oversize: 0,
    queue_full: 0,
    closed: 0,
    retention: 0,
    io_failed: 0,
  },
  failures: { write: 0, flush: 0, query: 0, export: 0, clock: 0, sink: 0, stderr: 0 },
  queueRecords: 0,
  queueBytes: 0,
}
const I = {
  pendingWrites: 0,
  pendingSinks: 0,
  pendingQueries: 0,
  pendingQueryIo: 0,
  openQueryHandles: 0,
  pendingQueryCloses: 0,
  queryCloseFailures: 0,
  flushFailed: false,
  resourcesOpen: true,
}

type ExportBehavior =
  { kind: 'answer'; answer: DiagnosticExportResult } | { kind: 'reject' } | { kind: 'throw' }
type QueryBehavior =
  | { kind: 'immediate' }
  | { kind: 'held'; gate: ReturnType<typeof Promise.withResolvers<DiagnosticQueryResult>> }

class Journal implements DiagnosticJournalStore {
  readonly records: DiagnosticRecord[] = []
  readonly expired: DiagnosticRecord[] = []
  readonly appends: DiagnosticRecord[] = []
  readonly queries: DiagnosticQuery[] = []
  readonly exports: { query: DiagnosticQuery; limits: DiagnosticExportLimits }[] = []
  readonly effects: string[] = []
  resourcesOpen = true
  pendingQueries = 0
  pendingQueryIo = 0
  openQueryHandles = 0
  pendingQueryCloses = 0
  activeIo = 0
  closeCalls = 0
  flushCalls = 0

  constructor(
    readonly exportBehavior: ExportBehavior = {
      kind: 'answer',
      answer: { rejected: 'unavailable' },
    },
    readonly queryBehavior: QueryBehavior = { kind: 'immediate' },
    readonly failure: 'none' | 'flush' | 'first-close' = 'none',
  ) {}

  expireBefore(sequence: string) {
    this.expired.push(...this.records.filter(record => BigInt(record.sequence) < BigInt(sequence)))
    const retained = this.records.filter(record => BigInt(record.sequence) >= BigInt(sequence))
    this.records.splice(0, this.records.length, ...retained)
  }

  async append(record: DiagnosticRecord): Promise<'written'> {
    this.appends.push(record)
    this.records.push(record)
    this.effects.push(`append${record.sequence} written`)
    return 'written'
  }

  async flush(): Promise<void> {
    this.flushCalls++
    if (this.failure === 'flush') {
      this.effects.push('flush rejected')
      throw new Error('private-flush-error')
    }
    this.effects.push('flush fulfilled')
  }

  async query(query: DiagnosticQuery): Promise<DiagnosticQueryResult> {
    this.queries.push(query)
    if (this.queryBehavior.kind === 'immediate') return emptyPage
    this.effects.push('query opens actual handle')
    this.pendingQueries++
    this.pendingQueryIo++
    this.openQueryHandles++
    this.activeIo++
    try {
      return await this.queryBehavior.gate.promise
    } finally {
      this.pendingQueries--
      this.pendingQueryIo--
      this.openQueryHandles--
      this.pendingQueryCloses = 0
      this.activeIo--
      this.effects.push('query settles and actual handle closes')
    }
  }

  exportPage(
    query: DiagnosticQuery,
    limits: DiagnosticExportLimits,
  ): Promise<DiagnosticExportResult> {
    this.exports.push({ query, limits })
    this.effects.push('exportPage')
    switch (this.exportBehavior.kind) {
      case 'answer':
        return Promise.resolve(this.exportBehavior.answer)
      case 'reject':
        return Promise.reject(new Error('private-export-error'))
      case 'throw':
        throw new Error('private-export-throw')
    }
  }

  async close(): Promise<DiagnosticCloseResult> {
    this.closeCalls++
    if (this.failure === 'first-close' && this.closeCalls === 1) {
      this.effects.push('store.close rejects retaining resources')
      throw new Error('private-close-error')
    }
    if (this.openQueryHandles > 0) {
      this.pendingQueryCloses = this.openQueryHandles
      this.effects.push('store.close incomplete')
      return {
        incomplete: {
          pendingWrites: 0,
          pendingSinks: 0,
          pendingQueries: this.pendingQueries,
          pendingQueryIo: this.pendingQueryIo,
          openQueryHandles: this.openQueryHandles,
          pendingQueryCloses: this.pendingQueryCloses,
          queryCloseFailures: 0,
          flushFailed: false,
          resourcesOpen: this.resourcesOpen,
        },
        coverage: 'complete',
      }
    }
    this.resourcesOpen = false
    this.effects.push('store.close complete')
    return { complete: true, coverage: 'complete' }
  }

  health(): ReturnType<DiagnosticJournalStore['health']> {
    return {
      pendingQueries: this.pendingQueries,
      pendingQueryIo: this.pendingQueryIo,
      openQueryHandles: this.openQueryHandles,
      pendingQueryCloses: this.pendingQueryCloses,
      timedOutQueries: 0,
      queryCloseFailures: 0,
      expired: this.expired.length,
      expiredBytes: this.expired.reduce((sum, record) => sum + bytes(record), 0),
      evicted: 0,
      evictedBytes: 0,
      retainedBytes: this.records.reduce((sum, record) => sum + bytes(record), 0),
      retainedRecords: this.records.length,
      retainedSegments: this.records.length === 0 ? 0 : 1,
      ...(this.records[0] ? { oldestAvailableSequence: this.records[0].sequence } : {}),
      coverage: this.expired.length === 0 ? 'complete' : 'degraded',
    }
  }
}

function fixture(journal = new Journal(), sink?: DiagnosticOutputSink) {
  const schedules: {
    durationMs: number
    fired: boolean
    cancelled: boolean
    fire: () => void
    cancel: () => void
  }[] = []
  const reports: { category: DiagnosticReportCategory; count: number | 'unknown' }[] = []
  const settled: Promise<PromiseSettledResult<unknown>[]>[] = []
  let closeStarted = false
  const config: DiagnosticCollectorConfig = {
    collectorId,
    scope,
    maxRecordBytes: 4096,
    maxFieldBytes: 64,
    queueMaxRecords: 64,
    queueMaxBytes: 65536,
    segmentMaxBytes: 65536,
    retainedMaxBytes: 131072,
    retainedMaxSegments: 3,
    retentionMs: 60000,
    queryMaxRecords: 8,
    queryMaxBytes: 8192,
    queryScanMaxBytes: 8192,
    queryConcurrency: 1,
    queryMaxDurationMs: 500,
    exportMaxRecords: 8,
    exportMaxBytes: 8192,
    closeWaitMs: 500,
    stderrMaxReports: 32,
    wallClock: () => new Date(observedAt),
    monotonicClock: () => 10,
    schedule(durationMs, callback) {
      const lease = {
        durationMs,
        fired: false,
        cancelled: false,
        fire() {
          expect(lease.cancelled).toBe(false)
          lease.fired = true
          journal.effects.push('bound fires')
          callback()
        },
        cancel() {
          lease.cancelled = true
        },
      }
      schedules.push(lease)
      return lease
    },
    store: journal,
    ...(sink ? { sink } : {}),
    stderr(category, count) {
      reports.push({ category, count })
    },
  }
  const collector = createDiagnosticCollector(config)
  function track<T>(promise: Promise<T>): Promise<T> {
    settled.push(Promise.allSettled([promise]))
    return promise
  }
  function close() {
    closeStarted = true
    return track(collector.close())
  }
  async function cleanup() {
    if (journal.queryBehavior.kind === 'held') journal.queryBehavior.gate.resolve(emptyPage)
    await setImmediate()
    await Promise.all(settled)
    if (!closeStarted || journal.resourcesOpen) await close()
    await setImmediate()
    const outcomes = (await Promise.all(settled)).flat()
    for (const lease of schedules) lease.cancel()
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toStrictEqual([])
    expect(journal.activeIo).toBe(0)
    expect(journal.pendingQueries).toBe(0)
    expect(journal.pendingQueryIo).toBe(0)
    expect(journal.openQueryHandles).toBe(0)
    expect(journal.pendingQueryCloses).toBe(0)
    expect(journal.resourcesOpen).toBe(false)
    expect(collector.health().pendingSinks).toBe(0)
    expect(schedules.every(lease => lease.cancelled)).toBe(true)
  }
  return {
    collector,
    journal,
    reports,
    schedules,
    track,
    close,
    cleanup,
    leases: () =>
      schedules.map(({ durationMs, fired, cancelled }) => ({ durationMs, fired, cancelled })),
  }
}

const closedLease = { durationMs: 500, fired: false, cancelled: true }

function admittedHealth(record: DiagnosticRecord): DiagnosticHealth {
  return {
    ...H,
    accepted: 1,
    written: 1,
    acceptedSequence: '1',
    writtenSequence: '1',
    flushedSequence: '1',
    retainedRecords: 1,
    retainedSegments: 1,
    oldestAvailableSequence: '1',
    retainedBytes: bytes(record),
  }
}

function eventMetrics(event: DiagnosticEvent, count = 1): DiagnosticMetrics {
  return {
    ...M,
    stageEvents: [{ source: event.source, stage: event.stage, outcome: event.outcome, count }],
  }
}

function binding(): DiagnosticBinding {
  return {
    profile: 'profile-one',
    implementation: 'fixture',
    implementationRevision: 'impl-v1',
    modelId: 'teaching/model',
    definitionRevision: 'definition-v1',
    configurationRevision: 'config-v1',
  }
}

function boundEvent(value = binding()): DiagnosticEvent {
  return {
    source: 'runtime',
    stage: 'binding',
    outcome: 'accepted',
    binding: value,
    facts: { kind: 'decision' },
  }
}

async function checkAdmission(
  event: DiagnosticEvent,
  expected: DiagnosticRecord,
  mutateAfterAdmission?: () => void,
  association?: DiagnosticAssociation,
) {
  const f = fixture()
  try {
    expect(f.collector.record(event, scope, association)).toStrictEqual({
      recorded: reference('1'),
    })
    mutateAfterAdmission?.()
    expect(await f.close()).toStrictEqual({ complete: true, coverage: 'complete' })
    expect(f.journal.appends).toStrictEqual([expected])
    expect(f.journal.records).toStrictEqual([expected])
    expect(f.journal.appends.map(encoded)).toStrictEqual([encoded(expected)])
    expect(f.journal.appends.every(Object.isFrozen)).toBe(true)
    if (expected.binding)
      expect(f.journal.appends.every(record => Object.isFrozen(record.binding))).toBe(true)
    expect(f.collector.health()).toStrictEqual(admittedHealth(expected))
    expect(f.collector.metrics(scope)).toStrictEqual(eventMetrics(expected))
    expect(f.journal.effects).toStrictEqual([
      'append1 written',
      'flush fulfilled',
      'store.close complete',
    ])
    expect(f.journal.queries).toStrictEqual([])
    expect(f.journal.exports).toStrictEqual([])
    expect(f.reports).toStrictEqual([])
    expect(f.leases()).toStrictEqual([closedLease])
  } finally {
    await f.cleanup()
  }
}

async function checkInvalid(event: DiagnosticEvent) {
  const f = fixture()
  try {
    expect(f.collector.record(event, scope)).toStrictEqual({ dropped: 'invalid' })
    expect(await f.close()).toStrictEqual({ complete: true, coverage: 'degraded' })
    expect(f.journal.appends).toStrictEqual([])
    expect(f.journal.records).toStrictEqual([])
    expect(f.journal.queries).toStrictEqual([])
    expect(f.journal.exports).toStrictEqual([])
    expect(f.journal.effects).toStrictEqual(['flush fulfilled', 'store.close complete'])
    expect(f.reports).toStrictEqual([{ category: 'invalid', count: 1 }])
    expect(f.collector.health()).toStrictEqual({
      ...H,
      invalidRecords: 1,
      dropped: 1,
      coverage: 'degraded',
    })
    expect(f.collector.metrics(scope)).toStrictEqual({
      ...M,
      dropped: { ...M.dropped, invalid: 1 },
    })
    expect(f.leases()).toStrictEqual([closedLease])
  } finally {
    await f.cleanup()
  }
}

describe('collector lifecycle boundaries', () => {
  it('B01 copies and freezes all six binding identities', async () => {
    const callerBinding = binding()
    await checkAdmission(boundEvent(callerBinding), expectedRecord(boundEvent()), () => {
      for (const key of Object.keys(callerBinding)) Reflect.set(callerBinding, key, 'changed')
    })
  })

  it('B02 retains a binding with no optional fields', async () => {
    await checkAdmission(boundEvent({}), expectedRecord(boundEvent({})))
  })

  it('B03 rejects a binding identity beyond 64 bytes', async () => {
    const callerBinding = binding()
    Reflect.set(callerBinding, 'modelId', 'm'.repeat(65))
    await checkInvalid(boundEvent(callerBinding))
  })

  it('B04 rejects a binding accessor without invoking it', async () => {
    const callerBinding = binding()
    let getterCalls = 0
    Object.defineProperty(callerBinding, 'implementation', {
      enumerable: true,
      get() {
        getterCalls++
        return 'private-binding-text'
      },
    })
    await checkInvalid(boundEvent(callerBinding))
    expect(getterCalls).toBe(0)
  })
})

const registrationCases: {
  id: string
  event: () => DiagnosticEvent
  association?: DiagnosticAssociation
}[] = [
  {
    id: 'R01',
    event: () => ({
      source: 'runtime',
      stage: 'registration',
      outcome: 'accepted',
      facts: {
        kind: 'registration',
        phase: 'published',
        references: new LosslessNumber('9007199254740993'),
        executions: 0,
        cancellation: 'requested',
      },
    }),
    association: { executionId: 'registration-owner' },
  },
  {
    id: 'R02',
    event: () => ({
      source: 'runtime',
      stage: 'registration',
      outcome: 'accepted',
      facts: {
        kind: 'registration',
        phase: 'admitted',
        references: 0,
        executions: new LosslessNumber('9007199254740993'),
        cancellation: 'stopped',
      },
    }),
    association: { executionId: 'registration-owner' },
  },
  {
    id: 'R03',
    event: () => ({
      source: 'runtime',
      stage: 'retirement',
      outcome: 'waiting',
      facts: {
        kind: 'registration',
        phase: 'retiring',
        references: 3,
        executions: 2,
        cancellation: 'remaining_active',
      },
    }),
    association: { executionId: 'registration-owner' },
  },
  {
    id: 'R04',
    event: () => ({
      source: 'runtime',
      stage: 'retirement',
      outcome: 'completed',
      facts: {
        kind: 'registration',
        phase: 'closed',
        references: 0,
        executions: 0,
        cancellation: 'cleanup_failed',
      },
    }),
    association: { executionId: 'registration-owner' },
  },
  {
    id: 'R05',
    event: () => ({
      source: 'runtime',
      stage: 'registration',
      outcome: 'accepted',
      facts: { kind: 'registration' },
    }),
  },
]

describe('registration facts', () => {
  it.each(registrationCases)('$id retains exact registration facts and association', async test => {
    await checkAdmission(
      test.event(),
      expectedRecord(test.event(), '1', test.association),
      undefined,
      test.association,
    )
  })

  it.each([
    { id: 'R06', field: 'phase', value: 'released' },
    { id: 'R07', field: 'references', value: -1 },
    { id: 'R08', field: 'executions', value: 0.5 },
    { id: 'R09', field: 'cancellation', value: 'complete' },
  ])('$id rejects invalid $field without journal effects', async test => {
    const event: DiagnosticEvent = {
      source: 'runtime',
      stage: 'registration',
      outcome: 'accepted',
      facts: {
        kind: 'registration',
        phase: 'published',
        references: 0,
        executions: 0,
        cancellation: 'requested',
      },
    }
    Reflect.set(event.facts, test.field, test.value)
    await checkInvalid(event)
  })
})

const exportCases: {
  id: string
  query: DiagnosticQuery
  limits: DiagnosticExportLimits
  answer: DiagnosticExportResult
  behavior: 'answer' | 'reject' | 'throw'
  failed: boolean
  denied: boolean
  expired: boolean
}[] = [
  {
    id: 'E01',
    query: exportQuery,
    limits: exportLimits,
    answer: {
      page: {
        jsonl: encoded(seed1),
        next: reference('1'),
        through: reference('2'),
        coverage: 'complete',
      },
    },
    behavior: 'answer',
    failed: false,
    denied: false,
    expired: false,
  },
  {
    id: 'E02',
    query: {
      scope: { kind: 'local' },
      after: reference('1'),
      through: reference('3'),
      limit: 1,
      maxBytes: 4096,
    },
    limits: exportLimits,
    answer: { rejected: 'cursor_expired', earliest: reference('3'), coverage: 'degraded' },
    behavior: 'answer',
    failed: true,
    denied: false,
    expired: true,
  },
  {
    id: 'E03',
    query: exportQuery,
    limits: exportLimits,
    answer: { rejected: 'timeout' },
    behavior: 'answer',
    failed: true,
    denied: false,
    expired: false,
  },
  {
    id: 'E04',
    query: exportQuery,
    limits: exportLimits,
    answer: { rejected: 'unavailable' },
    behavior: 'reject',
    failed: true,
    denied: false,
    expired: false,
  },
  {
    id: 'E05',
    query: exportQuery,
    limits: exportLimits,
    answer: { rejected: 'unavailable' },
    behavior: 'throw',
    failed: true,
    denied: false,
    expired: false,
  },
  {
    id: 'E06',
    query: exportQuery,
    limits: { maxRecords: 9, maxBytes: 4096 },
    answer: { rejected: 'invalidInput' },
    behavior: 'answer',
    failed: false,
    denied: true,
    expired: false,
  },
  {
    id: 'E07',
    query: { ...exportQuery, limit: 9 },
    limits: exportLimits,
    answer: { rejected: 'invalidInput' },
    behavior: 'answer',
    failed: false,
    denied: true,
    expired: false,
  },
  {
    id: 'E08',
    query: {
      ...exportQuery,
      scope: {
        kind: 'tenant',
        tenant: unwrap(parseTenantId({ organization: 'tenant-org', account: 'tenant-a' })),
      },
    },
    limits: exportLimits,
    answer: { rejected: 'forbidden' },
    behavior: 'answer',
    failed: false,
    denied: true,
    expired: false,
  },
]

describe('bounded export', () => {
  it.each(exportCases)(
    '$id returns the complete export result and preserves journal state',
    async test => {
      const behavior: ExportBehavior =
        test.behavior === 'answer'
          ? { kind: 'answer', answer: structuredClone(test.answer) }
          : { kind: test.behavior }
      const journal = new Journal(behavior)
      journal.records.push(expectedRecord(transport()), expectedRecord(transport(), '2'))
      if (test.expired) {
        journal.records.push(expectedRecord(transport(), '3'))
        journal.expireBefore('3')
      }
      const f = fixture(journal)
      try {
        const result = await f.track(
          f.collector.exportPage(structuredClone(test.query), structuredClone(test.limits)),
        )
        expect(result).toStrictEqual(test.answer)
        expect(await f.close()).toStrictEqual({
          complete: true,
          coverage: test.failed ? 'degraded' : 'complete',
        })
        expect(journal.records).toStrictEqual(test.expired ? [seed3] : [seed1, seed2])
        expect(journal.expired).toStrictEqual(test.expired ? [seed1, seed2] : [])
        expect(journal.appends).toStrictEqual([])
        expect(journal.queries).toStrictEqual([])
        expect(journal.exports).toStrictEqual(
          test.denied ? [] : [{ query: test.query, limits: test.limits }],
        )
        expect(journal.effects).toStrictEqual([
          ...(test.denied ? [] : ['exportPage']),
          'flush fulfilled',
          'store.close complete',
        ])
        expect(f.reports).toStrictEqual(test.failed ? [{ category: 'export', count: 1 }] : [])
        expect(f.collector.health()).toStrictEqual({
          ...H,
          retainedRecords: test.expired ? 1 : 2,
          retainedSegments: 1,
          retainedBytes: test.expired ? bytes(seed3) : bytes(seed1) + bytes(seed2),
          oldestAvailableSequence: test.expired ? '3' : '1',
          expired: test.expired ? 2 : 0,
          expiredBytes: test.expired ? bytes(seed1) + bytes(seed2) : 0,
          exportFailures: test.failed ? 1 : 0,
          coverage: test.failed ? 'degraded' : 'complete',
        })
        expect(f.collector.metrics(scope)).toStrictEqual({
          ...M,
          failures: { ...M.failures, export: test.failed ? 1 : 0 },
        })
        expect(f.leases()).toStrictEqual([closedLease])
      } finally {
        await f.cleanup()
      }
    },
  )
})

describe('close ownership', () => {
  it('C01 retains both sinks across the close bound while the journal progresses', async () => {
    const held = Promise.withResolvers<void>()
    const journal = new Journal()
    const delivered: DiagnosticRecord[] = []
    let activeSinks = 0
    const sink: DiagnosticOutputSink = {
      mode: 'async',
      maxPending: 1,
      maxQueuedRecords: 2,
      maxQueuedBytes: 8192,
      async record(record) {
        delivered.push(record)
        activeSinks++
        journal.effects.push(`sink${record.sequence} enters`)
        try {
          if (record.sequence === '1') await held.promise
        } finally {
          activeSinks--
          journal.effects.push(`sink${record.sequence} settles`)
        }
      },
    }
    const f = fixture(journal, sink)
    const closingHealth: DiagnosticHealth = {
      ...H,
      writeState: 'closing',
      accepted: 2,
      written: 2,
      acceptedSequence: '2',
      writtenSequence: '2',
      retainedRecords: 2,
      retainedSegments: 1,
      retainedBytes: bytes(seed1) + bytes(seed2),
      oldestAvailableSequence: '1',
      pendingSinks: 2,
    }
    try {
      expect(f.collector.record(transport(), scope)).toStrictEqual({ recorded: reference('1') })
      expect(f.collector.record(transport(), scope)).toStrictEqual({ recorded: reference('2') })
      const firstClose = f.close()
      await setImmediate()
      expect(f.collector.health()).toStrictEqual(closingHealth)
      expect(f.collector.metrics(scope)).toStrictEqual(eventMetrics(transport(), 2))
      expect(journal.appends).toStrictEqual([seed1, seed2])
      expect(journal.records).toStrictEqual([seed1, seed2])
      expect(delivered).toStrictEqual([seed1])
      expect(activeSinks).toBe(1)
      expect(journal.effects).toStrictEqual(['sink1 enters', 'append1 written', 'append2 written'])
      expect(journal.flushCalls).toBe(0)
      expect(journal.closeCalls).toBe(0)
      expect(journal.resourcesOpen).toBe(true)
      expect(await f.track(f.collector.exportPage(exportQuery, exportLimits))).toStrictEqual({
        rejected: 'busy',
      })
      expect(journal.exports).toStrictEqual([])
      expect(f.reports).toStrictEqual([])
      expect(f.leases()).toStrictEqual([{ durationMs: 500, fired: false, cancelled: false }])
      const lease = f.schedules[0]
      if (!lease) throw new Error('C01 close did not register its bound')
      lease.fire()
      expect(await firstClose).toStrictEqual({
        incomplete: { ...I, pendingSinks: 2 },
        coverage: 'complete',
      })
      expect(f.collector.health()).toStrictEqual(closingHealth)
      expect(f.collector.metrics(scope)).toStrictEqual(eventMetrics(transport(), 2))
      expect(f.leases()).toStrictEqual([{ durationMs: 500, fired: true, cancelled: true }])
      expect(journal.effects).toStrictEqual([
        'sink1 enters',
        'append1 written',
        'append2 written',
        'bound fires',
      ])
      held.resolve()
      await setImmediate()
      expect(await f.close()).toStrictEqual({ complete: true, coverage: 'complete' })
      expect(f.collector.health()).toStrictEqual({
        ...closingHealth,
        writeState: 'closed',
        pendingSinks: 0,
        flushedSequence: '2',
      })
      expect(f.collector.metrics(scope)).toStrictEqual(eventMetrics(transport(), 2))
      expect(journal.appends).toStrictEqual([seed1, seed2])
      expect(journal.records).toStrictEqual([seed1, seed2])
      expect(delivered).toStrictEqual([seed1, seed2])
      expect(journal.queries).toStrictEqual([])
      expect(journal.exports).toStrictEqual([])
      expect(journal.effects).toStrictEqual([
        'sink1 enters',
        'append1 written',
        'append2 written',
        'bound fires',
        'sink1 settles',
        'sink2 enters',
        'sink2 settles',
        'flush fulfilled',
        'store.close complete',
      ])
      expect(journal.flushCalls).toBe(1)
      expect(journal.closeCalls).toBe(1)
      expect(journal.resourcesOpen).toBe(false)
      expect(activeSinks).toBe(0)
      expect(f.reports).toStrictEqual([])
      expect(f.leases()).toStrictEqual([{ durationMs: 500, fired: true, cancelled: true }])
    } finally {
      held.resolve()
      await f.cleanup()
      expect(activeSinks).toBe(0)
    }
  })

  it('C02 keeps the collector incomplete after flush rejection and physical store close', async () => {
    const journal = new Journal(undefined, undefined, 'flush')
    const f = fixture(journal)
    try {
      expect(f.collector.record(transport(), scope)).toStrictEqual({ recorded: reference('1') })
      const result = await f.close()
      expect(result).toStrictEqual({
        incomplete: { ...I, flushFailed: true },
        coverage: 'degraded',
      })
      expect(f.collector.health()).toStrictEqual({
        ...H,
        writeState: 'closing',
        accepted: 1,
        written: 1,
        acceptedSequence: '1',
        writtenSequence: '1',
        retainedRecords: 1,
        retainedSegments: 1,
        retainedBytes: bytes(seed1),
        oldestAvailableSequence: '1',
        flushFailures: 1,
        coverage: 'degraded',
      })
      expect(f.collector.metrics(scope)).toStrictEqual({
        ...eventMetrics(transport()),
        failures: { ...M.failures, flush: 1 },
      })
      expect(journal.records).toStrictEqual([seed1])
      expect(journal.appends).toStrictEqual([seed1])
      expect(journal.queries).toStrictEqual([])
      expect(journal.exports).toStrictEqual([])
      expect(journal.effects).toStrictEqual([
        'append1 written',
        'flush rejected',
        'store.close complete',
      ])
      expect(journal.resourcesOpen).toBe(false)
      expect(journal.flushCalls).toBe(1)
      expect(journal.closeCalls).toBe(1)
      expect(f.reports).toStrictEqual([{ category: 'flush', count: 1 }])
      expect(f.leases()).toStrictEqual([closedLease])
    } finally {
      await f.cleanup()
    }
  })

  it('C03 retries the same collector only after its held query releases the actual handle', async () => {
    const gate = Promise.withResolvers<DiagnosticQueryResult>()
    const journal = new Journal(undefined, { kind: 'held', gate })
    const f = fixture(journal)
    const query: DiagnosticQuery = { scope: { kind: 'local' }, limit: 1, maxBytes: 4096 }
    try {
      const queryResult = f.track(f.collector.query(structuredClone(query)))
      await setImmediate()
      expect(journal.queries).toStrictEqual([query])
      expect(journal.activeIo).toBe(1)
      expect(journal.openQueryHandles).toBe(1)
      expect(await f.close()).toStrictEqual({
        incomplete: {
          ...I,
          pendingQueries: 1,
          pendingQueryIo: 1,
          openQueryHandles: 1,
          pendingQueryCloses: 1,
        },
        coverage: 'degraded',
      })
      expect(f.collector.health()).toStrictEqual({
        ...H,
        writeState: 'closing',
        pendingQueries: 1,
        pendingQueryIo: 1,
        openQueryHandles: 1,
        pendingQueryCloses: 1,
        coverage: 'degraded',
      })
      expect(f.collector.metrics(scope)).toStrictEqual(M)
      expect(journal.effects).toStrictEqual([
        'query opens actual handle',
        'flush fulfilled',
        'store.close incomplete',
      ])
      expect(journal.resourcesOpen).toBe(true)
      expect(journal.activeIo).toBe(1)
      expect(journal.records).toStrictEqual([])
      expect(journal.appends).toStrictEqual([])
      expect(journal.exports).toStrictEqual([])
      expect(f.reports).toStrictEqual([])
      expect(f.leases()).toStrictEqual([closedLease])
      gate.resolve({ page: { records: [], through: reference('0'), coverage: 'complete' } })
      expect(await queryResult).toStrictEqual(emptyPage)
      expect(journal.activeIo).toBe(0)
      expect(journal.openQueryHandles).toBe(0)
      expect(journal.pendingQueries).toBe(0)
      expect(journal.pendingQueryIo).toBe(0)
      expect(journal.pendingQueryCloses).toBe(0)
      expect(await f.close()).toStrictEqual({ complete: true, coverage: 'degraded' })
      expect(f.collector.health()).toStrictEqual({ ...H, coverage: 'degraded' })
      expect(f.collector.metrics(scope)).toStrictEqual(M)
      expect(journal.records).toStrictEqual([])
      expect(journal.appends).toStrictEqual([])
      expect(journal.exports).toStrictEqual([])
      expect(journal.queries).toStrictEqual([query])
      expect(journal.effects).toStrictEqual([
        'query opens actual handle',
        'flush fulfilled',
        'store.close incomplete',
        'query settles and actual handle closes',
        'flush fulfilled',
        'store.close complete',
      ])
      expect(journal.flushCalls).toBe(2)
      expect(journal.closeCalls).toBe(2)
      expect(journal.resourcesOpen).toBe(false)
      expect(f.reports).toStrictEqual([])
      expect(f.leases()).toStrictEqual([closedLease, closedLease])
    } finally {
      gate.resolve(emptyPage)
      await f.cleanup()
    }
  })

  it('C04 retains journal facts and retries its native store close rejection', async () => {
    const journal = new Journal(undefined, undefined, 'first-close')
    const f = fixture(journal)
    const failedHealth: DiagnosticHealth = {
      ...admittedHealth(seed1),
      writeState: 'closing',
      writeFailures: 1,
      coverage: 'degraded',
    }
    const failedMetrics: DiagnosticMetrics = {
      ...eventMetrics(transport()),
      failures: { ...M.failures, write: 1 },
    }
    try {
      expect(f.collector.record(transport(), scope)).toStrictEqual({ recorded: reference('1') })
      expect(await f.close()).toStrictEqual({ incomplete: I, coverage: 'degraded' })
      expect(f.collector.health()).toStrictEqual(failedHealth)
      expect(f.collector.metrics(scope)).toStrictEqual(failedMetrics)
      expect(journal.records).toStrictEqual([seed1])
      expect(journal.appends).toStrictEqual([seed1])
      expect(journal.queries).toStrictEqual([])
      expect(journal.exports).toStrictEqual([])
      expect(journal.effects).toStrictEqual([
        'append1 written',
        'flush fulfilled',
        'store.close rejects retaining resources',
      ])
      expect(journal.resourcesOpen).toBe(true)
      expect(f.reports).toStrictEqual([{ category: 'write', count: 1 }])
      expect(f.leases()).toStrictEqual([closedLease])
      expect(await f.close()).toStrictEqual({ complete: true, coverage: 'degraded' })
      expect(f.collector.health()).toStrictEqual({ ...failedHealth, writeState: 'closed' })
      expect(f.collector.metrics(scope)).toStrictEqual(failedMetrics)
      expect(journal.records).toStrictEqual([seed1])
      expect(journal.appends).toStrictEqual([seed1])
      expect(journal.queries).toStrictEqual([])
      expect(journal.exports).toStrictEqual([])
      expect(journal.effects).toStrictEqual([
        'append1 written',
        'flush fulfilled',
        'store.close rejects retaining resources',
        'flush fulfilled',
        'store.close complete',
      ])
      expect(journal.flushCalls).toBe(2)
      expect(journal.closeCalls).toBe(2)
      expect(journal.resourcesOpen).toBe(false)
      expect(f.reports).toStrictEqual([{ category: 'write', count: 1 }])
      expect(f.leases()).toStrictEqual([closedLease, closedLease])
    } finally {
      await f.cleanup()
    }
  })
})
