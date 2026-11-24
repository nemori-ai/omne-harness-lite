import type { JsonValue } from '@omne-harness/json-text'

export type ProtocolKey = { readonly name: string; readonly major: number }

export type CallRequest = {
  readonly protocol: ProtocolKey
  readonly operation: string
  readonly messageId: string
  /** The revision of the protocol contract the caller was built with; absent means 1. */
  readonly revision?: number
  readonly body: JsonValue
  readonly signal?: AbortSignal
}

export type CallReport =
  | { readonly kind: 'answered'; readonly outcome: string; readonly body: JsonValue }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'uncertain' }

export type ObserveRequest = {
  readonly protocol: ProtocolKey
  readonly observation: string
  readonly messageId: string
  readonly revision?: number
  readonly open: JsonValue
  readonly signal: AbortSignal
}

export type ObserveEnd =
  | { readonly kind: 'ended'; readonly reason: string }
  | { readonly kind: 'refused'; readonly outcome: string }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'uncertain' }
  | { readonly kind: 'aborted' }

export interface Transport {
  call(request: CallRequest): Promise<CallReport>
  observe(request: ObserveRequest): AsyncGenerator<JsonValue, ObserveEnd, undefined>
}
