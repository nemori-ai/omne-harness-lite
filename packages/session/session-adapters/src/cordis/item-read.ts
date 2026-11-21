import {
  EXECUTION_RECORD_HANDLERS,
  decodeExecutionRecordItems,
  decodeExecutionRecordOpenItems,
  type ExecutionItem,
  type ExecutionItemKey,
} from '@omne-harness/session-storage-sql/participants'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import {
  callHeld,
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
import { itemText, underText, type ItemRef } from '../testing/closed-items.ts'
import type { CommonRoot, JournalCell } from '../testing/root.ts'
import type { ProjectedRecords } from '../testing/journal-records.ts'

export type ItemScope = Readonly<{ tenant: string; session: string; execution: string }>

// An execution the session does not hold reads as one without items.
export type ItemsRead =
  | Readonly<{ kind: 'read'; published: number; items: readonly ExecutionItem[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const unread = (diagnostic: string): ItemsRead => ({ kind: 'unavailable', diagnostic })

// The open items of one execution (named families or all; `under`: a key prefix), at one head.
export async function readOpenItems(
  read: Reader,
  scope: ItemScope,
  families: readonly string[] | null,
  all = false,
  under: string | null = null,
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
        ...(under === null ? {} : { under }),
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

type ItemsPage =
  | Readonly<{
      kind: 'page'
      published: string
      items: readonly ExecutionItem[]
      rest: readonly ExecutionItemKey[]
    }>
  | ItemsRead

async function readItemsPage(
  read: Reader,
  scope: ItemScope,
  rest: readonly ExecutionItemKey[],
): Promise<ItemsPage> {
  const output = await read(EXECUTION_RECORD_HANDLERS.items, { ...scope, keys: [...rest] })
  if (output.kind === 'unread')
    return unread(`the items of the execution are not readable: ${output.reason}`)
  const found = decodeExecutionRecordItems(output.output)
  if (found === null) return unread('the items of the execution do not decode')
  if (found.kind === 'denied') return { kind: 'read', published: 0, items: [] }
  if (found.kind === 'missing') return unread('the Agent records of the session are older')
  return { kind: 'page', published: found.published, items: found.items, rest: found.rest }
}

async function readItemsOnce(
  read: Reader,
  scope: ItemScope,
  keys: readonly ExecutionItemKey[],
): Promise<ItemsRead | null> {
  let rest = keys
  let published: string | null = null
  const items: ExecutionItem[] = []
  while (rest.length > 0) {
    const page = await readItemsPage(read, scope, rest)
    if (page.kind !== 'page') return page
    if (published !== null && page.published !== published) return null
    if (page.rest.length >= rest.length) return unread('a page of items read none of its keys')
    published = page.published
    items.push(...page.items)
    rest = page.rest
  }
  return { kind: 'read', published: Number(published ?? 0), items }
}

// Items of one execution by original key, open or closed; keys the store never held are left out.
export async function readItems(
  read: Reader,
  scope: ItemScope,
  keys: readonly ExecutionItemKey[],
): Promise<ItemsRead> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    const once = await readItemsOnce(read, scope, keys)
    if (once !== null) return once
  }
  return unread('the items of the execution kept changing while they were read')
}

// What a call read back by original key (null: not held at that head), with the blocks they name.
type Lender = Readonly<{
  tenantText: string
  session: string
  fetched: Map<string, unknown>
  lentBlocks: Map<string, string>
}>

async function readAsked(
  read: Reader,
  lender: Lender,
  execution: AgentExecutionId,
  wanted: readonly ItemRef[],
): Promise<readonly ExecutionItem[] | string> {
  const scope = { tenant: lender.tenantText, session: lender.session, execution }
  const keyed = wanted.filter(ref => ref.under !== true)
  const items: ExecutionItem[] = []
  if (keyed.length > 0) {
    const keys = keyed.map(ref => ({ family: ref.family, item: ref.item }))
    const found = await readItems(read, scope, keys)
    if (found.kind === 'unavailable') return found.diagnostic
    items.push(...found.items)
  }
  for (const ref of keyed) lender.fetched.set(itemText(ref), null)
  for (const ref of wanted.filter(ref => ref.under === true)) {
    const found = await readOpenItems(read, scope, [ref.family], true, ref.item)
    if (found.kind === 'unavailable') return found.diagnostic
    items.push(...found.items)
    lender.fetched.set(
      underText(ref),
      found.items.map(item => item.item),
    )
  }
  return items
}

export async function fetchClosed(
  read: Reader,
  lender: Lender,
  asked: readonly ItemRef[],
): Promise<string | null> {
  const alreadyRead = (ref: ItemRef) =>
    lender.fetched.has(ref.under === true ? underText(ref) : itemText(ref))
  const refs = asked.filter(ref => !alreadyRead(ref))
  if (refs.length === 0) return 'a round needs closed items the call has already read'
  for (const [execution, wanted] of Map.groupBy(refs, ref => ref.execution)) {
    const items = await readAsked(read, lender, execution, wanted)
    if (typeof items === 'string') return items
    for (const item of items)
      lender.fetched.set(itemText({ execution, family: item.family, item: item.item }), item.body)
    const rows = items.flatMap(item => [...refsIn(item.body)].map(blobRowDigest))
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

// The open views of the named executions; one that finishes is read in full, and that read decides.
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
      let finishes = finishing(viewOfItems(id, found.items))
      if (finishes) {
        found = await readOpenItems(read, { ...scope, execution }, null, true)
        if (found.kind === 'unavailable') return found
        finishes = finishing(viewOfItems(id, found.items))
      }
      if (head !== null && found.published !== head) {
        moved = true
        break
      }
      head = found.published
      views.push(
        viewOfItems(
          id,
          found.items.filter(row => row.open),
        ),
      )
      if (finishes) full.push(viewOfItems(id, found.items))
    }
    if (!moved) return { kind: 'read', published: head ?? published, views, full }
  }
  return {
    kind: 'unavailable',
    diagnostic: 'the open items of the session kept changing while they were read',
  }
}

export function heldOrigins<V>(
  origins: ReadonlyMap<string, V>,
  view: SessionJournalView,
): SharedMap<string, V> {
  const kept = new SharedMap<string, V>()
  for (const [key, origin] of origins) {
    const at = key.indexOf('\0')
    const execution = view.executions.get(key.slice(0, at) as AgentExecutionId)
    if (execution !== undefined && callHeld(key.slice(at + 1), execution)) kept.set(key, origin)
  }
  return kept
}

export function restoreRecords<P>(
  book: Readonly<{
    view: SessionJournalView
    parsed: ReadonlyMap<string, unknown>
    origins: CommonRoot['agent']['callOrigins']
  }>,
  cell: JournalCell<P>,
  records: ProjectedRecords,
): void {
  cell.mutate(() => {
    const root = cell.state()
    const into = <K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>) => {
      for (const [key, value] of source) target.set(key, value)
    }
    root.agent.view = book.view
    root.agent.log = []
    root.agent.closedComplete = false
    for (const [digest, value] of book.parsed) root.agent.blobs.set(digest, value)
    into(root.agent.executions, records.executions)
    into(root.agent.operations, records.operations)
    into(root.agent.eventReceipts, records.fragments.eventReceipts)
    into(root.agent.pendingEvents, records.fragments.pendingEvents)
    into(root.agent.callOrigins, records.fragments.callOrigins)
    into(root.agent.callOrigins, book.origins)
    into(root.agent.human, records.fragments.human)
    into(root.agent.indexedEvents, records.fragments.indexedEvents)
    for (const name of Object.keys(records.receiving) as (keyof CommonRoot['receiving'])[])
      into(
        root.receiving[name] as Map<unknown, unknown>,
        records.receiving[name] as Map<unknown, unknown>,
      )
    cell.touch()
  })
}
