// The transport of the client core (RFC-0015 §6「客户端核心」, #1249 spec 已定 16 and 17). It
// carries the identity: the client core never sees a login proof. Bodies, openings and frames are
// json-text value trees; the transport only writes and reads them as text.
import type { JsonValue } from '@omne-harness/json-text'

export type ProtocolKey = { readonly name: string; readonly major: number }

export type CallRequest = {
  readonly protocol: ProtocolKey
  readonly operation: string
  readonly messageId: string
  readonly body: JsonValue
  readonly signal?: AbortSignal
}

/**
 * What one send of a call came to. `not-sent` is a proof that no request byte left; any other
 * failure is `uncertain`, because the peer may have read some or all of the bytes.
 */
export type CallReport =
  | { readonly kind: 'answered'; readonly outcome: string; readonly body: JsonValue }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'uncertain' }

export type ObserveRequest = {
  readonly protocol: ProtocolKey
  readonly observation: string
  readonly messageId: string
  readonly open: JsonValue
  readonly signal: AbortSignal
}

/**
 * How an observation stream ended: the peer's `ended` frame, a refused opening with its outcome,
 * no byte sent, a stream that stopped without an `ended` frame, or the caller's own abort.
 */
export type ObserveEnd =
  | { readonly kind: 'ended'; readonly reason: string }
  | { readonly kind: 'refused'; readonly outcome: string }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'uncertain' }
  | { readonly kind: 'aborted' }

export interface Transport {
  call(request: CallRequest): Promise<CallReport>
  /** Yields the frames; its return value is how the stream ended. */
  observe(request: ObserveRequest): AsyncGenerator<JsonValue, ObserveEnd, undefined>
}
