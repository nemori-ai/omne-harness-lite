import type { AgentExecutionId, AgentOperationId } from '@omne-harness/agent-contract'
import {
  foldItems,
  viewItems,
  viewOfItems,
  type ExecutionView,
  type PublishedBatch,
  type SessionJournalView,
} from '../journal/index.ts'
import type { ObligationView } from '../journal/view.ts'
import type { ObligationLedger } from './obligation-ledger.ts'
import type { SharedMap } from '../journal/shared-map.ts'

export type ItemRef = Readonly<{ execution: AgentExecutionId; family: string; item: string }>

export const itemText = (ref: ItemRef): string =>
  JSON.stringify([ref.execution, ref.family, ref.item])

// What an operation answered, kept closed under the operation: a repeat is recognized by it.
export const ANSWER_FAMILY = 'answer'

export const answerRef = (execution: AgentExecutionId, operation: AgentOperationId): ItemRef => ({
  execution,
  family: ANSWER_FAMILY,
  item: operation,
})

// A read needs closed items its round has not read: the provider reads them back and runs again.
export class NeedItems extends Error {
  readonly refs: readonly ItemRef[]

  constructor(refs: readonly ItemRef[]) {
    super(`the round needs ${String(refs.length)} closed item(s) it has not read`)
    this.refs = refs
  }
}

// Closed items by itemText (null: none stored): the whole store, or what this call closed or read.
export type ClosedTable = Readonly<{ closed: SharedMap<string, unknown>; closedComplete: boolean }>

export const peekClosed = (table: ClosedTable, ref: ItemRef): unknown =>
  table.closed.get(itemText(ref)) ?? null

// For a read that must know: throws NeedItems naming what the table does not hold.
export function needClosed(table: ClosedTable, ref: ItemRef): unknown {
  const text = itemText(ref)
  if (table.closed.has(text)) return table.closed.get(text) ?? null
  if (table.closedComplete) return null
  throw new NeedItems([ref])
}

export function needAllClosed(
  table: ClosedTable,
  refs: readonly ItemRef[],
): ReadonlyMap<string, unknown> {
  const missing = table.closedComplete ? [] : refs.filter(ref => !table.closed.has(itemText(ref)))
  if (missing.length > 0) throw new NeedItems(missing)
  return new Map(refs.map(ref => [ref.item, table.closed.get(itemText(ref)) ?? null]))
}

export function closedObligations(
  table: ClosedTable,
  execution: AgentExecutionId,
  ids: readonly string[],
): ObligationLedger {
  const found = needAllClosed(
    table,
    ids.map(item => ({ execution, family: 'obligation', item })),
  )
  const out = new Map<string, ObligationView>()
  for (const [id, body] of found) if (body !== null) out.set(id, body as ObligationView)
  return out
}

// An execution's whole record as the store answers it: its open items with the ones it closed.
export function fullViewOf(
  view: ExecutionView,
  closed: ReadonlyMap<string, unknown>,
): ExecutionView {
  const rows = viewItems(view)
  for (const [text, body] of closed) {
    const [execution, family, item] = JSON.parse(text) as [string, string, string]
    if (execution === view.execution) rows.push({ family, item, open: false, body })
  }
  const key = (row: (typeof rows)[number]) => `${row.family}\0${row.item}`
  return viewOfItems(
    view.execution,
    rows.sort((left, right) => (key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0)),
  )
}

// Folds a batch into a core's view and keeps the items it closed where the core reads them back.
export function landClosed(
  table: ClosedTable,
  view: SessionJournalView,
  batch: PublishedBatch,
): SessionJournalView {
  const folded = foldItems(view, batch)
  for (const change of folded.changes)
    if (!change.open)
      table.closed.set(
        itemText({ execution: batch.execution, family: change.family, item: change.item }),
        change.body,
      )
  return folded.view
}
