// The identity operations of the row, taken from the tree on every call. The assembly page lists
// `identityOperations` as a name the row reads per call, not a name it injects, so a reloaded
// identity provider is seen by the next request and a missing one never blocks the row.
import type { Context } from '@deepseek-ai/cordis'
import type { IdentityOperations } from '@omne-harness/identity'
import { identityOperationsKey } from '@omne-harness/identity/cordis'

const MISSING = 'identity operations are not provided by the tree'

export function identityOfCall(ctx: Context): IdentityOperations {
  const current = (): IdentityOperations | undefined => ctx.get(identityOperationsKey)
  return {
    async registerAndActivate(input) {
      const identity = current()
      // The operation has no "unavailable" outcome. The entry answers an empty 500 for a throw.
      if (identity === undefined) throw new Error(MISSING)
      return identity.registerAndActivate(input)
    },
    async issueLogin(input) {
      const identity = current()
      if (identity === undefined) return { kind: 'basis-unavailable', diagnostic: MISSING }
      return identity.issueLogin(input)
    },
    async recognizeLogin(input) {
      const identity = current()
      if (identity === undefined) return { kind: 'basis-unavailable', diagnostic: MISSING }
      return identity.recognizeLogin(input)
    },
  }
}
