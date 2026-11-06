import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  EmptyBody,
  GovernanceCodecLimits,
  GovernanceDiagnostic,
  GovernanceEncodeResult,
  JsonObject,
  ProofInput,
} from './messages.ts'

export type SessionCodecLimits = GovernanceCodecLimits
export type SessionDiagnostic = GovernanceDiagnostic
export type SessionEncodeResult = GovernanceEncodeResult

export type SessionTarget = { readonly tenant: TenantId; readonly session: string }

/** The producer of a call that `stop-call` selects. */
export type SessionProducerRef = { readonly kind: 'model' | 'tool'; readonly call: string }
/** The origin of a recorded terminal fact. Declared here so the wire shape needs no other package. */
export type SessionTerminalSource = {
  readonly owner: string
  readonly record: string
  readonly revision: string
  readonly digest: string
}

export type SessionRequestBodies = {
  'create-session': {
    readonly createCallId: string
    readonly definition: string
    readonly purpose: string
  }
  'query-create-session': { readonly tenant: TenantId; readonly createCallId: string }
  'send-input': SessionTarget & {
    readonly acceptId: string
    readonly inputId: string
    readonly message: JsonObject
  }
  'query-send-input': SessionTarget & { readonly acceptId: string }
  'read-history':
    | (SessionTarget & {
        readonly cursor: null
        readonly direction: 'forward' | 'backward'
        readonly pageBytes: string
      })
    | (SessionTarget & { readonly cursor: string })
  'cancel-run': SessionTarget & {
    readonly controlId: string
    readonly run: string
    readonly urgency: 'graceful' | 'force'
  }
  'stop-call': SessionTarget & {
    readonly controlId: string
    readonly producer: SessionProducerRef
  }
  /** `run` null reads every Run from the newest; otherwise one Run. Both occur only with a null cursor. */
  'read-session-diagnostics':
    | (SessionTarget & {
        readonly cursor: null
        readonly run: string | null
        readonly pageBytes: string
      })
    | (SessionTarget & { readonly cursor: string })
}
export type SessionOperation = keyof SessionRequestBodies

export type SessionRequestByOperation = {
  readonly [O in SessionOperation]: {
    readonly protocolVersion: 'session-public/1'
    readonly messageId: string
    readonly operation: O
    readonly proof: ProofInput
    readonly body: SessionRequestBodies[O]
  } & (O extends 'create-session' ? { readonly actingTenant: TenantId } : {})
}
export type SessionRequest<O extends SessionOperation = SessionOperation> =
  SessionRequestByOperation[O]

export type SessionHistoryEntry = {
  readonly entryId: string
  readonly revision: string
  readonly kind: string
  readonly payload: JsonValue
}
export type SessionHistoryPage = {
  readonly entries: readonly SessionHistoryEntry[]
  readonly next: string | null
  readonly exhausted: boolean
  readonly scannedThrough: string
}
// The session diagnostics page (SPEC「会话诊断页」). Every value a source did not give is an
// explicit `unknown` with the reason of that read; nothing here says an event did not happen.
export type SessionDiagnosticGapSource = 'session' | 'agent' | 'model' | 'tool'
export type SessionDiagnosticGapReason =
  | 'unsupported'
  | 'unavailable'
  | 'denied'
  | 'not-disclosed'
  | 'not-accepted'
  | 'not-found'
  | 'not-recorded'
  | 'retention-expired'
  | 'truncated'
/** One read a source refused or could not serve. `subject` names what was asked for. */
export type SessionDiagnosticGap = {
  readonly source: SessionDiagnosticGapSource
  readonly subject: string
  readonly reason: SessionDiagnosticGapReason
}
/** A value the projection could not read, with the reason of that read. */
export type SessionDiagnosticUnknown = {
  readonly kind: 'unknown'
  readonly reason: Exclude<SessionDiagnosticGapReason, 'not-disclosed' | 'truncated'>
}
export type SessionDiagnosticInstant =
  | { readonly kind: 'known'; readonly instant: string }
  | { readonly kind: 'unknown' }
export type SessionDiagnosticMilliseconds =
  | { readonly kind: 'known'; readonly milliseconds: string }
  | { readonly kind: 'unknown' }
