import { type DiagnosticEmitter, type DiagnosticEvent, type DiagnosticRecordResult, type DiagnosticReference, type DiagnosticDropReason, type DiagnosticSource, type DiagnosticOutcome } from '@omne-harness-lite/model-request-runtime'
/** Engineering observations are neither session-log records nor recovery evidence. */
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'


export type DiagnosticStage =
  | 'admission'
  | 'binding'
  | 'planning'
  | 'credential'
  | 'queue'
  | 'send'
  | 'content_gate'
  | 'first_content'
  | 'stream_end'
  | 'reply_handoff'
  | 'settlement'
  | 'retry'
  | 'recovery'
  | 'registration'
  | 'retirement'
  | 'observer'
  | 'diagnostics'
  | 'assembly'

export type DiagnosticScope =
  { readonly kind: 'local' } | { readonly kind: 'tenant'; readonly tenant: TenantId }

/** A call-local engineering marker. It never becomes a Run, session or request field. */
export interface DiagnosticAssociation {
  readonly executionId: string
  readonly causedBy?: DiagnosticReference
  readonly session?: string
  readonly run?: string
  readonly attempt?: JsonNumber
  readonly call?: string
  readonly dispatch?: JsonNumber
  readonly response?: string
}

export type DiagnosticRecord = DiagnosticEvent & {
  readonly format: 'model-diagnostics/1'
  readonly collectorId: string
  readonly sequence: string
  readonly scope: DiagnosticScope
  readonly association?: DiagnosticAssociation
  readonly observedAt?: string
  readonly elapsedMs?: number
}

export type DiagnosticCoverage = 'complete' | 'degraded' | 'unknown'
export type DiagnosticReadRejection =
  'invalidInput' | 'forbidden' | 'busy' | 'timeout' | 'cursor_expired' | 'unavailable' | 'corrupt'

export interface DiagnosticExportLimits {
  readonly maxRecords: number
  readonly maxBytes: number
}

export interface DiagnosticCursorExpired {
  readonly rejected: 'cursor_expired'
  readonly earliest?: DiagnosticReference
  readonly coverage: DiagnosticCoverage
}

export interface DiagnosticQuery {
  readonly scope: DiagnosticScope
  readonly after?: DiagnosticReference
  readonly through?: DiagnosticReference
  readonly limit: number
  readonly maxBytes: number
}

export interface DiagnosticPage<T> {
  readonly records: readonly T[]
  readonly next?: DiagnosticReference
  readonly through: DiagnosticReference
  readonly coverage: DiagnosticCoverage
}

export type DiagnosticQueryResult =
  | { readonly page: DiagnosticPage<DiagnosticRecord> }
  | { readonly rejected: Exclude<DiagnosticReadRejection, 'cursor_expired'> }
  | DiagnosticCursorExpired

export type DiagnosticExportResult =
  | {
      readonly page: Omit<DiagnosticPage<DiagnosticRecord>, 'records'> & { readonly jsonl: string }
    }
  | { readonly rejected: Exclude<DiagnosticReadRejection, 'cursor_expired'> }
  | DiagnosticCursorExpired

export interface DiagnosticHealth {
  readonly collectorId: string
  readonly writeState: 'open' | 'closing' | 'closed' | 'failed'
  readonly acceptedSequence?: string
  readonly writtenSequence?: string
  readonly flushedSequence?: string
  readonly queuedRecords: number
  readonly queuedBytes: number
  readonly pendingWrites: number
  readonly pendingQueries: number | 'unknown'
  readonly pendingQueryIo: number | 'unknown'
  readonly openQueryHandles: number | 'unknown'
  readonly pendingQueryCloses: number | 'unknown'
  readonly timedOutQueries: number | 'unknown'
  readonly queryCloseFailures: number | 'unknown'
  readonly pendingSinks: number
  readonly sinkDropped: number | 'unknown'
  readonly accepted: number | 'unknown'
  readonly written: number | 'unknown'
  readonly invalidRecords: number | 'unknown'
  readonly unsupportedEvents: number | 'unknown'
  readonly dropped: number | 'unknown'
  readonly oversize: number | 'unknown'
  readonly expired: number | 'unknown'
  readonly expiredBytes: number | 'unknown'
  readonly evicted: number | 'unknown'
  readonly evictedBytes: number | 'unknown'
  readonly writeFailures: number | 'unknown'
  readonly flushFailures: number | 'unknown'
  readonly queryFailures: number | 'unknown'
  readonly exportFailures: number | 'unknown'
  readonly clockFailures: number | 'unknown'
  readonly sinkFailures: number | 'unknown'
  readonly stderrFailures: number | 'unknown'
  readonly retainedBytes: number | 'unknown'
  readonly retainedRecords: number | 'unknown'
  readonly retainedSegments: number | 'unknown'
  readonly oldestAvailableSequence?: string
  readonly coverage: DiagnosticCoverage
}

