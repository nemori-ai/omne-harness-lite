/** Engineering observations are neither session-log records nor recovery evidence. */
export type DiagnosticSource = 'runtime' | 'invocation' | 'transport' | 'observer' | 'assembly'

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

export type DiagnosticOutcome =
  | 'started'
  | 'waiting'
  | 'accepted'
  | 'rejected'
  | 'unavailable'
  | 'completed'
  | 'failed'
  | 'cancel_requested'
  | 'stopped'
  | 'unknown'
  | 'dropped'

export type DiagnosticScope =
  { readonly kind: 'local' } | { readonly kind: 'tenant'; readonly tenant: string }

export interface DiagnosticReference {
  readonly collectorId: string
  readonly sequence: string
}

/** A call-local engineering marker. It never becomes a Run, session or request field. */
export interface DiagnosticAssociation {
  readonly executionId: string
  readonly causedBy?: DiagnosticReference
  readonly session?: string
  readonly run?: string
  readonly attempt?: number
  readonly call?: string
  readonly dispatch?: number
  readonly response?: string
}

export interface DiagnosticBinding {
  readonly profile?: string
  readonly implementation?: string
  readonly implementationRevision?: string
  readonly modelId?: string
  readonly definitionRevision?: string
  readonly configurationRevision?: string
}

export type DiagnosticCause =
  | 'withdrawn'
  | 'scope_disallowed'
  | 'modality_mismatch'
  | 'credential_unavailable'
  | 'request_rejected'
  | 'upstream_unavailable'
  | 'unrecognized'
  | 'interrupted_mid_reply'
  | 'malformed'
  | 'dependency'
  | 'closed'
  | 'concurrent'

export type DiagnosticFact =
  | {
      readonly kind: 'decision'
      readonly cause?: DiagnosticCause
      readonly adjustment?: 'omitted' | 'converted' | 'clamped'
      readonly parameter?: string
      readonly credentialScope?: 'tenant' | 'factory'
      readonly credentialPresent?: boolean
    }
  | {
      readonly kind: 'transport'
      readonly touch?: 'queued' | 'touched' | 'unknown'
      readonly httpStatus?: number
      readonly requestedProvider?: string
      readonly servingProvider?: string
      readonly gate?: 'waiting' | 'accepted' | 'failed'
      readonly stream?: 'first_content' | 'ended' | 'lost'
    }
  | {
      readonly kind: 'progress'
      readonly cause?: DiagnosticCause
      readonly settlement?: 'unsettled' | 'submitted' | 'committed' | 'unknown'
      readonly responseOutcome?: 'complete' | 'failed' | 'interrupted'
      readonly anchor?: 'dispatched' | 'opened' | 'response' | 'ended'
      readonly anchorId?: string
      readonly retry?: 'again' | 'refused' | 'without_resend'
      readonly owner?: string
      readonly policy?: string
      readonly submissions?: number
      readonly tailConflicts?: number
      readonly inputTokens?: number
      readonly outputTokens?: number
      readonly cacheReadTokens?: number
      readonly cacheWriteTokens?: number
      /** Exact nonnegative JSON decimal source, not a floating-point approximation. */
      readonly costUsd?: string
    }
  | {
      readonly kind: 'registration'
      readonly phase?: 'published' | 'admitted' | 'retiring' | 'closed'
      readonly references?: number
      readonly executions?: number
      readonly cancellation?: 'requested' | 'stopped' | 'remaining_active' | 'cleanup_failed'
    }
  | {
      readonly kind: 'observer'
      readonly observerStage: 'delivery' | 'snapshot' | 'increment' | 'close'
      readonly reason: 'buffer_full' | 'consumer_failed' | 'scope_mismatch' | 'closed'
      readonly position?: number
      readonly bufferedEvents?: number
      readonly bufferedBytes?: number
    }
  | {
      readonly kind: 'diagnostics'
      readonly reason:
        | 'sink_failed'
        | 'sink_contract_violation'
        | 'queue_full'
        | 'io_failed'
        | 'retention_full'
        | 'transport_retention_full'
        | 'close_incomplete'
        | 'export_failed'
      readonly count?: number
    }

