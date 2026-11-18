import { SharedMap, forkOf } from './shared-map.ts'
import { factKey } from './facts.ts'
import type { ExecutionView } from './view.ts'

// An execution view as items: each family holds entries by original key, the execution is one item.
// The store keeps every item, open or closed; the view in memory keeps the open ones.

type Entry = unknown
type Table = Readonly<{
  kind: 'table'
  of(view: ExecutionView): ReadonlyMap<unknown, Entry>
  put(view: ExecutionView, table: ReadonlyMap<unknown, Entry>): ExecutionView
}>
type List = Readonly<{
  kind: 'list'
  of(view: ExecutionView): readonly Entry[]
  put(view: ExecutionView, list: readonly Entry[]): ExecutionView
  key(entry: never): string
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
// The registry holds every family alike: each keeps its own entry type behind these casts.
const table = <K, V>(holder: Holder<ReadonlyMap<K, V>>): Table => ({
  kind: 'table',
  of: holder.of,
  put: holder.put as unknown as Table['put'],
})
const list = <E>(holder: Holder<readonly E[]>, key: (entry: E) => string): List => ({
  kind: 'list',
  of: holder.of,
  put: holder.put as unknown as List['put'],
  key: key as List['key'],
})
const keyOf = (fact: Parameters<typeof factKey>[0]): string => {
  const key = factKey(fact)
  return key.slice(key.indexOf('/') + 1)
}

export const EXEC_FAMILY = 'exec'

export const ITEM_FAMILIES: readonly ItemFamily[] = [
  {
    family: 'attachment',
    holder: list(at('attachments'), item => item.authority.executionAttachment),
    open: always,
  },
  {
    family: 'input',
    holder: list(at('inputs'), item => item.input),
    open: always,
  },
  {
    family: 'step',
    holder: list(at('steps'), item => `${item.step}#${item.batch.id}`),
    // Only the step of the batch the cursor has taken is read: a later batch closes it.
    open: (item: ExecutionView['steps'][number], view: ExecutionView) =>
      view.cursor.inputBatch === item.batch.id,
  },
  // A step can adopt again under the same attempt: a request is its model invocation.
  {
    family: 'request',
    holder: list(at('requests'), item => item.reference),
    open: always,
  },
  { family: 'voided', holder: list(at('voided'), keyOf), open: always },
  { family: 'intent', holder: table(at('intents')), open: always },
  { family: 'result', holder: table(at('results')), open: always },
  { family: 'placeholder', holder: table(at('placeholders')), open: always },
  {
    family: 'admission',
    holder: list(at('admissions'), item => String(item.sequence)),
    open: always,
  },
  { family: 'handoff', holder: table(at('handoffs')), open: always },
  { family: 'control', holder: table(at('controls')), open: always },
  {
    family: 'settlement',
    holder: list(at('settlements'), item => item.op),
    open: always,
  },
  {
    family: 'observation',
    holder: list(at('observations'), item => item.passage),
    open: always,
  },
  {
    family: 'fence',
    holder: list(at('fences'), item => item.operation),
    open: always,
  },
  {
    family: 'event',
    holder: list(at('events'), item => String(item.eseq)),
    open: always,
  },
  {
    family: 'binding',
    holder: list(at('bindings'), item => `${item.reference}/${item.pending.digest}`),
    open: always,
  },
  { family: 'material', holder: table(at('materials')), open: always },
  { family: 'op', holder: table(at('ops')), open: closedAtBirth },
  {
    family: 'exclusion',
    holder: table(at('excluded')),
    open: (entry: ExecutionView['excluded'] extends ReadonlyMap<unknown, infer E> ? E : never) =>
      entry.revived !== true,
  },
  { family: 'rejection', holder: table(at('rejections')), open: always },
  { family: 'reached', holder: table(at('reached')), open: closedAtBirth },
  {
    family: 'candidate',
    holder: list(finishAt('candidates'), item => item.candidate),
    open: always,
  },
  { family: 'list', holder: table(finishAt('lists')), open: always },
  { family: 'obligation', holder: table(finishAt('obligations')), open: always },
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

// Entries this fold left unchanged that the state of the view has closed.
export function closings(after: ExecutionView, changed: readonly ItemChange[]): ItemChange[] {
  const touched = new Set(changed.map(change => `${change.family}\0${change.item}`))
  const closing: ItemChange[] = []
  for (const family of ITEM_FAMILIES) {
    if (family.open === always) continue
    const open = family.open as (entry: Entry, view: ExecutionView) => boolean
    for (const [item, entry] of entriesOf(family, after))
      if (!touched.has(`${family.family}\0${item}`) && !open(entry, after))
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
        open: open(entry, after),
        body: entry,
        ...(was === undefined ? {} : { before: was }),
      })
    }
  }
  return changes
}