export interface DiagnosticMetrics {
  readonly collectorId: string
  readonly startedAt?: string
  readonly stageEvents: readonly {
    readonly source: DiagnosticSource
    readonly stage: DiagnosticStage
    readonly outcome: DiagnosticOutcome
    readonly count: number | 'unknown'
  }[]
  readonly stageDurations: readonly {
    readonly stage: DiagnosticStage
    readonly count: number | 'unknown'
    readonly sum: number | 'unknown'
    readonly max: number | 'unknown'
  }[]
  readonly observerRejections: readonly {
    readonly stage: 'offer' | 'delivery' | 'close'
    readonly reason:
      'malformed' | 'observer_scope_mismatch' | 'unavailable' | 'buffer_full' | 'consumer_failed'
    readonly count: number | 'unknown'
  }[]
  readonly dropped: Readonly<
    Record<DiagnosticDropReason | 'retention' | 'io_failed', number | 'unknown'>
  >
  readonly failures: Readonly<
    Record<'write' | 'flush' | 'query' | 'export' | 'clock' | 'sink' | 'stderr', number | 'unknown'>
  >
  readonly queueRecords: number
  readonly queueBytes: number
}

export type DiagnosticCloseResult =
  | { readonly complete: true; readonly coverage: DiagnosticCoverage }
  | {
      readonly incomplete: {
        readonly pendingWrites: number
        readonly pendingSinks: number
        readonly pendingQueries: number | 'unknown'
        readonly pendingQueryIo: number | 'unknown'
        readonly openQueryHandles: number | 'unknown'
        readonly pendingQueryCloses: number | 'unknown'
        readonly queryCloseFailures: number | 'unknown'
        readonly flushFailed: boolean
        readonly resourcesOpen: boolean
      }
      readonly coverage: DiagnosticCoverage
    }

/** A store's acknowledgement is separate from collector admission and durable flush. */
export interface DiagnosticJournalStore {
  readonly append: (record: DiagnosticRecord) => Promise<'written' | 'retention_full'>
  readonly flush: () => Promise<void>
  readonly query: (query: DiagnosticQuery) => Promise<DiagnosticQueryResult>
  readonly exportPage: (
    query: DiagnosticQuery,
    limits: DiagnosticExportLimits,
  ) => Promise<DiagnosticExportResult>
  readonly close: () => Promise<DiagnosticCloseResult>
  readonly health: () => Pick<
    DiagnosticHealth,
    | 'pendingQueries'
    | 'pendingQueryIo'
    | 'openQueryHandles'
    | 'pendingQueryCloses'
    | 'timedOutQueries'
    | 'queryCloseFailures'
    | 'expired'
    | 'expiredBytes'
    | 'evicted'
    | 'evictedBytes'
    | 'retainedBytes'
    | 'retainedRecords'
    | 'retainedSegments'
    | 'oldestAvailableSequence'
    | 'coverage'
  >
}

export type DiagnosticOutputSink =
  | { readonly mode: 'sync'; readonly record: (record: DiagnosticRecord) => void }
  | {
      readonly mode: 'async'
      readonly record: (record: DiagnosticRecord) => Promise<void>
      readonly maxPending: number
      readonly maxQueuedRecords: number
      readonly maxQueuedBytes: number
    }

export type DiagnosticReportCategory =
  | 'write'
  | 'flush'
  | 'query'
  | 'export'
  | 'clock'
  | 'sink'
  | 'invalid'
  | 'unsupported'
  | 'oversize'
  | 'queue_full'
  | 'closed'
  | 'retention'
  | 'io_failed'

export interface DiagnosticCollectorConfig {
  readonly collectorId: string
  readonly scope: DiagnosticScope
  readonly maxRecordBytes: number
  readonly maxFieldBytes: number
  readonly queueMaxRecords: number
  readonly queueMaxBytes: number
  readonly segmentMaxBytes: number
  readonly retainedMaxBytes: number
  readonly retainedMaxSegments: number
  readonly retentionMs: number
  readonly queryMaxRecords: number
  readonly queryMaxBytes: number
  readonly queryScanMaxBytes: number
  readonly queryConcurrency: number
  readonly queryMaxDurationMs: number
  readonly exportMaxRecords: number
  readonly exportMaxBytes: number
  readonly closeWaitMs: number
  readonly stderrMaxReports: number
  readonly wallClock: () => Date
  readonly monotonicClock: () => number
  readonly schedule: (durationMs: number, callback: () => void) => { readonly cancel: () => void }
  readonly store: DiagnosticJournalStore
  readonly sink?: DiagnosticOutputSink
  /** Independent, bounded category-only stderr port; no Error or raw text is passed. */
  readonly stderr?: (category: DiagnosticReportCategory, count: number | 'unknown') => void
}

export interface DiagnosticCollector {
  readonly record: (
    event: DiagnosticEvent,
    scope: DiagnosticScope,
    association?: DiagnosticAssociation,
  ) => DiagnosticRecordResult
  readonly emitter: (
    scope: DiagnosticScope,
    association?: DiagnosticAssociation,
  ) => DiagnosticEmitter
  readonly query: (query: DiagnosticQuery) => Promise<DiagnosticQueryResult>
  readonly exportPage: (
    query: DiagnosticQuery,
    limits: DiagnosticExportLimits,
  ) => Promise<DiagnosticExportResult>
  readonly health: () => DiagnosticHealth
  readonly metrics: (
    scope: DiagnosticScope,
  ) => DiagnosticMetrics | { readonly rejected: 'forbidden' }
  readonly close: () => Promise<DiagnosticCloseResult>
}
