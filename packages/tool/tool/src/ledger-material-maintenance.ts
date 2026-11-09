// Reclaim of result, raw and final materials whose cleanup the ledger recorded. Body bytes are
// not materials: the sweep over the due index (BodyLifecycle `DeleteBytes`, `Reclaim`) owns them.
import type { Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import type { ToolMaterialClock, ToolMaterialStore } from '@omne-harness/tool-contract/provider'
import type { CallInput } from './boundary.ts'
import type { ToolLedgerMaintenance } from './construction.ts'
import type { Decision, Mint, Snapshot } from './ledger-decider.ts'
import { createMaterialReclaimer } from './ledger-material-reclaim.ts'
import type { LedgerDomain } from './ledger-store.ts'

type MaintenanceTransaction = <T>(
  domain: LedgerDomain,
  operation: ToolOperationId | null,
  decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<T>>,
  unknown: Outcome<T, ToolFailure>,
) => Reply<T>

export type MaterialMaintenancePorts<P> = Readonly<{
  materials:
    | Readonly<{
        clock: ToolMaterialClock
        store: Pick<ToolMaterialStore<P>, 'inspectErase' | 'erase'>
      }>
    | undefined
  entry(input: unknown): Reply<CallInput<P>>
  authorize(input: CallInput<P>): Reply<void>
  transact: MaintenanceTransaction
}>

export function createLedgerMaterialMaintenance<P>(
  ports: MaterialMaintenancePorts<P>,
): ToolLedgerMaintenance<P> {
  return { reclaim: createMaterialReclaimer(ports) }
}
