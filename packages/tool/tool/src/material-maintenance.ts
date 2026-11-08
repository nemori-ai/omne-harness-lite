import type { ToolMaterialClock, ToolMaterialStore } from '@omne-harness/tool-contract/provider'
import type { ToolLedgerMaintenance } from './construction.ts'
import type { ToolAccessGuard } from './ledger-guards.ts'
import type { ToolLedgerStore } from './ledger-store.ts'
import { createLedgerTransactions } from './ledger-transactions.ts'
import { createLedgerAccess } from './ledger-access.ts'
import { createLedgerMaterialMaintenance } from './ledger-material-maintenance.ts'
import { isPositiveSafeInteger } from './limits.ts'

export type ToolMaterialMaintenanceInput<P> = Readonly<{
  store: ToolLedgerStore
  access: ToolAccessGuard<P>
  materials: Readonly<{
    clock: ToolMaterialClock
    store: Pick<ToolMaterialStore<P>, 'inspectErase' | 'erase'>
  }>
  ledgerCommitAttempts: number
}>

export function createToolMaterialMaintenance<P>(
  input: ToolMaterialMaintenanceInput<P>,
): ToolLedgerMaintenance<P> {
  if (!isPositiveSafeInteger(input.ledgerCommitAttempts))
    throw new TypeError('ledgerCommitAttempts: range')
  const { access, entry } = createLedgerAccess(input.access)
  const { transact } = createLedgerTransactions(input.store, input.ledgerCommitAttempts)
  return Object.freeze(
    createLedgerMaterialMaintenance({
      materials: input.materials,
      entry: supplied => entry(supplied, 'maintain-materials'),
      authorize: supplied => access(supplied, 'maintain-materials'),
      transact,
    }),
  )
}
