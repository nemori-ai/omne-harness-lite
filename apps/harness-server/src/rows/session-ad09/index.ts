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
