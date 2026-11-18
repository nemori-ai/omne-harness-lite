import {
  EXECUTION_RECORD_HANDLERS,
  decodeExecutionRecordItems,
  decodeExecutionRecordOpenItems,
  type ExecutionItem,
  type ExecutionItemKey,
} from '@omne-harness/session-storage-sql/participants'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import {
  finishing,
  foldItems,
  viewOfItems,
  type ExecutionView,
  type ItemChange,
  type PublishedBatch,
  type SessionJournalView,
} from '../journal/index.ts'
import { SharedMap } from '../journal/shared-map.ts'
import type { Prepared } from './journal-publication.ts'
import { READ_ATTEMPTS, type Reader } from './journal-read.ts'
import { refsIn } from './content-refs.ts'
import { fetchBlobClosure } from './block-read.ts'
import { blobRowDigest, factDigestOf } from './journal-batch.ts'
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
  all = false,
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
        ...(all ? { all } : {}),
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

// What a call read back by original key (null: not held at that head), with the blocks they name.
type Lender = Readonly<{
  tenantText: string
  session: string
  fetched: Map<string, unknown>
  lentBlocks: Map<string, string>
}>

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
    const rows = found.items.flatMap(item => [...refsIn(item.body)].map(blobRowDigest))
    const missing = await fetchBlobClosure(read, lender.tenantText, rows, lender.lentBlocks)
    if (missing !== null) return `the content block ${missing} of a closed item is not readable`
  }
  return null
}

export function unlend<P>(
  cell: JournalCell<P>,
  lender: Pick<Lender, 'fetched' | 'lentBlocks'>,
  held: (digest: string) => boolean,
): void {
  const { agent } = cell.state()
  const lent = [...lender.lentBlocks.keys()].map(factDigestOf).filter(digest => !held(digest))
  lender.fetched.clear()
  lender.lentBlocks.clear()
  if (agent.closed.size === 0 && lent.length === 0) return
  cell.mutate(() => {
    cell.state().agent.closed.clear()
    for (const digest of lent) cell.state().agent.blobs.delete(digest)
    cell.touch()
  })
}

export function lendFetched<P>(lender: Lender, cell: JournalCell<P>): void {
  if (lender.fetched.size === 0) return
  cell.mutate(() => {
    const { closed, blobs } = cell.state().agent
    for (const [text, body] of lender.fetched) if (!closed.has(text)) closed.set(text, body)
    for (const [row, payload] of lender.lentBlocks)
      if (!blobs.has(factDigestOf(row)))
        blobs.set(factDigestOf(row), JSON.parse(payload) as unknown)
    cell.touch()
  })
}

// A finishing execution's records are projected from all its items; writers fold its open view.
export type FullViews = Map<string, ExecutionView>

export const unsettled = (views: Iterable<ExecutionView>, full: FullViews): string[] =>
  [...views]
    .filter(view => finishing(view) && !full.has(view.execution))
    .map(view => view.execution)

export function recordsView(view: SessionJournalView, full: FullViews): SessionJournalView {
  if (full.size === 0) return view
  const executions = new SharedMap(view.executions)
  for (const [execution, item] of full)
    if (executions.has(execution as AgentExecutionId)) executions.set(item.execution, item)
  return { ...view, executions }
}

export const closesOpen = (changes: readonly ItemChange[]): boolean =>
  changes.some(change => change.change === 'changed' && !change.open)

export function foldFull(
  full: FullViews,
  execution: AgentExecutionId,
  prepared: Pick<Prepared, 'envelope' | 'derived'>,
  pub: number,
): Readonly<{ dropped: boolean }> {
  const facts = prepared.derived.map(item => item.fact)
  const batch: PublishedBatch = { execution, envelope: prepared.envelope, facts, pub }
  const view = full.get(batch.execution)
  if (view === undefined) return { dropped: false }
  const executions = new SharedMap([[batch.execution, view]])
  const after = foldItems({ head: batch.pub - 1, executions }, batch).view.executions.get(
    batch.execution,
  )
  if (after !== undefined && finishing(after)) {
    full.set(batch.execution, after)
    return { dropped: false }
  }
  full.delete(batch.execution)
  return { dropped: true }
}

export type OpenViewRead =
  | Readonly<{
      kind: 'read'
      published: number
      views: readonly ExecutionView[]
      full: readonly ExecutionView[]
    }>
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
    const full: ExecutionView[] = []
    let head: number | null = null
    let moved = false
    for (const execution of executions) {
      let found = await readOpenItems(read, { ...scope, execution }, null)
      if (found.kind === 'unavailable') return found
      if (found.items.length === 0) continue
      const id = execution as AgentExecutionId
      const finishes = finishing(viewOfItems(id, found.items))
      if (finishes) found = await readOpenItems(read, { ...scope, execution }, null, true)
      if (found.kind === 'unavailable') return found
      if (head !== null && found.published !== head) {
        moved = true
        break
      }
      head = found.published
      views.push(viewOfItems(id, finishes ? found.items.filter(row => row.open) : found.items))
      if (finishes) full.push(viewOfItems(id, found.items))
    }
    if (!moved) return { kind: 'read', published: head ?? published, views, full }
  }
  return {
    kind: 'unavailable',
    diagnostic: 'the open items of the session kept changing while they were read',
  }
}