/** An adoption of another owner, in the wire shape of this package. */
export type SessionAdoptionRef = {
  readonly owner: string
  readonly name: string
  readonly revision: string
  readonly digest: string
}
/**
 * The closed fields of Agent's finish candidate. `none`: a completed Run, whose finish the
 * projection does not read. `no-failure`: a finish read without a failure candidate. `cause` of
 * `no-reply` and `failure` of `model-refused` are the owner's closed kinds; no diagnostic text.
 */
export type SessionRunCause =
  | SessionDiagnosticUnknown
  | { readonly kind: 'none' }
  | { readonly kind: 'no-failure'; readonly conclusion: 'complete' | 'fail' | 'cancelled' }
  | {
      readonly kind: 'model-refused'
      readonly failure: 'denied' | 'invalid' | 'unsupported' | 'capacity'
    }
  | {
      readonly kind: 'no-reply'
      readonly cause: string | null
      readonly upstreamStatus: string | null
    }
  | { readonly kind: 'request-rejected' }
  | { readonly kind: 'cannot-fit'; readonly reason: 'fixed' | 'after-compaction' }
  | { readonly kind: 'compaction-invalid' }
  | { readonly kind: 'message-rejected' }
  | { readonly kind: 'extension-stop' }
  | { readonly kind: 'guard' }
export type SessionRunTerminal = {
  readonly outcome: 'completed' | 'failed' | 'cancelled'
  readonly cause: { readonly record: string | null; readonly structured: SessionRunCause }
}
/** The closed fields of a `control.requested` or `control.progress` entry; null where the entry carries none. */
export type SessionRunControl = {
  readonly position: string
  readonly kind: 'requested' | 'progress'
  readonly target: 'run' | 'producer' | 'session' | null
  readonly intent: 'control' | 'interrupt' | 'auto-archive' | null
  readonly state: 'committed' | 'propagating' | 'reconciled' | null
}
export type SessionModelAttemptDiagnostic = {
  readonly dispatch: string
  readonly revision: string
  readonly adapter: SessionAdoptionRef
  readonly send: 'not-sent' | 'sent' | 'unknown'
  readonly firstContent: 'none-proven' | 'observed' | 'uncertain'
  readonly outcome:
    | { readonly kind: 'pending' }
    | { readonly kind: 'completed'; readonly reason: 'stop' | 'limit' | 'tool-suggestions' }
    | { readonly kind: 'interrupted' }
    | { readonly kind: 'failed'; readonly cause: string; readonly upstreamStatus: string | null }
  readonly timing: {
    readonly materialize: SessionDiagnosticMilliseconds
    readonly sendToFirstContent: SessionDiagnosticMilliseconds
    readonly execution: SessionDiagnosticMilliseconds
  }
}
/** The usage and cost items of a call account: their source and numeric state, never a converted amount. */
export type SessionCallAccountView = {
  readonly kind: 'account'
  readonly usage: readonly {
    readonly name: string
    readonly unit: string
    readonly state: 'unknown' | 'known' | 'provisional'
    readonly lexeme: string | null
  }[]
  readonly cost: readonly {
    readonly source: string
    readonly unit: string
    readonly state: 'unknown' | 'known' | 'provisional'
    readonly lexeme: string | null
  }[]
  readonly duration:
    | { readonly kind: 'known'; readonly value: string }
    | { readonly kind: 'unknown' }
  readonly receipt: 'received' | 'late'
}
export type SessionModelCallDiagnostic = {
  readonly reference: string
  readonly purpose: string
  readonly call:
    | {
        readonly kind: 'found'
        readonly call: string
        readonly phase: 'accepted' | 'running' | 'retry-decision' | 'settled'
      }
    | SessionDiagnosticUnknown
  readonly dispatches: readonly SessionModelAttemptDiagnostic[]
  readonly coverage: 'complete-through-snapshot' | 'expired-prefix' | 'unknown'
  readonly usage: SessionCallAccountView | SessionDiagnosticUnknown
}
export type SessionToolCallDiagnostic = {
  readonly reference: string
  readonly state:
    | {
        readonly kind: 'found'
        readonly call: string
        readonly phase:
          | 'accepted'
          | 'preparing'
          | 'queued'
          | 'starting'
          | 'running'
          | 'suspended'
          | 'settled'
        readonly relation: 'foreground' | 'background'
        readonly terminal: {
          readonly kind: 'completed' | 'failed' | 'unavailable' | 'interrupted' | 'no-response'
          readonly cause: string | null
        } | null
      }
    | SessionDiagnosticUnknown
  readonly account: SessionCallAccountView | SessionDiagnosticUnknown
  readonly diagnostics: 'unsupported'
}
export type SessionRunDiagnostic = {
  readonly run: string
  readonly entry: 'interactive' | 'dispatch'
  readonly execution: string
  readonly started: { readonly position: string; readonly at: SessionDiagnosticInstant }
  readonly attempts: string
  readonly controls: readonly SessionRunControl[]
  readonly terminal: SessionRunTerminal | null
  /** `registered` counts every `call.bound` of the Run; `projected` counts those that entered the fan-out. */
  readonly calls: { readonly registered: string; readonly projected: string }
  readonly modelCalls: readonly SessionModelCallDiagnostic[]
  readonly toolCalls: readonly SessionToolCallDiagnostic[]
  readonly messages: readonly { readonly kind: string; readonly count: string }[]
}
export type SessionDiagnosticsPage = {
  readonly runs: readonly SessionRunDiagnostic[]
  readonly next: string | null
  readonly exhausted: boolean
  readonly scannedThrough: string
  readonly basis: { readonly upper: string }
  readonly gaps: readonly SessionDiagnosticGap[]
}
export type SessionSuccessBodies = {
  'create-session': { readonly session: string; readonly recovered: boolean }
  'query-create-session': { readonly session: string }
  'send-input': { readonly recovered: boolean }
  'query-send-input': EmptyBody
  'read-history': SessionHistoryPage
  'cancel-run':
    | { readonly kind: 'requested'; readonly controlId: string; readonly run: string }
    | {
        readonly kind: 'ended'
        readonly controlId: string
        readonly run: string
        readonly terminal: {
          readonly outcome: 'completed' | 'failed' | 'cancelled'
          readonly source: SessionTerminalSource
        }
      }
  'stop-call':
    | {
        readonly kind: 'requested'
        readonly controlId: string
        readonly producer: SessionProducerRef
      }
    | {
        readonly kind: 'ended'
        readonly controlId: string
        readonly producer: SessionProducerRef
        readonly terminal: {
          readonly version: string
          readonly outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response'
          readonly source: SessionTerminalSource
        }
      }
  'read-session-diagnostics': SessionDiagnosticsPage
}
export type SessionOutcomes = {
  'create-session':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
  'query-create-session': 'succeeded' | 'denied' | 'basis-unavailable' | 'unknown'
  'send-input':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'archived'
    | 'frozen'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
  'query-send-input': 'succeeded' | 'not-committed' | 'denied' | 'basis-unavailable' | 'unknown'
  'read-history': 'succeeded' | 'denied' | 'invalid' | 'basis-unavailable'
  'cancel-run':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'not-found'
    | 'basis-unavailable'
    | 'unknown'
  'stop-call':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'not-found'
    | 'basis-unavailable'
    | 'unknown'
    | 'unsupported'
  'read-session-diagnostics': 'succeeded' | 'denied' | 'invalid' | 'basis-unavailable'
}

