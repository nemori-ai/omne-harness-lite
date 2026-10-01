import { copyMeasurementDiagnostic, measurementDiagnosticKeys } from './calibration-diagnostic.ts'
import {
  isNonNegativeJsonInteger,
  isJsonNumber,
  jsonNumberSource,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  DiagnosticAssociation,
  DiagnosticBinding,
  DiagnosticCloseResult,
  DiagnosticCollector,
  DiagnosticCollectorConfig,
  DiagnosticCoverage,
  DiagnosticDropReason,
  DiagnosticEmitter,
  DiagnosticEvent,
  DiagnosticExportLimits,
  DiagnosticExportResult,
  DiagnosticFact,
  DiagnosticHealth,
  DiagnosticMetrics,
  DiagnosticOutcome,
  DiagnosticQuery,
  DiagnosticQueryResult,
  DiagnosticRecord,
  DiagnosticReportCategory,
  DiagnosticReference,
  DiagnosticScope,
  DiagnosticSource,
  DiagnosticStage,
} from './diagnostics-types.ts'

const sources = ['runtime', 'invocation', 'transport', 'observer', 'assembly'] as const
const stages = [
  'admission',
  'binding',
  'planning',
  'credential',
  'queue',
  'send',
  'content_gate',
  'first_content',
  'stream_end',
  'reply_handoff',
  'settlement',
  'retry',
  'recovery',
  'registration',
  'retirement',
  'observer',
  'diagnostics',
  'assembly',
] as const
const outcomes = [
  'started',
  'waiting',
  'accepted',
  'rejected',
  'unavailable',
  'completed',
  'failed',
  'cancel_requested',
  'stopped',
  'unknown',
  'dropped',
] as const
const factKinds = [
  'measurement',
  'decision',
  'transport',
  'progress',
  'registration',
  'observer',
  'diagnostics',
] as const
const causes = [
  'withdrawn',
  'scope_disallowed',
  'modality_mismatch',
  'credential_unavailable',
  'request_rejected',
  'upstream_unavailable',
  'unrecognized',
  'interrupted_mid_reply',
  'malformed',
  'dependency',
  'closed',
  'concurrent',
] as const
const decisionKeys = [
  'kind',
  'cause',
  'adjustment',
  'parameter',
  'credentialScope',
  'credentialPresent',
]
const transportKeys = [
  'kind',
  'touch',
  'httpStatus',
  'requestedProvider',
  'servingProvider',
  'gate',
  'stream',
]
const progressKeys = [
  'kind',
  'cause',
  'settlement',
  'responseOutcome',
  'anchor',
  'anchorId',
  'retry',
  'owner',
  'policy',
  'submissions',
  'tailConflicts',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'costUsd',
]
const registrationKeys = ['kind', 'phase', 'references', 'executions', 'cancellation']
const observerKeys = [
  'kind',
  'observerStage',
  'reason',
  'position',
  'bufferedEvents',
  'bufferedBytes',
]
const diagnosticsKeys = ['kind', 'reason', 'count']
const associationKeys = [
  'executionId',
  'causedBy',
  'session',
  'run',
  'attempt',
  'call',
  'dispatch',
  'response',
]
const bindingKeys = [
  'profile',
  'implementation',
  'implementationRevision',
  'modelId',
  'definitionRevision',
  'configurationRevision',
]
const referenceKeys = ['collectorId', 'sequence']
const configurationKeys = [
  'collectorId',
  'scope',
  'maxRecordBytes',
  'maxFieldBytes',
  'queueMaxRecords',
  'queueMaxBytes',
  'segmentMaxBytes',
  'retainedMaxBytes',
  'retainedMaxSegments',
  'retentionMs',
  'queryMaxRecords',
  'queryMaxBytes',
  'queryScanMaxBytes',
  'queryConcurrency',
  'queryMaxDurationMs',
  'exportMaxRecords',
  'exportMaxBytes',
  'closeWaitMs',
  'stderrMaxReports',
  'wallClock',
  'monotonicClock',
  'schedule',
  'store',
  'sink',
  'stderr',
]
const stageFactKind: Readonly<Record<DiagnosticStage, DiagnosticFact['kind']>> = {
  admission: 'decision',
  binding: 'decision',
  planning: 'decision',
  credential: 'decision',
  queue: 'transport',
  send: 'transport',
  content_gate: 'transport',
  first_content: 'transport',
  stream_end: 'transport',
  reply_handoff: 'progress',
  settlement: 'progress',
  retry: 'progress',
  recovery: 'progress',
  registration: 'registration',
  retirement: 'registration',
  observer: 'observer',
  diagnostics: 'diagnostics',
  assembly: 'diagnostics',
}

type Counter = number | 'unknown'
type FailureName = keyof DiagnosticMetrics['failures']
type DropName = keyof DiagnosticMetrics['dropped']

