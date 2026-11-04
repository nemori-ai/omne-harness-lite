// The `session-ad06` row: the Tool log consumption of Session (AD-06). The plugin is the one that
// `createSessionToolLogConsumptionPlugin` of `@omne-harness/session-adapters/cordis` returns. It
// provides no key and has no shutdown phase. It injects `session` (the plugin names the
// `coordinator` caller class itself), the same Journal provider's `agentJournal` (results, through
// `load`), `agentJournalEntries` (the entry port) and `agentMaterials`, and `sessionTransactions`, whose `commitEntries` is
// the one Session entry that publishes consequences, progress and answer in one commit (the AD-02
// batch that the SPEC names). The table row gives only `session` and the Journal views;
// `sessionTransactions` is the key the AD-06 SPEC implies and AD-05 injects for the same commit.
// With any key absent the row stays `PENDING`.
//
// Configuration (data only): `timeoutMs` and `retryBackoffMs`, both optional (the table's timeout
// and retry backoff).
//
// The Tool delivery material has no adopted schema (TOOL-SETTLEMENT-SCHEMA), so the row gives the
// plugin no reading of it: every Tool entry answers `unavailable` and stays for a later read. Who
// calls `consumeSessionToolLog`, and with which coordinator principal, is the assembly's to decide;
// the page has no such caller yet.
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { createSessionToolLogConsumptionPlugin } from '@omne-harness/session-adapters/cordis'
import { sessionKey, sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

const consumption = createSessionToolLogConsumptionPlugin({ toolDeliveries: null })

/** The call that reaches the current generation of the row; `unavailable` while there is none. */
export const consumeSessionToolLog = consumption.consume

export const sessionAd06Row = defineRow({
  row: 'session-ad06',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [
      sessionKey,
      agentJournalKey,
      agentJournalEntriesKey,
      agentMaterialsKey,
      sessionTransactionsKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: consumption.plugin,
})
