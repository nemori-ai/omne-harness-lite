import type { AgentExecutionId, AgentOperationId } from '@omne-harness/agent-contract'
import { foldItems, type PublishedBatch, type SessionJournalView } from '../journal/index.ts'
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

// A read that needs closed items its round has not read: the provider reads them by original key
// and runs the round again from the same root. The draft of the round is dropped with the throw.
export class NeedItems extends Error {
  readonly refs: readonly ItemRef[]

  constructor(refs: readonly ItemRef[]) {
    super(`the round needs ${String(refs.length)} closed item(s) it has not read`)
    this.refs = refs
  }
}

// The closed items a core holds by itemText (null: no store holds the item). A complete table is the
// whole closed store; an incomplete one holds what this call closed or read back.
export type ClosedTable = Readonly<{ closed: SharedMap<string, unknown>; closedComplete: boolean }>

// For a write, which treats an unknown key as new and leaves the judgement to the store.
export const peekClosed = (table: ClosedTable, ref: ItemRef): unknown =>
  table.closed.get(itemText(ref)) ?? null

// For a read that must know: throws NeedItems when the table does not hold the item.
export function needClosed(table: ClosedTable, ref: ItemRef): unknown {
  const text = itemText(ref)
  if (table.closed.has(text)) return table.closed.get(text) ?? null
  if (table.closedComplete) return null
  throw new NeedItems([ref])
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