function oneOf<const T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some(entry => entry === value)
}

function finiteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function positiveInteger(value: unknown): value is number {
  return finiteInteger(value) && value > 0
}

function ownData(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    if (Object.getOwnPropertySymbols(value).length !== 0) return null
    const result: Record<string, unknown> = {}
    for (const key of Object.getOwnPropertyNames(value)) {
      if (!allowed.includes(key) || key === '__proto__') return null
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      if (descriptor.value !== undefined) result[key] = descriptor.value
    }
    return result
  } catch {
    return null
  }
}

function boundedString(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= maxBytes
}

function optionalString(record: Record<string, unknown>, key: string, maxBytes: number): boolean {
  return record[key] === undefined || boundedString(record[key], maxBytes)
}

function optionalCount(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || exactNonnegativeInteger(record[key])
}

function exactNonnegativeInteger(value: unknown): value is JsonNumber {
  return typeof value === 'number'
    ? Number.isSafeInteger(value) && value >= 0
    : isNonNegativeJsonInteger(value)
}

function validReference(
  value: unknown,
  maxBytes: number,
  emptyThrough = false,
): DiagnosticReference | null {
  const record = ownData(value, referenceKeys)
  if (!record || !boundedString(record.collectorId, maxBytes)) return null
  // Sequence zero is only the fixed through watermark of an empty journal.
  if (
    typeof record.sequence !== 'string' ||
    (!(emptyThrough && record.sequence === '0') && !/^[1-9][0-9]*$/.test(record.sequence))
  )
    return null
  if (Buffer.byteLength(record.sequence) > maxBytes) return null
  return Object.freeze({ collectorId: record.collectorId, sequence: record.sequence })
}

function validScope(value: unknown, maxBytes: number): DiagnosticScope | null {
  const record = ownData(value, ['kind', 'tenant'])
  if (!record) return null
  if (record.kind === 'local' && !Object.hasOwn(record, 'tenant'))
    return Object.freeze({ kind: 'local' })
  if (record.kind === 'tenant') {
    const pair = ownData(record.tenant, ['organization', 'account'])
    if (
      !pair ||
      !boundedString(pair.organization, maxBytes) ||
      !boundedString(pair.account, maxBytes)
    )
      return null
    const parsed = parseTenantId(pair)
    if ('ok' in parsed) return Object.freeze({ kind: 'tenant', tenant: Object.freeze(parsed.ok) })
  }
  return null
}

function sameScope(left: DiagnosticScope, right: DiagnosticScope): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'local' ||
      (right.kind === 'tenant' && tenantIdEquals(left.tenant, right.tenant)))
  )
}

function validAssociation(value: unknown, maxBytes: number): DiagnosticAssociation | null {
  const record = ownData(value, associationKeys)
  if (!record || !boundedString(record.executionId, maxBytes)) return null
  for (const key of ['session', 'run', 'call', 'response']) {
    if (!optionalString(record, key, maxBytes)) return null
  }
  if (!optionalCount(record, 'attempt') || !optionalCount(record, 'dispatch')) return null
  const causedBy =
    record.causedBy === undefined ? undefined : validReference(record.causedBy, maxBytes)
  if (record.causedBy !== undefined && !causedBy) return null
  const association: DiagnosticAssociation = {
    executionId: record.executionId,
    ...(causedBy ? { causedBy } : {}),
    ...(record.session === undefined ? {} : { session: record.session as string }),
    ...(record.run === undefined ? {} : { run: record.run as string }),
    ...(record.attempt === undefined ? {} : { attempt: record.attempt as JsonNumber }),
    ...(record.call === undefined ? {} : { call: record.call as string }),
    ...(record.dispatch === undefined ? {} : { dispatch: record.dispatch as JsonNumber }),
    ...(record.response === undefined ? {} : { response: record.response as string }),
  }
  return Object.freeze(association)
}

function validBinding(value: unknown, maxBytes: number): DiagnosticBinding | null {
  const record = ownData(value, bindingKeys)
  if (!record) return null
  for (const key of bindingKeys) if (!optionalString(record, key, maxBytes)) return null
  return Object.freeze({ ...record })
}

