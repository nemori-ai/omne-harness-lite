// EC v1 PublicHealthReply / HT1 v1 S-17；线上权威是冻结 Schema，不是这份 TS 投影。
export interface PublicHealthReply {
  readonly reachable: true
  readonly centerId: string
  readonly version: string
}

export type EntryAnswer =
  'version-mismatch' | 'login-state-rejected' | 'invalid-input' | 'unavailable'

export type HealthUnavailableReason =
  | 'connection'
  | 'trust'
  | 'timeout'
  | 'cancelled'
  | 'response-framing'
  | 'response-limit'
  | 'response-invalid'

export type PublicHealthOutcome =
  | { readonly kind: 'health'; readonly reply: PublicHealthReply }
  | { readonly kind: 'entry-answer'; readonly answer: EntryAnswer }
  | { readonly kind: 'unavailable'; readonly reason: HealthUnavailableReason }
