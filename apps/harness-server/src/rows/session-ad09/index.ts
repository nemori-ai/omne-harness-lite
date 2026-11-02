// The `session-ad09` row: the identity bridge of Session (AD-09). The plugin is the class
// `SessionIdentityBridgeProvider` of `@omne-harness/session-adapters/cordis`. It injects the
// entry object `principalVerifier` and provides `sessionIdentity`. It has no configuration and no
// shutdown phase. With the verifier absent the row stays `PENDING`.
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { SessionIdentityBridgeProvider } from '@omne-harness/session-adapters/cordis'
import { sessionIdentityKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const sessionAd09Row = defineRow({
  row: 'session-ad09',
  implementation: 'real',
  manifest: {
    provides: [sessionIdentityKey],
    injects: [principalVerifierKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: SessionIdentityBridgeProvider,
})
