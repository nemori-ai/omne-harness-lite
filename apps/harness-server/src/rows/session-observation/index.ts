// The `session-observation` row: session observation (RFC-0015 §8). The plugin is
// `createSessionObservationPlugin` of `@omne-harness/session-observation/cordis`. It provides
// `sessionObservation`, injects `session` as the `reader` caller class and the two public Model
// stream faces, and holds the one listener of `session-cordis-contract/committed` on the tree. The
// kinds that wake a locate besides `call.bound`, `run.started` and `run.terminal` are the history
// kinds of this deployment (`LOCAL_HISTORY_KINDS`), so「what reading history gives」and「which
// notice means new content」have one source. No configuration and no shutdown phase.
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