function validFacts(
  value: unknown,
  stage: DiagnosticStage,
  maxBytes: number,
): DiagnosticFact | null {
  const header = ownData(value, [
    ...decisionKeys,
    ...transportKeys,
    ...progressKeys,
    ...registrationKeys,
    ...observerKeys,
    ...diagnosticsKeys,
    ...measurementDiagnosticKeys,
  ])
  if (
    !header ||
    !oneOf(header.kind, factKinds) ||
    (header.kind !== stageFactKind[stage] &&
      !(stage === 'planning' && header.kind === 'measurement'))
  )
    return null
  if (header.kind === 'measurement') return copyMeasurementDiagnostic(value, maxBytes)
  const keys =
    header.kind === 'decision'
      ? decisionKeys
      : header.kind === 'transport'
        ? transportKeys
        : header.kind === 'progress'
          ? progressKeys
          : header.kind === 'registration'
            ? registrationKeys
            : header.kind === 'observer'
              ? observerKeys
              : diagnosticsKeys
  const record = ownData(value, keys)
  if (!record) return null
  if (header.kind === 'decision') {
    if (record.cause !== undefined && !oneOf(record.cause, causes)) return null
    if (
      record.adjustment !== undefined &&
      !oneOf(record.adjustment, ['omitted', 'converted', 'clamped'])
    )
      return null
    if (!optionalString(record, 'parameter', maxBytes)) return null
    if (
      record.credentialScope !== undefined &&
      !oneOf(record.credentialScope, ['tenant', 'factory'])
    )
      return null
    if (record.credentialPresent !== undefined && typeof record.credentialPresent !== 'boolean')
      return null
  } else if (header.kind === 'transport') {
    if (record.touch !== undefined && !oneOf(record.touch, ['queued', 'touched', 'unknown']))
      return null
    if (
      record.httpStatus !== undefined &&
      (!finiteInteger(record.httpStatus) || record.httpStatus > 999)
    )
      return null
    if (
      !optionalString(record, 'requestedProvider', maxBytes) ||
      !optionalString(record, 'servingProvider', maxBytes)
    )
      return null
    if (record.gate !== undefined && !oneOf(record.gate, ['waiting', 'accepted', 'failed']))
      return null
    if (record.stream !== undefined && !oneOf(record.stream, ['first_content', 'ended', 'lost']))
      return null
  } else if (header.kind === 'progress') {
    if (record.cause !== undefined && !oneOf(record.cause, causes)) return null
    if (
      record.settlement !== undefined &&
      !oneOf(record.settlement, ['unsettled', 'submitted', 'committed', 'unknown'])
    )
      return null
    if (
      record.responseOutcome !== undefined &&
      !oneOf(record.responseOutcome, ['complete', 'truncated', 'failed', 'interrupted'])
    )
      return null
    if (
      record.anchor !== undefined &&
      !oneOf(record.anchor, ['dispatched', 'opened', 'response', 'ended'])
    )
      return null
    if (record.retry !== undefined && !oneOf(record.retry, ['again', 'refused', 'without_resend']))
      return null
    for (const key of ['anchorId', 'owner', 'policy'])
      if (!optionalString(record, key, maxBytes)) return null
    for (const key of [
      'submissions',
      'tailConflicts',
      'inputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
    ]) {
      if (!optionalCount(record, key)) return null
    }
    if (
      record.costUsd !== undefined &&
      (!isJsonNumber(record.costUsd) ||
        (typeof record.costUsd === 'number' &&
          (!Number.isFinite(record.costUsd) || record.costUsd < 0)) ||
        jsonNumberSource(record.costUsd).startsWith('-') ||
        Buffer.byteLength(jsonNumberSource(record.costUsd)) > maxBytes)
    )
      return null
  } else if (header.kind === 'registration') {
    if (
      record.phase !== undefined &&
      !oneOf(record.phase, ['published', 'admitted', 'retiring', 'closed'])
    )
      return null
    if (!optionalCount(record, 'references') || !optionalCount(record, 'executions')) return null
    if (
      record.cancellation !== undefined &&
      !oneOf(record.cancellation, ['requested', 'stopped', 'remaining_active', 'cleanup_failed'])
    )
      return null
  } else if (header.kind === 'observer') {
    if (!oneOf(record.observerStage, ['offer', 'delivery', 'close'])) return null
    if (
      !oneOf(record.reason, [
        'malformed',
        'observer_scope_mismatch',
        'unavailable',
        'buffer_full',
        'consumer_failed',
      ])
    )
      return null
    for (const key of ['position', 'bufferedEvents', 'bufferedBytes'])
      if (!optionalCount(record, key)) return null
  } else {
    if (
      !oneOf(record.reason, [
        'sink_failed',
        'sink_contract_violation',
        'queue_full',
        'io_failed',
        'retention_full',
        'transport_retention_full',
        'close_incomplete',
        'export_failed',
      ])
    )
      return null
    if (!optionalCount(record, 'count')) return null
  }
  return Object.freeze({ ...record }) as DiagnosticFact
}

