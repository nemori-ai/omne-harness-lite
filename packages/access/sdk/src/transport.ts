/**
 * What a transport reports for one send. `not-sent` is a proof that no request byte left. Any
 * other failure is `uncertain`, because the peer may have read some or all of the bytes.
 */
export type TransportReport =
  | { readonly kind: 'response'; readonly bytes: Uint8Array }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'uncertain' }

/** The caller-supplied channel for one public location. It never sees a decoded message. */
export interface GovernanceTransport {
  send(bytes: Uint8Array): Promise<TransportReport>
}