export type SessionProtocolRejected = {
  readonly protocolVersion: 'session-public/1'
  readonly messageId?: string
  readonly outcome: 'protocol-rejected'
  readonly body: EmptyBody
}
export type SessionBusinessResponse<O extends SessionOperation> = {
  readonly [K in SessionOutcomes[O]]: {
    readonly protocolVersion: 'session-public/1'
    readonly messageId: string
    readonly outcome: K
    readonly body: K extends 'succeeded' ? SessionSuccessBodies[O] : EmptyBody
  }
}[SessionOutcomes[O]]
export type SessionResponseByOperation = {
  readonly [O in SessionOperation]: SessionProtocolRejected | SessionBusinessResponse<O>
}
export type SessionResponse<O extends SessionOperation = SessionOperation> =
  SessionResponseByOperation[O]

export type SessionRequestRead =
  | { readonly kind: 'request'; readonly request: SessionRequest }
  | {
      readonly kind: 'protocol-rejected'
      readonly response: SessionProtocolRejected
      readonly diagnostic: SessionDiagnostic
    }
export type SessionResponseRead<O extends SessionOperation> =
  | { readonly kind: 'response'; readonly response: SessionResponse<O> }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'unreadable'; readonly diagnostic: SessionDiagnostic }

export type SessionResponseEncodeInput<O extends SessionOperation = SessionOperation> = {
  readonly [K in O]: {
    readonly operation: K
    readonly response: SessionResponse<K>
    readonly limits: SessionCodecLimits
  }
}[O]