function validEvent(value: unknown, maxBytes: number): DiagnosticEvent | 'unsupported' | null {
  const record = ownData(value, ['source', 'stage', 'outcome', 'binding', 'facts'])
  if (!record) return null
  if (
    !oneOf(record.source, sources) ||
    !oneOf(record.stage, stages) ||
    !oneOf(record.outcome, outcomes)
  )
    return 'unsupported'
  const binding = record.binding === undefined ? undefined : validBinding(record.binding, maxBytes)
  const factHeader = ownData(record.facts, [
    ...decisionKeys,
    ...transportKeys,
    ...progressKeys,
    ...registrationKeys,
    ...observerKeys,
    ...diagnosticsKeys,
    ...measurementDiagnosticKeys,
  ])
  if (factHeader && typeof factHeader.kind === 'string' && !oneOf(factHeader.kind, factKinds))
    return 'unsupported'
  const facts = validFacts(record.facts, record.stage, maxBytes)
  if ((record.binding !== undefined && !binding) || !facts) return null
  return Object.freeze({
    source: record.source,
    stage: record.stage,
    outcome: record.outcome,
    ...(binding ? { binding } : {}),
    facts,
  }) as DiagnosticEvent
}

function increment(value: Counter): Counter {
  return value === 'unknown' || value === Number.MAX_SAFE_INTEGER ? 'unknown' : value + 1
}

function validateConfig(config: DiagnosticCollectorConfig): DiagnosticScope {
  if (!ownData(config, configurationKeys)) throw new Error('invalid diagnostic configuration')
  if (
    config.sink &&
    !ownData(config.sink, ['mode', 'record', 'maxPending', 'maxQueuedRecords', 'maxQueuedBytes'])
  ) {
    throw new Error('invalid diagnostic configuration')
  }
  const numbers = [
    config.maxRecordBytes,
    config.maxFieldBytes,
    config.queueMaxRecords,
    config.queueMaxBytes,
    config.segmentMaxBytes,
    config.retainedMaxBytes,
    config.retainedMaxSegments,
    config.retentionMs,
    config.queryMaxRecords,
    config.queryMaxBytes,
    config.queryScanMaxBytes,
    config.queryConcurrency,
    config.queryMaxDurationMs,
    config.exportMaxRecords,
    config.exportMaxBytes,
    config.closeWaitMs,
    config.stderrMaxReports,
  ]
  if (
    numbers.some(value => !positiveInteger(value)) ||
    config.maxRecordBytes > config.segmentMaxBytes ||
    config.segmentMaxBytes > config.retainedMaxBytes ||
    config.maxRecordBytes > config.queryMaxBytes ||
    config.maxRecordBytes > config.exportMaxBytes ||
    (config.sink?.mode === 'async' &&
      (!positiveInteger(config.sink.maxPending) ||
        !positiveInteger(config.sink.maxQueuedRecords) ||
        !positiveInteger(config.sink.maxQueuedBytes))) ||
    (config.sink !== undefined &&
      ((config.sink.mode !== 'sync' && config.sink.mode !== 'async') ||
        typeof config.sink.record !== 'function')) ||
    typeof config.wallClock !== 'function' ||
    typeof config.monotonicClock !== 'function' ||
    typeof config.schedule !== 'function' ||
    (config.stderr !== undefined && typeof config.stderr !== 'function') ||
    typeof config.store?.append !== 'function' ||
    typeof config.store?.flush !== 'function' ||
    typeof config.store?.close !== 'function' ||
    typeof config.store?.query !== 'function' ||
    typeof config.store?.exportPage !== 'function' ||
    typeof config.store?.health !== 'function' ||
    !boundedString(config.collectorId, config.maxFieldBytes)
  ) {
    throw new Error('invalid diagnostic configuration')
  }
  const scope = validScope(config.scope, config.maxFieldBytes)
  if (!scope) throw new Error('invalid diagnostic scope')
  return scope
}

