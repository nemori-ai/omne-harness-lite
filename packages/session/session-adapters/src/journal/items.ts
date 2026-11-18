import { SharedMap, forkOf } from './shared-map.ts'
import { factKey, resultKey } from './facts.ts'
import type { AgentExecutionId, ConsumptionId } from '@omne-harness/agent-contract'
import {
  emptyExecutionView,
  type AdmissionView,
  type BindingView,
  type ExecutionView,
  type IntentView,
  type ObligationView,
  type RequestView,
  type ResultView,
} from './view.ts'

// An execution view as items by original key; the store keeps all of them, the view the open ones.

type Entry = unknown
type Table = Readonly<{
  kind: 'table'
  of(view: ExecutionView): ReadonlyMap<unknown, Entry>
  put(view: ExecutionView, table: ReadonlyMap<unknown, Entry>): ExecutionView
  parse(item: string): unknown
}>
type List = Readonly<{
  kind: 'list'
  of(view: ExecutionView): readonly Entry[]
  put(view: ExecutionView, list: readonly Entry[]): ExecutionView
  key(entry: never): string
  order(entry: never): readonly number[]
}>

export type ItemFamily = Readonly<{
  family: string
  holder: Table | List
  open: (entry: never, view: ExecutionView, item: string) => boolean
  // A family whose closed items stay out of a finishing view: its rule says what holds, not how long.
  apart?: true
}>

export type ItemChange = Readonly<{
  family: string
  item: string
  change: 'opened' | 'changed'
  open: boolean
  body: unknown
  before?: unknown
}>

const always = (): boolean => true
const closedAtBirth = (): boolean => false

type Member = Exclude<keyof ExecutionView, 'finish'>
type FinishMember = 'candidates' | 'lists' | 'obligations'
type Holder<T> = Readonly<{
  of: (view: ExecutionView) => T
  put: (view: ExecutionView, value: T) => ExecutionView
}>
const at = <M extends Member>(member: M): Holder<ExecutionView[M]> => ({
  of: view => view[member],
  put: (view, value) => ({ ...view, [member]: value }) as ExecutionView,
})
const finishAt = <M extends FinishMember>(member: M): Holder<ExecutionView['finish'][M]> => ({
  of: view => view.finish[member],
  put: (view, value) => ({ ...view, finish: { ...view.finish, [member]: value } }),
})
const table = <K, V>(
  holder: Holder<ReadonlyMap<K, V>>,
  parse: (item: string) => K = item => item as K,
): Table => ({
  kind: 'table',
  of: holder.of,
  put: holder.put as unknown as Table['put'],
  parse,
})
// A list keeps its entries in the order its batches wrote them: order answers that order.
const list = <E>(
  holder: Holder<readonly E[]>,
  key: (entry: E) => string,
  order: (entry: E) => readonly number[],
): List => ({
  kind: 'list',
  of: holder.of,
  put: holder.put as unknown as List['put'],
  key: key as List['key'],
  order: order as List['order'],
})
const byPub = (entry: Readonly<{ pub: number }>) => [entry.pub]
const byPubOrd = (entry: Readonly<{ pub: number; ord: number }>) => [entry.pub, entry.ord]
const keyOf = (fact: Parameters<typeof factKey>[0]): string => {
  const key = factKey(fact)
  return key.slice(key.indexOf('/') + 1)
}

// An execution that settles or has ended holds every item: finishing reads the whole record.
export const finishing = (view: ExecutionView): boolean =>
  view.cursor.state === 'settling' || view.finish.ended !== null

type Open = (entry: Entry, view: ExecutionView, item: string) => boolean

function openIn(family: ItemFamily, entry: Entry, view: ExecutionView, item: string): boolean {
  if (finishing(view) && family.apart !== true) return true
  return (family.open as Open)(entry, view, item)
}

const fallbackRequest = (view: ExecutionView): RequestView | undefined =>
  view.requests.findLast(item => item.step !== view.cursor.step && item.voided === null)

