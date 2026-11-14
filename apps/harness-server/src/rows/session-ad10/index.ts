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
