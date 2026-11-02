// The `agent-journal` row: the Agent Journal provider on the Session log. The plugin is the class
// `SessionLogAgentJournalProvider` of `@omne-harness/session-adapters/cordis`. It injects `storage`
// and `tenantDomainLookup` (both trusted, visible to this row) and `sessionAccessCheck`. It has no
// shutdown phase: its close effect makes later calls answer `unavailable`.
//
// Configuration (data only): `combinationVersion` and `manifestDigest` of the Session log
// combination, the same two values as the `session-storage` row declares (`config.ts` here computes
// the digest from the same catalog). `routeCacheEntries` is optional.
//
// The row provides `agentJournal` only. The table row also lists `agentJournalEntries` and
// `agentMaterials`, which the SPEC says have no plugin yet (K-9 of `session-adapters`: the write of
// `AgentMaterials` carries no execution, so the way to the session is not decided). The row does not
// stand in for them. Until they have a provider, `agent-host`, which injects all three, stays
// `PENDING`; the table's `sameProviderGroup` is kept, so a second row that takes one of the missing
// keys is refused before loading.
import { SessionLogAgentJournalProvider } from '@omne-harness/session-adapters/cordis'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { sessionAccessCheckKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export { agentJournalCombination } from './config.ts'

export const agentJournalRow = defineRow({
  row: 'agent-journal',
  implementation: 'real',
  manifest: {
    provides: [agentJournalKey],
    injects: [sessionAccessCheckKey, storageKey, tenantDomainLookupKey],
    sameProviderGroup: 'agent-journal',
  },
  lifecycle: { kind: 'none' },
  plugin: SessionLogAgentJournalProvider,
})
