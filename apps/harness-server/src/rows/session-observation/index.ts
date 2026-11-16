import {
  modelStreamObservationKey,
  modelStreamReferencesKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  createSessionObservationPlugin,
  sessionObservationKey,
} from '@omne-harness/session-observation/cordis'
import { LOCAL_HISTORY_KINDS } from '../../local/operator-defaults.ts'
import { defineRow } from '../../row.ts'

export const sessionObservationRow = defineRow({
  row: 'session-observation',
  implementation: 'real',
  manifest: {
    provides: [sessionObservationKey],
    injects: [sessionKey, modelStreamReferencesKey, modelStreamObservationKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createSessionObservationPlugin<unknown>({ historyKinds: LOCAL_HISTORY_KINDS }),
})
