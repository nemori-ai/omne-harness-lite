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