const intentHeld = (item: IntentView, view: ExecutionView): boolean =>
  view.cursor.holds?.actions.includes(item.action) ?? true

function callHeld(consumption: string, view: ExecutionView): boolean {
  if (view.cursor.holds?.consumptions.includes(consumption as never) ?? true) return true
  for (const intent of view.intents.values())
    if (intent.pending.consumption === consumption && intentHeld(intent, view)) return true
  return false
}

const owed = (item: ResultView): boolean =>
  item.stages.recorded !== undefined && item.stages.released === undefined

const resultOpen = (item: ResultView, view: ExecutionView): boolean =>
  owed(item) || callHeld(item.consumption, view)

export function sourceOpen(id: string, view: ExecutionView): boolean {
  const [kind, key] = JSON.parse(id) as [string, string]
  if (kind === 'call') {
    const intent = view.intents.get(key as never)
    return intent !== undefined && intentHeld(intent, view)
  }
  if (kind !== 'result') return true
  const [, version, consumption] = JSON.parse(key) as [unknown, string, ConsumptionId]
  const result = view.results.get(resultKey(consumption, version))
  return result !== undefined && resultOpen(result, view)
}

export const EXEC_FAMILY = 'exec'

export const ITEM_FAMILIES: readonly ItemFamily[] = [
  {
    family: 'attachment',
    holder: list(at('attachments'), item => item.authority.executionAttachment, byPub),
    open: always,
  },
  {
    family: 'input',
    holder: list(at('inputs'), item => item.input, byPub),
    open: always,
  },
  {
    family: 'step',
    holder: list(at('steps'), item => `${item.step}#${item.batch.id}`, byPub),
    // Only the latest step of the batch the cursor has taken is read: a later step closes it.
    open: (item: ExecutionView['steps'][number], view: ExecutionView) =>
      view.cursor.inputBatch === item.batch.id &&
      !view.steps.some(other => other.batch.id === item.batch.id && other.pub > item.pub),
  },
  // A step can adopt again under the same attempt: a request is its model invocation.
  {
    family: 'request',
    holder: list(at('requests'), item => item.reference, byPub),
    open: (item: RequestView, view: ExecutionView) =>
      item.step === view.cursor.step || item === fallbackRequest(view),
  },
  { family: 'voided', holder: list(at('voided'), keyOf, byPubOrd), open: always },
  {
    family: 'intent',
    holder: table(at('intents')),
    open: intentHeld,
  },
  {
    family: 'result',
    holder: table(at('results')),
    open: resultOpen,
  },
  { family: 'placeholder', holder: table(at('placeholders')), open: always },
  {
    family: 'admission',
    holder: list(
      at('admissions'),
      item => String(item.sequence),
      item => [item.sequence],
    ),
    open: (item: AdmissionView, view: ExecutionView) =>
      item.sequence >= (view.cursor.holds?.admissionsFrom ?? 0),
  },
  { family: 'handoff', holder: table(at('handoffs')), open: always },
  { family: 'control', holder: table(at('controls')), open: always },
  {
    family: 'settlement',
    holder: list(at('settlements'), item => item.op, byPub),
    open: always,
  },
  {
    family: 'observation',
    holder: list(at('observations'), item => item.passage, byPub),
    open: always,
  },
  {
    family: 'fence',
    holder: list(at('fences'), item => item.operation, byPubOrd),
    open: always,
  },
  {
    family: 'event',
    holder: list(
      at('events'),
      item => String(item.eseq),
      item => [item.eseq],
    ),
    open: always,
  },
  {
    family: 'binding',
    holder: list(at('bindings'), item => item.reference, byPubOrd),
    open: (item: BindingView, view: ExecutionView) => {
      let any = false
      for (const result of view.results.values()) {
        if (result.consumption !== item.consumption) continue
        if (resultOpen(result, view)) return true
        any = true
      }
      return !any
    },
  },
  { family: 'material', holder: table(at('materials')), open: always },
  { family: 'op', holder: table(at('ops')), open: closedAtBirth, apart: true },
  {
    family: 'exclusion',
    holder: table(at('excluded')),
    open: (entry: ExecutionView['excluded'] extends ReadonlyMap<unknown, infer E> ? E : never) =>
      entry.revived !== true,
    apart: true,
  },
  { family: 'rejection', holder: table(at('rejections')), open: always },
  { family: 'reached', holder: table(at('reached'), Number), open: closedAtBirth, apart: true },
  {
    family: 'candidate',
    holder: list(finishAt('candidates'), item => item.candidate, byPub),
    open: always,
  },
  { family: 'list', holder: table(finishAt('lists')), open: always },
  {
    family: 'obligation',
    holder: table(finishAt('obligations')),
    open: (item: ObligationView, view: ExecutionView, id: string) =>
      !item.settled || sourceOpen(id, view),
  },
]