type DiagnosticEventBase = {
  readonly source: DiagnosticSource
  readonly outcome: DiagnosticOutcome
  readonly binding?: DiagnosticBinding
}

export type DiagnosticEvent = DiagnosticEventBase &
  (
    | {
        readonly stage: 'admission' | 'binding' | 'planning' | 'credential'
        readonly facts: Extract<DiagnosticFact, { kind: 'decision' }>
      }
    | {
        readonly stage: 'queue' | 'send' | 'content_gate' | 'first_content' | 'stream_end'
        readonly facts: Extract<DiagnosticFact, { kind: 'transport' }>
      }
    | {
        readonly stage: 'reply_handoff' | 'settlement' | 'retry' | 'recovery'
        readonly facts: Extract<DiagnosticFact, { kind: 'progress' }>
      }
    | {
        readonly stage: 'registration' | 'retirement'
        readonly facts: Extract<DiagnosticFact, { kind: 'registration' }>
      }
    | { readonly stage: 'observer'; readonly facts: Extract<DiagnosticFact, { kind: 'observer' }> }
    | {
        readonly stage: 'diagnostics' | 'assembly'
        readonly facts: Extract<DiagnosticFact, { kind: 'diagnostics' }>
      }
  )

export type DiagnosticRecord = DiagnosticEvent & {
  readonly format: 'model-diagnostics/1'
  readonly collectorId: string
  readonly sequence: string
  readonly scope: DiagnosticScope
  readonly association?: DiagnosticAssociation
  readonly observedAt?: string
  readonly elapsedMs?: number
}

export type DiagnosticDropReason = 'invalid' | 'unsupported' | 'oversize' | 'queue_full' | 'closed'
export type DiagnosticRecordResult =
  { readonly recorded: DiagnosticReference } | { readonly dropped: DiagnosticDropReason }

export type DiagnosticCoverage = 'complete' | 'degraded' | 'unknown'
export type DiagnosticReadRejection =
  'invalidInput' | 'forbidden' | 'busy' | 'timeout' | 'cursor_expired' | 'unavailable' | 'corrupt'

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
  | { readonly rejected: DiagnosticReadRejection }

export type DiagnosticExportResult =
  | {
      readonly page: Omit<DiagnosticPage<DiagnosticRecord>, 'records'> & { readonly jsonl: string }
    }
  | { readonly rejected: DiagnosticReadRejection }

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
  readonly evicted: number | 'unknown'
  readonly writeFailures: number | 'unknown'
  readonly flushFailures: number | 'unknown'
  readonly queryFailures: number | 'unknown'
  readonly exportFailures: number | 'unknown'
  readonly clockFailures: number | 'unknown'
  readonly sinkFailures: number | 'unknown'
  readonly stderrFailures: number | 'unknown'
  readonly retainedBytes: number | 'unknown'
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
    readonly stage: 'delivery' | 'snapshot' | 'increment' | 'close'
    readonly reason: 'buffer_full' | 'consumer_failed' | 'scope_mismatch' | 'closed'
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
  readonly exportPage: (query: DiagnosticQuery) => Promise<DiagnosticExportResult>
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
    | 'evicted'
    | 'retainedBytes'
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
}

export interface DiagnosticEmitter {
  readonly record: (event: DiagnosticEvent) => DiagnosticRecordResult
  /** Discards unfinished local duration starts. It has no business effect. */
  readonly close: () => void
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
  readonly exportPage: (query: DiagnosticQuery) => Promise<DiagnosticExportResult>
  readonly health: () => DiagnosticHealth
  readonly metrics: (
    scope: DiagnosticScope,
  ) => DiagnosticMetrics | { readonly rejected: 'forbidden' }
  readonly close: () => Promise<DiagnosticCloseResult>
}
