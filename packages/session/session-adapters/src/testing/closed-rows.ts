import type { AgentExecutionId, AgentJournalEntry } from '@omne-harness/agent-contract'
import { NeedItems, itemText, type ClosedTable, type ItemRef } from './closed-items.ts'

// Records by place as a read sees them: a hole is answered by the closed item at that place (its
// key is the place counted from one). The holes the table lacks are named together: NeedItems.
export function readingRows<T, R>(
  table: ClosedTable,
  place: Readonly<{ execution: AgentExecutionId; family: string }>,
  records: readonly T[],
  parse: (body: unknown) => T | undefined,
  read: (rows: readonly (T | undefined)[]) => R,
): R {
  const missing: ItemRef[] = []
  const closedAt = (index: number): T | undefined => {
    const ref = { ...place, item: String(index + 1) }
    const text = itemText(ref)
    if (table.closed.has(text)) {
      const body = table.closed.get(text)
      return body === null || body === undefined ? undefined : parse(body)
    }
    if (!table.closedComplete) missing.push(ref)
    return undefined
  }
  const rows = new Proxy(records as readonly (T | undefined)[], {
    get(target, key, receiver) {
      if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key))
        return Reflect.get(target, key, receiver) as unknown
      const index = Number(key)
      if (index >= target.length) return undefined
      return target[index] ?? closedAt(index)
    },
  })
  const answer = read(rows)
  if (missing.length > 0) throw new NeedItems(missing)
  return answer
}

export const between = <T>(rows: readonly (T | undefined)[], from: number, limit: number) =>
  Array.from(
    { length: Math.max(0, Math.min(limit, rows.length - from)) },
    (_, at) => rows[from + at],
  )

export const ENTRY_FAMILY = 'entry'

// The entries after a position (null: one of them is not readable).
export function entriesFrom(
  table: ClosedTable,
  execution: Readonly<{ id: AgentExecutionId; entries: readonly AgentJournalEntry[] }>,
  from: number,
  limit: number,
): AgentJournalEntry[] | null {
  const read = readingRows(
    table,
    { execution: execution.id, family: ENTRY_FAMILY },
    execution.entries,
    body => body as AgentJournalEntry,
    rows => between(rows, from, limit),
  )
  return read.some(entry => entry === undefined) ? null : (read as AgentJournalEntry[])
}
// Where a call was first registered and where it was associated: two items, each written once.
export const ORIGIN_FAMILY = 'origin'
export const ASSOCIATION_FAMILY = 'association'

// A record keeps an entry it just took where a read of its place finds it once the record lets
// it go, and every entry of a consumption with the consumption.
export function landEntry(
  table: ClosedTable,
  execution: Readonly<{
    id: AgentExecutionId
    entries: readonly unknown[]
    deliveries: Map<string, readonly unknown[]>
  }>,
  entry: Readonly<{ kind: string; consumption?: string }>,
): void {
  const ref = {
    execution: execution.id,
    family: ENTRY_FAMILY,
    item: String(execution.entries.length),
  }
  table.closed.set(itemText(ref), entry)
  if (entry.kind !== 'received' || entry.consumption === undefined) return
  const known = execution.deliveries.get(entry.consumption) ?? []
  execution.deliveries.set(entry.consumption, [...known, entry])
}