const EXEC_MEMBERS = [
  'revision',
  'head',
  'gen',
  'opened',
  'cursor',
  'cursorMoved',
  'adopted',
  'waits',
  'acknowledged',
  'acknowledgedAt',
  'admitted',
] as const

type ExecBody = Pick<ExecutionView, 'execution' | (typeof EXEC_MEMBERS)[number]> &
  Readonly<{ finish: Pick<ExecutionView['finish'], 'current' | 'ended'> }>

export function execBody(view: ExecutionView): ExecBody {
  const { finish } = view
  return {
    execution: view.execution,
    revision: view.revision,
    head: view.head,
    gen: view.gen,
    opened: view.opened,
    cursor: view.cursor,
    cursorMoved: view.cursorMoved,
    adopted: view.adopted,
    waits: view.waits,
    acknowledged: view.acknowledged,
    acknowledgedAt: view.acknowledgedAt,
    admitted: view.admitted,
    finish: { current: finish.current, ended: finish.ended },
  }
}

function execChanged(before: ExecutionView, after: ExecutionView): boolean {
  return (
    EXEC_MEMBERS.some(member => before[member] !== after[member]) ||
    before.finish.current !== after.finish.current ||
    before.finish.ended !== after.finish.ended
  )
}

function written(
  before: ReadonlyMap<unknown, Entry> | undefined,
  after: ReadonlyMap<unknown, Entry>,
): Iterable<unknown> {
  if (before === undefined) return after.keys()
  if (before === after) return []
  if (after instanceof SharedMap && before instanceof SharedMap && after.sharesWith(before))
    return []
  if (after instanceof SharedMap) return after.written()
  return [...after.keys()].filter(key => before.get(key) !== after.get(key))
}

export type ViewItem = Readonly<{ family: string; item: string; open: boolean; body: unknown }>

export function viewItems(view: ExecutionView): ViewItem[] {
  const items: ViewItem[] = [{ family: EXEC_FAMILY, item: '', open: true, body: execBody(view) }]
  for (const family of ITEM_FAMILIES) {
    const { holder } = family
    const entries: Iterable<readonly [string, Entry]> =
      holder.kind === 'table'
        ? [...holder.of(view)].map(([key, entry]) => [String(key), entry] as const)
        : holder
            .of(view)
            .map(entry => [(holder.key as (entry: Entry) => string)(entry), entry] as const)
    for (const [item, entry] of entries)
      items.push({
        family: family.family,
        item,
        open: openIn(family, entry, view, item),
        body: entry,
      })
  }
  return items
}

export function closings(after: ExecutionView, changed: readonly ItemChange[]): ItemChange[] {
  if (finishing(after)) return []
  const touched = new Set(changed.map(change => `${change.family}\0${change.item}`))
  const closing: ItemChange[] = []
  for (const family of ITEM_FAMILIES) {
    if (family.open === always) continue
    const open = family.open as Open
    for (const [item, entry] of entriesOf(family, after))
      if (!touched.has(`${family.family}\0${item}`) && !open(entry, after, item))
        closing.push({
          family: family.family,
          item,
          change: 'changed',
          open: false,
          body: entry,
          before: entry,
        })
  }
  return closing
}

