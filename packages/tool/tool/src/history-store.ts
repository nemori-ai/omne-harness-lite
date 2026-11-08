import type { ToolRevision } from '@omne-harness/tool-contract'
import type { LedgerDomain, ToolLedgerStore } from './ledger-store.ts'

/** Storage keeps historical values opaque until Tool identifies their format. */
export type ToolHistoryStoredRecord = Readonly<{ key: string; record: unknown }>
export type ToolHistoryLedgerRead =
  | Readonly<{
      kind: 'complete'
      revision: ToolRevision
      records: readonly ToolHistoryStoredRecord[]
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** A trusted maintenance dependency, never an alternate public result reader. */
export interface ToolHistoryLedgerStore {
  read(domain: LedgerDomain): Promise<ToolHistoryLedgerRead>
  commit: ToolLedgerStore['commit']
}
