// The `agent-journal` row: the Agent Journal provider on the Session log. The plugin is the one
// `createSessionAgentJournalPlugin` of `@omne-harness/session-adapters/cordis` makes from the
// trusted cancellation installation the entry hands in (R2-D35). It injects `storage`
// and `tenantDomainLookup` (both trusted, visible to this row) and `sessionAccessCheck`. It has no
// shutdown phase: its close effect makes later calls answer `unavailable`.
//
// The release row holds the installation of `src/entry/cancellation-installation.ts` (the record and
// its pure judgment). It is not configuration and not a Cordis service. `createAgentJournalRow({})`
// makes the row without one: the cancellation variants then answer `unavailable`.
//
// Configuration (data only): `combinationVersion` and `manifestDigest` of the Session log
// combination, the same two values as the `session-storage` row declares (`config.ts` here computes
// the digest from the same catalog). `routeCacheEntries` is optional.
//
// The row provides `agentJournal`, `agentJournalEntries`, `agentMaterials`, the two faces of the
// Model result receiver, `agentReceivedCommits` and `agentModelReceptionTargets` (R2-D237), the
// target query of the Tool result receiver, `agentToolReceptionTargets` (R2-D273), and
// `sessionAdoptedRequests`: the one plugin body makes the services over one session-log Journal, so
// they are in one authoritative ordering (agent-cordis-contract SPEC "生产者接收面的服务").
// `sessionAdoptedRequests` is the fixed request that the last main-purpose M0 recorded in the session
// log (FIXED-FACTS F4); the `session-ad04` row reads it per call. It is a root name, not in the
// trusted table (R2-D246; the trusted visibility is wave 3 R3). The table's `sameProviderGroup` is
// kept, so a second row that takes one of these keys is refused before loading.
//
// It also provides `agentReceivedRecords`, the read face of the same received records (R2-D257): a
// trusted name, visible to this row and to `model-records` only, where the evidence adapter of the
// Agent consumer owner confirms a Model ACK from the record the receiver committed.
import {
  createSessionAgentJournalPlugin,
  type SessionAgentJournalPluginInput,
} from '@omne-harness/session-adapters/cordis'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentModelReceptionTargetsKey,
  agentReceivedCommitsKey,
  agentReceivedRecordsKey,
  agentToolReceptionTargetsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  sessionAccessCheckKey,
  sessionAdoptedRequestsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { releaseCancellation } from '../../entry/cancellation-installation.ts'
import { defineRow } from '../../row.ts'

export { agentJournalCombination } from './config.ts'

/** The row with the given trusted cancellation installation; none: cancelled settlement is `unavailable`. */
export function createAgentJournalRow(input: SessionAgentJournalPluginInput = {}) {
  return defineRow({
    row: 'agent-journal',
    implementation: 'real',
    manifest: {
      provides: [
        agentJournalKey,
        agentJournalEntriesKey,
        agentMaterialsKey,
        agentReceivedCommitsKey,
        agentReceivedRecordsKey,
        agentModelReceptionTargetsKey,
        agentToolReceptionTargetsKey,
        sessionAdoptedRequestsKey,
      ],
      injects: [sessionAccessCheckKey, storageKey, tenantDomainLookupKey],
      sameProviderGroup: 'agent-journal',
    },
    lifecycle: { kind: 'none' },
    plugin: createSessionAgentJournalPlugin(input),
  })
}

/** The row the release names: the Journal holds the cancellation installation of the release. */
export const agentJournalRow = createAgentJournalRow({ cancellation: releaseCancellation })
