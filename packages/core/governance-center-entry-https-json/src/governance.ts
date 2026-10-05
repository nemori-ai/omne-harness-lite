import type { EntryAnswer, HealthUnavailableReason } from './protocol.ts'

export type GovernanceOutcome = (
  | {
      readonly kind: 'reply'
      readonly reply: { readonly result: unknown } | { readonly failure: string }
    }
  | { readonly kind: 'entry-answer'; readonly answer: EntryAnswer }
  | { readonly kind: 'unavailable'; readonly reason: HealthUnavailableReason }
) & { readonly sendAttempted: boolean }
