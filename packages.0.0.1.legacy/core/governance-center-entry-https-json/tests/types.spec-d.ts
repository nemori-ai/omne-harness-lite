import { expectTypeOf, test } from 'vitest'
import type {
  EntryAnswer,
  GovernanceOutcome,
  GovernanceTransport,
  PublicHealthOptions,
} from '../src/index.ts'

test('a caller can substitute both transport methods without provider types', () => {
  const replacement: GovernanceTransport = {
    readPublicHealth: async () => ({ kind: 'unavailable', reason: 'connection' }),
    exchangeGovernance: async () => ({
      kind: 'unavailable',
      reason: 'connection',
      sendAttempted: false,
    }),
  }
  expectTypeOf(replacement.exchangeGovernance).parameters.toEqualTypeOf<
    [PublicHealthOptions, unknown]
  >()
  expectTypeOf<GovernanceOutcome['sendAttempted']>().toEqualTypeOf<boolean>()
  expectTypeOf<EntryAnswer>().toEqualTypeOf<
    'version-mismatch' | 'login-state-rejected' | 'invalid-input' | 'unavailable'
  >()
})