export function evicted(view: ExecutionView, changes: readonly ItemChange[]): ExecutionView {
  let out = view
  for (const family of ITEM_FAMILIES) {
    const gone = new Set(
      changes.filter(change => change.family === family.family && !change.open).map(c => c.item),
    )
    if (gone.size === 0) continue
    const { holder } = family
    if (holder.kind === 'table') {
      const kept = forkOf(holder.of(out))
      for (const key of kept.keys()) if (gone.has(String(key))) kept.delete(key)
      out = holder.put(out, kept)
      continue
    }
    const key = holder.key as (entry: Entry) => string
    out = holder.put(
      out,
      holder.of(out).filter(entry => !gone.has(key(entry))),
    )
  }
  return out
}

function entriesOf(family: ItemFamily, view: ExecutionView): (readonly [string, Entry])[] {
  const { holder } = family
  if (holder.kind === 'table')
    return [...holder.of(view)].map(([key, entry]) => [String(key), entry] as const)
  const key = holder.key as (entry: Entry) => string
  return holder.of(view).map(entry => [key(entry), entry] as const)
}

export function itemChanges(before: ExecutionView | undefined, after: ExecutionView): ItemChange[] {
  const changes: ItemChange[] = []
  if (before === undefined || execChanged(before, after))
    changes.push({
      family: EXEC_FAMILY,
      item: '',
      change: before === undefined ? 'opened' : 'changed',
      open: true,
      body: execBody(after),
      ...(before === undefined ? {} : { before: execBody(before) }),
    })
  for (const family of ITEM_FAMILIES) {
    const open = (entry: Entry, item: string) => openIn(family, entry, after, item)
    const { holder } = family
    if (holder.kind === 'table') {
      const prior = before === undefined ? undefined : holder.of(before)
      const now = holder.of(after)
      for (const key of written(prior, now)) {
        const entry = now.get(key)
        if (entry === undefined) continue
        changes.push({
          family: family.family,
          item: String(key),
          change: prior?.get(key) === undefined ? 'opened' : 'changed',
          open: open(entry, String(key)),
          body: entry,
          ...(prior?.get(key) === undefined ? {} : { before: prior.get(key) }),
        })
      }
      continue
    }
    const prior = before === undefined ? [] : holder.of(before)
    const now = holder.of(after)
    if (prior === now) continue
    const key = holder.key as (entry: Entry) => string
    const held = new Map(prior.map(entry => [key(entry), entry]))
    for (const entry of now) {
      const item = key(entry)
      const was = held.get(item)
      if (was === entry) continue
      changes.push({
        family: family.family,
        item,
        change: was === undefined ? 'opened' : 'changed',
        open: open(entry, item),
        body: entry,
        ...(was === undefined ? {} : { before: was }),
      })
    }
  }
  return changes
}

type Row = Readonly<{ family: string; item: string; body: unknown; open?: boolean }>

const compareOrder = (left: readonly number[], right: readonly number[]): number => {
  for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
    const difference = (left[at] ?? 0) - (right[at] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function viewOfItems(execution: AgentExecutionId, rows: readonly Row[]): ExecutionView {
  const empty = emptyExecutionView(execution)
  const exec = rows.find(row => row.family === EXEC_FAMILY)?.body as ExecBody | undefined
  let view: ExecutionView =
    exec === undefined ? empty : { ...empty, ...exec, finish: { ...empty.finish, ...exec.finish } }
  for (const family of ITEM_FAMILIES) {
    const own = rows.filter(
      row => row.family === family.family && (row.open !== false || family.apart !== true),
    )
    if (own.length === 0) continue
    const { holder } = family
    if (holder.kind === 'table') {
      view = holder.put(view, new SharedMap(own.map(row => [holder.parse(row.item), row.body])))
      continue
    }
    const order = holder.order as (entry: Entry) => readonly number[]
    const entries = own.map(row => row.body)
    view = holder.put(
      view,
      entries.sort((left, right) => compareOrder(order(left), order(right))),
    )
  }
  return view
}
