export type TransportReport =
  | { readonly kind: 'response'; readonly bytes: Uint8Array }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'uncertain' }

export interface GovernanceTransport {
  send(bytes: Uint8Array): Promise<TransportReport>
}
