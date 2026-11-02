// The `agent-account-outlet` row: the account outlet of Agent as a Request Context account fact.
// The plugin is `AgentAccountOutletProvider` of `@omne-harness/agent-context/cordis`. It injects
// `requestContext` and `contextAccountingInbox` (both provided by the `request-context` row in one
// fiber) and provides `agentAccountOutlet`. It has no shutdown phase: the outlet answers
// `unavailable` (`outlet-closed`) after its fiber ends. In the first wave it has no target
// resolver, so every delivery answers `unavailable` with `scope-unresolved`.
//
// Configuration: the plugin takes one field, `sender`, the adoption identity (`owner`, `name`,
// `revision`, `digest`, all text) that the outlet gives as the sender of every fact. The assembly
// page lists no configuration for this row ("无"); the row keeps the plugin's `Config` as it is and
// the release has to give `sender`. This is a gap of the page, not of the row.
import { AgentAccountOutletProvider } from '@omne-harness/agent-context/cordis'
import { agentAccountOutletKey } from '@omne-harness/agent-cordis-contract/cordis'
import {
  contextAccountingInboxKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const agentAccountOutletRow = defineRow({
  row: 'agent-account-outlet',
  implementation: 'real',
  manifest: {
    provides: [agentAccountOutletKey],
    injects: [requestContextKey, contextAccountingInboxKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: AgentAccountOutletProvider,
})
