import {
  EXECUTION_RECORD_HANDLERS,
  decodeExecutionRecordItems,
  decodeExecutionRecordOpenItems,
  type ExecutionItem,
  type ExecutionItemKey,
} from '@omne-harness/session-storage-sql/participants'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { viewOfItems, type ExecutionView } from '../journal/index.ts'
import { READ_ATTEMPTS, type Reader } from './journal-read.ts'
import { itemText, type ItemRef } from '../testing/closed-items.ts'
import type { JournalCell } from '../testing/root.ts'

export type ItemScope = Readonly<{ tenant: string; session: string; execution: string }>

// An execution the session does not hold reads as one without items.
export type ItemsRead =
  | Readonly<{ kind: 'read'; published: number; items: readonly ExecutionItem[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const unread = (diagnostic: string): ItemsRead => ({ kind: 'unavailable', diagnostic })

// The open items of one execution (of the named families, or all), every page at one head.
export async function readOpenItems(
  read: Reader,
  scope: ItemScope,
  families: readonly string[] | null,
): Promise<ItemsRead> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    let after: ExecutionItemKey | null = null
    let published: string | null = null
    const items: ExecutionItem[] = []
    for (;;) {
      const output = await read(EXECUTION_RECORD_HANDLERS.openItems, {
        ...scope,
        after,
        ...(families === null ? {} : { families: [...families] }),
      })
      if (output.kind === 'unread')
        return unread(`the open items of the execution are not readable: ${output.reason}`)
      const page = decodeExecutionRecordOpenItems(output.output)
      if (page === null) return unread('the open items of the execution do not decode')
      if (page.kind === 'denied') return { kind: 'read', published: 0, items: [] }
      if (page.kind === 'missing') return unread('the Agent records of the session are older')
      if (published !== null && page.published !== published) break
      published = page.published
      items.push(...page.items)
      if (page.next === null) return { kind: 'read', published: Number(published), items }
      after = page.next
    }
  }
  return unread('the open items of the execution kept changing while they were read')
}

// Items of one execution by original key, open or closed; keys the store never held are left out.
export async function readItems(
  read: Reader,
  scope: ItemScope,
  keys: readonly ExecutionItemKey[],
): Promise<ItemsRead> {
  const output = await read(EXECUTION_RECORD_HANDLERS.items, { ...scope, keys: [...keys] })
  if (output.kind === 'unread')
    return unread(`the items of the execution are not readable: ${output.reason}`)
  const found = decodeExecutionRecordItems(output.output)
  if (found === null) return unread('the items of the execution do not decode')
  if (found.kind === 'denied') return { kind: 'read', published: 0, items: [] }
  if (found.kind === 'missing') return unread('the Agent records of the session are older')
  return { kind: 'read', published: Number(found.published), items: found.items }
}

// What a call read back by original key: null for a key the store did not hold at that head.
type Lender = Readonly<{ tenantText: string; session: string; fetched: Map<string, unknown> }>

export async function fetchClosed(
  read: Reader,
  lender: Lender,
  refs: readonly ItemRef[],
): Promise<string | null> {
  const byExecution = Map.groupBy(refs, ref => ref.execution)
  for (const [execution, wanted] of byExecution) {
    const scope = { tenant: lender.tenantText, session: lender.session, execution }
    const found = await readItems(
      read,
      scope,
      wanted.map(ref => ({ family: ref.family, item: ref.item })),
    )
    if (found.kind === 'unavailable') return found.diagnostic
    for (const ref of wanted) lender.fetched.set(itemText(ref), null)
    for (const item of found.items)
      lender.fetched.set(itemText({ execution, family: item.family, item: item.item }), item.body)
  }
  return null
}

export function unlend<P>(cell: JournalCell<P>): void {
  if (cell.state().agent.closed.size === 0) return
  cell.mutate(() => {
    cell.state().agent.closed.clear()
    cell.touch()
  })
}

export function lendFetched<P>(lender: Lender, cell: JournalCell<P>): void {
  if (lender.fetched.size === 0) return
  cell.mutate(() => {
    const { closed } = cell.state().agent
    for (const [text, body] of lender.fetched) if (!closed.has(text)) closed.set(text, body)
    cell.touch()
  })
}

export type OpenViewRead =
  | Readonly<{ kind: 'read'; published: number; views: readonly ExecutionView[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

// The open views of the named executions from their open items at one head (else the given one).
export async function readOpenView(
  read: Reader,
  scope: Readonly<{ tenant: string; session: string }>,
  executions: readonly string[],
  published: number,
): Promise<OpenViewRead> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    const views: ExecutionView[] = []
    let head: number | null = null
    let moved = false
    for (const execution of executions) {
      const found = await readOpenItems(read, { ...scope, execution }, null)
      if (found.kind === 'unavailable') return found
      if (found.items.length === 0) continue
      if (head !== null && found.published !== head) {
        moved = true
        break
      }
      head = found.published
      views.push(viewOfItems(execution as AgentExecutionId, found.items))
    }
    if (!moved) return { kind: 'read', published: head ?? published, views }
  }
  return {
    kind: 'unavailable',
    diagnostic: 'the open items of the session kept changing while they were read',
  }
}