/** Construct once per local engineering journal; invokeModel can use an emitter directly. */
export function createDiagnosticCollector(input: DiagnosticCollectorConfig): DiagnosticCollector {
  const scope = validateConfig(input)
  const config: DiagnosticCollectorConfig = Object.freeze({
    ...input,
    scope,
    ...(input.sink ? { sink: Object.freeze({ ...input.sink }) } : {}),
  })
  const counters = {
    accepted: 0 as Counter,
    written: 0 as Counter,
    invalidRecords: 0 as Counter,
    unsupportedEvents: 0 as Counter,
    dropped: 0 as Counter,
    oversize: 0 as Counter,
    writeFailures: 0 as Counter,
    flushFailures: 0 as Counter,
    queryFailures: 0 as Counter,
    exportFailures: 0 as Counter,
    clockFailures: 0 as Counter,
    sinkFailures: 0 as Counter,
    stderrFailures: 0 as Counter,
    sinkDropped: 0 as Counter,
  }
  const dropCounters: Record<DropName, Counter> = {
    invalid: 0,
    unsupported: 0,
    oversize: 0,
    queue_full: 0,
    closed: 0,
    retention: 0,
    io_failed: 0,
  }
  const failureCounters: Record<FailureName, Counter> = {
    write: 0,
    flush: 0,
    query: 0,
    export: 0,
    clock: 0,
    sink: 0,
    stderr: 0,
  }
  const stageEvents = new Map<
    string,
    { source: DiagnosticSource; stage: DiagnosticStage; outcome: DiagnosticOutcome; count: Counter }
  >()
  const stageDurations = new Map<DiagnosticStage, { count: Counter; sum: Counter; max: Counter }>()
  const observerRejections = new Map<
    string,
    {
      stage: 'offer' | 'delivery' | 'close'
      reason:
        'malformed' | 'observer_scope_mismatch' | 'unavailable' | 'buffer_full' | 'consumer_failed'
      count: Counter
    }
  >()
  const queue: { record: DiagnosticRecord; bytes: number }[] = []
  const sinkQueue: { record: DiagnosticRecord; bytes: number }[] = []
  const sinkTasks = new Set<Promise<void>>()
  let queuedBytes = 0
  let sinkQueuedBytes = 0
  let sinkDisabled = false
  let sequence = 0
  let acceptedSequence: string | undefined
  let writtenSequence: string | undefined
  let flushedSequence: string | undefined
  let pendingWrites = 0
  let writeState: DiagnosticHealth['writeState'] = 'open'
  let coverage: DiagnosticCoverage = 'complete'
  let drainTask: Promise<void> | undefined
  let closingTask: Promise<void> | undefined
  let startMono: number | undefined
  let startedAt: string | undefined
  let stderrReports = 0

  function report(category: DiagnosticReportCategory, count: Counter): void {
    if (!config.stderr || stderrReports >= config.stderrMaxReports) return
    stderrReports++
    try {
      config.stderr(category, count)
    } catch {
      counters.stderrFailures = increment(counters.stderrFailures)
      failureCounters.stderr = increment(failureCounters.stderr)
      coverage = 'degraded'
    }
  }

  function failure(name: FailureName): void {
    failureCounters[name] = increment(failureCounters[name])
    const key = `${name}Failures` as keyof typeof counters
    counters[key] = increment(counters[key])
    coverage = 'degraded'
    if (name !== 'stderr') report(name, failureCounters[name])
  }

  function drop(reason: DropName): void {
    dropCounters[reason] = increment(dropCounters[reason])
    counters.dropped = increment(counters.dropped)
    if (reason === 'invalid') counters.invalidRecords = increment(counters.invalidRecords)
    if (reason === 'unsupported') counters.unsupportedEvents = increment(counters.unsupportedEvents)
    if (reason === 'oversize') counters.oversize = increment(counters.oversize)
    coverage = 'degraded'
    report(reason, dropCounters[reason])
  }

  function queueSink(record: DiagnosticRecord, bytes: number): void {
    const sink = config.sink
    if (!sink || sinkDisabled) return
    if (sink.mode === 'sync') {
      try {
        const returned: unknown = sink.record(record)
        if (returned !== undefined) {
          sinkDisabled = true
          failure('sink')
          if (
            (typeof returned === 'object' && returned !== null) ||
            typeof returned === 'function'
          ) {
            const task = Promise.resolve(returned).then(
              () => {},
              () => {
                failure('sink')
              },
            )
            sinkTasks.add(task)
            void task
              .finally(() => {
                sinkTasks.delete(task)
              })
              .catch(() => {
                failure('sink')
              })
          }
        }
      } catch {
        sinkDisabled = true
        failure('sink')
      }
      return
    }
    if (
      sinkQueue.length >= sink.maxQueuedRecords ||
      bytes > sink.maxQueuedBytes - sinkQueuedBytes
    ) {
      counters.sinkDropped = increment(counters.sinkDropped)
      coverage = 'degraded'
      return
    }
    sinkQueue.push({ record, bytes })
    sinkQueuedBytes += bytes
    drainSink()
  }

  function drainSink(): void {
    const sink = config.sink
    if (!sink || sink.mode !== 'async' || sinkDisabled) return
    while (sinkTasks.size < sink.maxPending && sinkQueue.length > 0) {
      const item = sinkQueue.shift()!
      sinkQueuedBytes -= item.bytes
      let task: Promise<void>
      try {
        const returned: unknown = sink.record(item.record)
        if (
          !returned ||
          (typeof returned !== 'object' && typeof returned !== 'function') ||
          typeof Reflect.get(returned, 'then') !== 'function'
        ) {
          sinkDisabled = true
          failure('sink')
          sinkQueue.length = 0
          sinkQueuedBytes = 0
          break
        }
        task = Promise.resolve(returned).then(
          () => {},
          () => {
            failure('sink')
          },
        )
      } catch {
        failure('sink')
        continue
      }
      sinkTasks.add(task)
      void task
        .finally(() => {
          sinkTasks.delete(task)
          drainSink()
        })
        .catch(() => {
          failure('sink')
        })
    }
  }

  function wallTime(): string | undefined {
    try {
      const date = config.wallClock()
      if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error()
      return date.toISOString()
    } catch {
      failure('clock')
      return undefined
    }
  }

  function monotonicTime(): number | undefined {
    try {
      const now = config.monotonicClock()
      if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) throw new Error()
      return now
    } catch {
      failure('clock')
      return undefined
    }
  }

  startedAt = wallTime()
  startMono = monotonicTime()

  async function drain(): Promise<void> {
    while (queue.length > 0 && writeState !== 'failed') {
      const item = queue[0]!
      pendingWrites = 1
      try {
        const result = await config.store.append(item.record)
        if (result === 'retention_full') {
          drop('retention')
        } else if (result === 'written') {
          writtenSequence = item.record.sequence
          counters.written = increment(counters.written)
        } else {
          throw new Error('invalid store acknowledgement')
        }
      } catch {
        failure('write')
        drop('io_failed')
        writeState = 'failed'
      } finally {
        queue.shift()
        queuedBytes -= item.bytes
        pendingWrites = 0
      }
    }
    if (writeState === 'failed') {
      for (const item of queue.splice(0)) {
        queuedBytes -= item.bytes
        drop('io_failed')
      }
    }
  }

  function record(
    event: DiagnosticEvent,
    requestedScope: DiagnosticScope,
    association?: DiagnosticAssociation,
  ): { recorded: DiagnosticReference } | { dropped: DiagnosticDropReason } {
    if (writeState !== 'open') {
      drop('closed')
      return { dropped: 'closed' }
    }
    const safe = validEvent(event, config.maxFieldBytes)
    if (safe === 'unsupported') {
      drop('unsupported')
      return { dropped: 'unsupported' }
    }
    const safeAssociation =
      association === undefined ? undefined : validAssociation(association, config.maxFieldBytes)
    const safeScope = validScope(requestedScope, config.maxFieldBytes)
    if (
      !safe ||
      !safeScope ||
      !sameScope(scope, safeScope) ||
      (association !== undefined && !safeAssociation)
    ) {
      drop('invalid')
      return { dropped: 'invalid' }
    }
    // Every structurally valid event gets a position, even if capacity later drops it.
    if (sequence === Number.MAX_SAFE_INTEGER) {
      coverage = 'unknown'
      drop('oversize')
      return { dropped: 'oversize' }
    }
    const reference = Object.freeze({
      collectorId: config.collectorId,
      sequence: String(++sequence),
    })
    const observedAt = wallTime()
    const nowMono = monotonicTime()
    const elapsedMs =
      nowMono !== undefined && startMono !== undefined && nowMono >= startMono
        ? nowMono - startMono
        : undefined
    if (nowMono !== undefined && startMono !== undefined && nowMono < startMono) failure('clock')
    const full: DiagnosticRecord = Object.freeze({
      ...safe,
      format: 'model-diagnostics/1',
      ...reference,
      scope,
      ...(safeAssociation ? { association: safeAssociation } : {}),
      ...(observedAt ? { observedAt } : {}),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
    })
    const bytes = Buffer.byteLength(writeJsonLossless(full)) + 1
    if (bytes > config.maxRecordBytes) {
      drop('oversize')
      return { dropped: 'oversize' }
    }
    const metricKey = `${safe.source}\0${safe.stage}\0${safe.outcome}`
    const previous = stageEvents.get(metricKey)
    const count = increment(previous?.count ?? 0)
    stageEvents.set(metricKey, {
      source: safe.source,
      stage: safe.stage,
      outcome: safe.outcome,
      count,
    })
    if (count === 'unknown') coverage = 'degraded'
    if (safe.facts.kind === 'observer') {
      const key = `${safe.facts.observerStage}\0${safe.facts.reason}`
      const current = observerRejections.get(key)
      observerRejections.set(key, {
        stage: safe.facts.observerStage,
        reason: safe.facts.reason,
        count: increment(current?.count ?? 0),
      })
    }
    if (queue.length >= config.queueMaxRecords || bytes > config.queueMaxBytes - queuedBytes) {
      drop('queue_full')
      return { dropped: 'queue_full' }
    }
    queue.push({ record: full, bytes })
    queuedBytes += bytes
    acceptedSequence = full.sequence
    counters.accepted = increment(counters.accepted)
    queueSink(full, bytes)
    startDrain()
    return { recorded: reference }
  }

  function startDrain(): void {
    if (!drainTask && queue.length > 0) {
      drainTask = Promise.resolve()
        .then(drain)
        .finally(() => {
          drainTask = undefined
          if (queue.length > 0 && writeState !== 'failed') startDrain()
        })
    }
  }

  function emitter(
    requestedScope: DiagnosticScope,
    association?: DiagnosticAssociation,
  ): DiagnosticEmitter {
    const safeScope = validScope(requestedScope, config.maxFieldBytes)
    if (!safeScope || !sameScope(scope, safeScope)) throw new Error('invalid diagnostic scope')
    const fixed =
      association === undefined ? undefined : validAssociation(association, config.maxFieldBytes)
    if (association !== undefined && !fixed) throw new Error('invalid diagnostic association')
    const activeStages = new Map<DiagnosticStage, number>()
    let closed = false
    return Object.freeze({
      record(event: DiagnosticEvent) {
        if (closed) return { dropped: 'closed' as const }
        const result = record(event, safeScope, fixed ?? undefined)
        if ('recorded' in result) {
          const now = monotonicTime()
          if (event.outcome === 'started') {
            if (now !== undefined && !activeStages.has(event.stage))
              activeStages.set(event.stage, now)
          } else if (now !== undefined) {
            const begun = activeStages.get(event.stage)
            if (begun !== undefined) {
              activeStages.delete(event.stage)
              if (now >= begun) {
                const duration = now - begun
                const previous = stageDurations.get(event.stage) ?? { count: 0, sum: 0, max: 0 }
                const candidateSum = previous.sum === 'unknown' ? NaN : previous.sum + duration
                const sum =
                  Number.isFinite(candidateSum) && candidateSum <= Number.MAX_SAFE_INTEGER
                    ? candidateSum
                    : 'unknown'
                const max =
                  previous.max === 'unknown' || duration > Number.MAX_SAFE_INTEGER
                    ? 'unknown'
                    : Math.max(previous.max, duration)
                stageDurations.set(event.stage, { count: increment(previous.count), sum, max })
                if (sum === 'unknown' || max === 'unknown') coverage = 'degraded'
              } else failure('clock')
            }
          }
        }
        return result
      },
      close() {
        closed = true
        activeStages.clear()
      },
    })
  }

  function safeStoreHealth(): ReturnType<DiagnosticCollectorConfig['store']['health']> | null {
    try {
      return config.store.health()
    } catch {
      coverage = 'degraded'
      return null
    }
  }

  function health(): DiagnosticHealth {
    const store = safeStoreHealth()
    return Object.freeze({
      collectorId: config.collectorId,
      writeState,
      ...(acceptedSequence ? { acceptedSequence } : {}),
      ...(writtenSequence ? { writtenSequence } : {}),
      ...(flushedSequence ? { flushedSequence } : {}),
      queuedRecords: queue.length,
      queuedBytes,
      pendingWrites,
      pendingQueries: store?.pendingQueries ?? 'unknown',
      pendingQueryIo: store?.pendingQueryIo ?? 'unknown',
      openQueryHandles: store?.openQueryHandles ?? 'unknown',
      pendingQueryCloses: store?.pendingQueryCloses ?? 'unknown',
      timedOutQueries: store?.timedOutQueries ?? 'unknown',
      queryCloseFailures: store?.queryCloseFailures ?? 'unknown',
      pendingSinks: sinkTasks.size + sinkQueue.length,
      ...counters,
      expired: store?.expired ?? 'unknown',
      expiredBytes: store?.expiredBytes ?? 'unknown',
      evicted: store?.evicted ?? 'unknown',
      evictedBytes: store?.evictedBytes ?? 'unknown',
      retainedBytes: store?.retainedBytes ?? 'unknown',
      retainedRecords: store?.retainedRecords ?? 'unknown',
      retainedSegments: store?.retainedSegments ?? 'unknown',
      ...(store?.oldestAvailableSequence
        ? { oldestAvailableSequence: store.oldestAvailableSequence }
        : {}),
      coverage:
        coverage === 'unknown' || store?.coverage === 'unknown'
          ? 'unknown'
          : coverage === 'degraded' || !store || store.coverage === 'degraded'
            ? 'degraded'
            : 'complete',
    })
  }

  function metrics(requestScope: DiagnosticScope): DiagnosticMetrics | { rejected: 'forbidden' } {
    const asked = validScope(requestScope, config.maxFieldBytes)
    if (!asked || !sameScope(scope, asked)) return { rejected: 'forbidden' }
    return Object.freeze({
      collectorId: config.collectorId,
      ...(startedAt ? { startedAt } : {}),
      stageEvents: Object.freeze(
        Array.from(stageEvents.values(), value => Object.freeze({ ...value })),
      ),
      stageDurations: Object.freeze(
        Array.from(stageDurations, ([stage, value]) => Object.freeze({ stage, ...value })),
      ),
      observerRejections: Object.freeze(
        Array.from(observerRejections.values(), value => Object.freeze({ ...value })),
      ),
      dropped: Object.freeze({ ...dropCounters }),
      failures: Object.freeze({ ...failureCounters }),
      queueRecords: queue.length,
      queueBytes: queuedBytes,
    })
  }

  function validQuery(value: unknown): DiagnosticQuery | 'forbidden' | null {
    const query = ownData(value, ['scope', 'after', 'through', 'limit', 'maxBytes'])
    if (!query) return null
    const requestedScope = validScope(query.scope, config.maxFieldBytes)
    if (!requestedScope || !sameScope(scope, requestedScope)) return 'forbidden'
    if (
      !positiveInteger(query.limit) ||
      query.limit > config.queryMaxRecords ||
      !positiveInteger(query.maxBytes) ||
      query.maxBytes > config.queryMaxBytes
    )
      return null
    const after =
      query.after === undefined ? undefined : validReference(query.after, config.maxFieldBytes)
    const through =
      query.through === undefined
        ? undefined
        : validReference(query.through, config.maxFieldBytes, true)
    if (
      (query.after !== undefined && !after) ||
      (query.through !== undefined && !through) ||
      (after && after.collectorId !== config.collectorId) ||
      (through && through.collectorId !== config.collectorId)
    )
      return null
    return {
      scope: requestedScope,
      limit: query.limit,
      maxBytes: query.maxBytes,
      ...(after ? { after } : {}),
      ...(through ? { through } : {}),
    }
  }

  async function query(value: DiagnosticQuery): Promise<DiagnosticQueryResult> {
    const checked = validQuery(value)
    if (checked === 'forbidden') return { rejected: 'forbidden' }
    if (!checked) return { rejected: 'invalidInput' }
    if (writeState === 'closing') return { rejected: 'busy' }
    try {
      const result = await config.store.query(checked)
      if ('page' in result && result.page.records.some(item => !sameScope(scope, item.scope))) {
        failure('query')
        return { rejected: 'unavailable' }
      }
      if ('rejected' in result) failure('query')
      return result
    } catch {
      failure('query')
      return { rejected: 'unavailable' }
    }
  }

  async function exportPage(
    value: DiagnosticQuery,
    inputLimits: DiagnosticExportLimits,
  ): Promise<DiagnosticExportResult> {
    const checked = validQuery(value)
    if (checked === 'forbidden') return { rejected: 'forbidden' }
    if (!checked) return { rejected: 'invalidInput' }
    const limits = ownData(inputLimits, ['maxRecords', 'maxBytes'])
    if (
      !limits ||
      !positiveInteger(limits.maxRecords) ||
      limits.maxRecords > config.exportMaxRecords ||
      !positiveInteger(limits.maxBytes) ||
      limits.maxBytes > config.exportMaxBytes
    )
      return { rejected: 'invalidInput' }
    if (writeState === 'closing') return { rejected: 'busy' }
    try {
      const result = await config.store.exportPage(checked, {
        maxRecords: limits.maxRecords,
        maxBytes: limits.maxBytes,
      })
      if ('rejected' in result) failure('export')
      return result
    } catch {
      failure('export')
      return { rejected: 'unavailable' }
    }
  }

  function incomplete(): DiagnosticCloseResult {
    const current = health()
    return {
      incomplete: {
        pendingWrites: Math.max(current.pendingWrites, current.queuedRecords),
        pendingSinks: current.pendingSinks,
        pendingQueries: current.pendingQueries,
        pendingQueryIo: current.pendingQueryIo,
        openQueryHandles: current.openQueryHandles,
        pendingQueryCloses: current.pendingQueryCloses,
        queryCloseFailures: current.queryCloseFailures,
        flushFailed: current.flushFailures !== 0,
        resourcesOpen: writeState !== 'closed',
      },
      coverage: current.coverage,
    }
  }

  async function close(): Promise<DiagnosticCloseResult> {
    if (!closingTask) {
      if (writeState !== 'failed') writeState = 'closing'
      closingTask = (async () => {
        if (drainTask) await drainTask
        while (sinkTasks.size > 0 || sinkQueue.length > 0) {
          if (sinkTasks.size === 0) drainSink()
          if (sinkTasks.size === 0) break
          await Promise.allSettled([...sinkTasks])
        }
        if (writeState !== 'failed') {
          try {
            await config.store.flush()
            flushedSequence = writtenSequence
          } catch {
            failure('flush')
          }
        }
        try {
          const result = await config.store.close()
          if ('complete' in result && result.complete && counters.flushFailures === 0)
            writeState = 'closed'
          else coverage = 'degraded'
        } catch {
          failure('write')
        }
      })().finally(() => {
        if (writeState !== 'closed') closingTask = undefined
      })
    }
    if (health().writeState === 'closed') return { complete: true, coverage: health().coverage }
    let timer: { readonly cancel: () => void } | undefined
    try {
      const finished = await Promise.race([
        closingTask.then(() => true),
        new Promise<false>(resolve => {
          timer = config.schedule(config.closeWaitMs, () => resolve(false))
        }),
      ])
      if (!finished || health().writeState !== 'closed') return incomplete()
      return { complete: true, coverage: health().coverage }
    } catch {
      coverage = 'degraded'
      return incomplete()
    } finally {
      try {
        timer?.cancel()
      } catch {
        failure('clock')
      }
    }
  }

  return Object.freeze({ record, emitter, query, exportPage, health, metrics, close })
}
