/** Engineering observations are neither session-log records nor recovery evidence. */
import type { JsonNumber } from '@omne-harness-lite/content-blocks'

import type { InputMeasurement } from './planning-types.ts'

export type DiagnosticSource = 'runtime' | 'invocation' | 'transport' | 'observer' | 'assembly'

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

export interface DiagnosticReference {
  readonly collectorId: string
  /** '0' is reserved for an empty query through watermark, never a record identity. */
  readonly sequence: string
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

/** Safe planning projection: the binding's configuration values are never diagnostic data. */
export type DiagnosticMeasurementBasis = Omit<InputMeasurement['basis'], 'binding'>
export type DiagnosticCalibrationSource =
  | { readonly kind: 'none'; readonly reason: 'no_observation' | 'source_unavailable' }
  | {
      readonly kind: 'observation'
      readonly observedInputKind: 'from_usage' | 'upstream_total' | 'unavailable'
      readonly requestInput?: {
        readonly projectionRevision: string
        readonly prefixBoundary: JsonNumber
        readonly prefixDigest: string
        readonly inputEnvelopeDigest: string
      }
    }
export type DiagnosticMeasurementFact = {
  readonly kind: 'measurement'
  readonly basis: DiagnosticMeasurementBasis
  readonly calibrationSource: DiagnosticCalibrationSource
} & (
  | Omit<Extract<InputMeasurement, { mode: 'full' }>, 'basis'>
  | Omit<Extract<InputMeasurement, { mode: 'marginal' }>, 'basis'>
)

export type DiagnosticFact =
  | DiagnosticMeasurementFact
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
      readonly responseOutcome?: 'complete' | 'truncated' | 'failed' | 'interrupted'
      readonly anchor?: 'dispatched' | 'opened' | 'response' | 'ended'
      readonly anchorId?: string
      readonly retry?: 'again' | 'refused' | 'without_resend'
      readonly owner?: string
      readonly policy?: string
      readonly submissions?: JsonNumber
      readonly tailConflicts?: JsonNumber
      readonly inputTokens?: JsonNumber
      readonly outputTokens?: JsonNumber
      readonly cacheReadTokens?: JsonNumber
      readonly cacheWriteTokens?: JsonNumber
      readonly costUsd?: JsonNumber
    }
  | {
      readonly kind: 'registration'
      readonly phase?: 'published' | 'admitted' | 'retiring' | 'closed'
      readonly references?: JsonNumber
      readonly executions?: JsonNumber
      readonly cancellation?: 'requested' | 'stopped' | 'remaining_active' | 'cleanup_failed'
    }
  | {
      readonly kind: 'observer'
      readonly observerStage: 'offer' | 'delivery' | 'close'
      readonly reason:
        'malformed' | 'observer_scope_mismatch' | 'unavailable' | 'buffer_full' | 'consumer_failed'
      readonly position?: JsonNumber
      readonly bufferedEvents?: JsonNumber
      readonly bufferedBytes?: JsonNumber
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
      readonly count?: JsonNumber
    }

export type DiagnosticEventBase = {
  readonly source: DiagnosticSource
  readonly outcome: DiagnosticOutcome
  readonly binding?: DiagnosticBinding
}

export type DiagnosticEvent = DiagnosticEventBase &
  (
    | {
        readonly stage: 'admission' | 'binding' | 'credential'
        readonly facts: Extract<DiagnosticFact, { kind: 'decision' }>
      }
    | {
        readonly stage: 'planning'
        readonly facts: Extract<DiagnosticFact, { kind: 'decision' | 'measurement' }>
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

export type DiagnosticDropReason = 'invalid' | 'unsupported' | 'oversize' | 'queue_full' | 'closed'
export type DiagnosticRecordResult =
  { readonly recorded: DiagnosticReference } | { readonly dropped: DiagnosticDropReason }

export interface DiagnosticEmitter {
  readonly record: (event: DiagnosticEvent) => DiagnosticRecordResult
  /** Discards unfinished local duration starts. It has no business effect. */
  readonly close: () => void
}
