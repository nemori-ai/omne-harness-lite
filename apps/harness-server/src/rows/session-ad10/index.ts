// The `session-ad10` row: the evidence bridge of Session (AD-10). The plugin is the class
// `SessionEvidenceBridgeProvider` of `@omne-harness/session-adapters/cordis`. It injects the three
// narrow sources and provides `sessionEvidence`. It has no configuration and no shutdown phase.
//
// The manifest is longer than the `session-ad10` row of `src/s0/stubs.ts`: the table leaves out the
// three sources ("keys that the table gives only in prose"), the plugin injects all of them. Of the
// three only `sessionAdoptionSource` has a provider row (`adoption-sources`). `sessionProductionSource`
// and `sessionCustodySource` have none yet (the assembly page's gap table: the original fact owners),
// so in the full tree this row stays `PENDING` and names the two missing keys. That is the declared
// behaviour of the page, not a defect of the row.
import { SessionEvidenceBridgeProvider } from '@omne-harness/session-adapters/cordis'
import {
  sessionAdoptionSourceKey,
  sessionCustodySourceKey,
  sessionEvidenceKey,
  sessionProductionSourceKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const sessionAd10Row = defineRow({
  row: 'session-ad10',
  implementation: 'real',
  manifest: {
    provides: [sessionEvidenceKey],
    injects: [sessionAdoptionSourceKey, sessionProductionSourceKey, sessionCustodySourceKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: SessionEvidenceBridgeProvider,
})
