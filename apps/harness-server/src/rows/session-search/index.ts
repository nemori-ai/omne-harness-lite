import {
  sessionAccessCheckKey,
  sessionHistoryIndexKey,
  sessionHistoryLogKey,
  sessionSearchCursorsKey,
  sessionSearchKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createSessionSearchPlugin } from '@omne-harness/session-cordis/cordis'
import { LOCAL_HISTORY_SEARCH } from '../../local/operator-defaults.ts'
import { defineRow } from '../../row.ts'

/** The history search and the follower of the logs. Without this row nothing reads the index. */
export const sessionSearchRow = defineRow({
  row: 'session-search',
  implementation: 'real',
  manifest: {
    provides: [sessionSearchKey],
    injects: [
      sessionAccessCheckKey,
      sessionHistoryIndexKey,
      sessionHistoryLogKey,
      sessionSearchCursorsKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createSessionSearchPlugin(LOCAL_HISTORY_SEARCH),
})
