import { SharedMap } from './shared-map.ts'
import { factKey } from './facts.ts'
import type { ExecutionView } from './view.ts'

// An execution view as items: each family holds entries by original key, the execution is one item.
// The store keeps every item, open or closed; the view in memory keeps the open ones.

type Entry = unknown
type Table = Readonly<{ kind: 'table'; of: (view: ExecutionView) => ReadonlyMap<string, Entry> }>
type List = Readonly<{
  kind: 'list'
  of: (view: ExecutionView) => readonly Entry[]
  key: (entry: never) => string
}>

export type ItemFamily = Readonly<{
  family: string
  holder: Table | List
  open: (entry: never, view: ExecutionView) => boolean
}>

export type ItemChange = Readonly<{
  family: string
  item: string
  change: 'opened' | 'changed'
  open: boolean
  body: unknown
}>

const always = (): boolean => true
const table = (of: Table['of']): Table => ({ kind: 'table', of })
const list = <E>(of: (view: ExecutionView) => readonly E[], key: (entry: E) => string): List => ({
  kind: 'list',
  of,
  key: key as (entry: never) => string,
})
const keyOf = (fact: Parameters<typeof factKey>[0]): string => {
  const key = factKey(fact)
  return key.slice(key.indexOf('/') + 1)
}

export const EXEC_FAMILY = 'exec'

export const ITEM_FAMILIES: readonly ItemFamily[] = [
  {
    family: 'attachment',
    holder: list(
      view => view.attachments,
      item => item.authority.executionAttachment,
    ),
    open: always,
  },
  {
    family: 'input',
    holder: list(
      view => view.inputs,
      item => item.input,
    ),
    open: always,
  },
  {
    family: 'step',
    holder: list(
      view => view.steps,
      item => `${item.step}#${item.batch.id}`,
    ),
    open: always,
  },
  // A step can adopt again under the same attempt: a request is its model invocation.
  {
    family: 'request',
    holder: list(
      view => view.requests,
      item => item.reference,
    ),
    open: always,
  },
  { family: 'voided', holder: list(view => view.voided, keyOf), open: always },
  { family: 'intent', holder: table(view => view.intents), open: always },
  { family: 'result', holder: table(view => view.results), open: always },
  { family: 'placeholder', holder: table(view => view.placeholders), open: always },
  {
    family: 'admission',
    holder: list(
      view => view.admissions,
      item => String(item.sequence),
    ),
    open: always,
  },
  { family: 'handoff', holder: table(view => view.handoffs), open: always },
  { family: 'batch', holder: table(view => view.batches), open: always },
  { family: 'passage', holder: table(view => view.passages), open: always },
  { family: 'control', holder: table(view => view.controls), open: always },
  {
    family: 'settlement',
    holder: list(
      view => view.settlements,
      item => item.op,
    ),
    open: always,
  },
  {
    family: 'observation',
    holder: list(
      view => view.observations,
      item => item.passage,
    ),
    open: always,
  },
  {
    family: 'fence',
    holder: list(
      view => view.fences,
      item => item.operation,
    ),
    open: always,
  },
  {
    family: 'event',
    holder: list(
      view => view.events,
      item => String(item.eseq),
    ),
    open: always,
  },
  {
    family: 'binding',
    holder: list(
      view => view.bindings,
      item => `${item.reference}/${item.pending.digest}`,
    ),
    open: always,
  },
  { family: 'material', holder: table(view => view.materials), open: always },
  { family: 'op', holder: table(view => view.ops), open: always },
  { family: 'exclusion', holder: table(view => view.excluded), open: always },
  { family: 'rejection', holder: table(view => view.rejections), open: always },
  {
    family: 'reached',
    holder: table(view => view.reached as unknown as ReadonlyMap<string, Entry>),
    open: always,
  },
  {
    family: 'candidate',
    holder: list(
      view => view.finish.candidates,
      item => item.candidate,
    ),
    open: always,
  },
  { family: 'list', holder: table(view => view.finish.lists), open: always },
  { family: 'obligation', holder: table(view => view.finish.obligations), open: always },
]

export function execBody(view: ExecutionView): unknown {
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
    finish: { current: finish.current, ended: finish.ended },
  }
}

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
] as const

function execChanged(before: ExecutionView, after: ExecutionView): boolean {
  return (
    EXEC_MEMBERS.some(member => before[member] !== after[member]) ||
    before.finish.current !== after.finish.current ||
    before.finish.ended !== after.finish.ended
  )
}

function written(
  before: ReadonlyMap<string, Entry> | undefined,
  after: ReadonlyMap<string, Entry>,
): Iterable<string> {
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
    const open = family.open as (entry: Entry, view: ExecutionView) => boolean
    const { holder } = family
    const entries: Iterable<readonly [string, Entry]> =
      holder.kind === 'table'
        ? [...holder.of(view)].map(([key, entry]) => [String(key), entry] as const)
        : holder
            .of(view)
            .map(entry => [(holder.key as (entry: Entry) => string)(entry), entry] as const)
    for (const [item, entry] of entries)
      items.push({ family: family.family, item, open: open(entry, view), body: entry })
  }
  return items
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
    })
  for (const family of ITEM_FAMILIES) {
    const open = family.open as (entry: Entry, view: ExecutionView) => boolean
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
          open: open(entry, after),
          body: entry,
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
        open: open(entry, after),
        body: entry,
      })
    }
  }
  return changes
}
