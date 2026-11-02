// The `agent-journal` row: the Agent Journal provider on the Session log. The plugin is the class
// `SessionLogAgentJournalProvider` of `@omne-harness/session-adapters/cordis`. It injects `storage`
// and `tenantDomainLookup` (both trusted, visible to this row) and `sessionAccessCheck`. It has no
// shutdown phase: its close effect makes later calls answer `unavailable`.
//
// Configuration (data only): `combinationVersion` and `manifestDigest` of the Session log
// combination, the same two values as the `session-storage` row declares (`config.ts` here computes
// the digest from the same catalog). `routeCacheEntries` is optional.
//
// The row provides `agentJournal`, `agentJournalEntries` and `agentMaterials`: the one plugin body
// makes the three services over one session-log Journal, so they are in one authoritative ordering
// (agent-cordis-contract SPEC "生产者接收面的服务"). The table's `sameProviderGroup` is kept, so a
// second row that takes one of the three keys is refused before loading.
import { SessionLogAgentJournalProvider } from '@omne-harness/session-adapters/cordis'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { sessionAccessCheckKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export { agentJournalCombination } from './config.ts'

export const agentJournalRow = defineRow({
  row: 'agent-journal',
  implementation: 'real',
  manifest: {
    provides: [agentJournalKey, agentJournalEntriesKey, agentMaterialsKey],
    injects: [sessionAccessCheckKey, storageKey, tenantDomainLookupKey],
    sameProviderGroup: 'agent-journal',
  },
  lifecycle: { kind: 'none' },
  plugin: SessionLogAgentJournalProvider,
})
