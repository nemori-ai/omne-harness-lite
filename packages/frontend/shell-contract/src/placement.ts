import {
  CATALOG,
  ask,
  deployment,
  list,
  type Contract,
  type Entry,
  type Instance,
  type Placed,
  type Registry,
} from '@omne-harness/dynamis'
import type { AttachedItem, GateItem, ItemOf, SlotConflict, SlotName } from './slots.ts'

const POINT = {
  gate: 'shell.gate',
  pages: 'shell.pages',
  sidebar: 'shell.sidebar',
  float: 'shell.float',
} as const

const FIXED = 'Fixed when the app is built: a plugin cannot add to it while the app runs.'

const SHARED = {
  tree: 'client',
  keyFrom: null,
  key: 'none',
  item: { kind: 'pure', fields: { render: 'function' } },
  resolve: 'conflict',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
} as const

/** The four places of the shell itself. What they hold is fixed when the application is built. */
export const shellContracts: readonly Contract[] = [
  {
    ...SHARED,
    name: POINT.gate,
    arity: 'one',
    gives: 'nothing',
    binding: 'build',
    onError: 'the gate shows that this item cannot be read',
    summary: `The login gate: all the shell shows while nobody is signed in. ${FIXED}`,
  },
  {
    ...SHARED,
    name: POINT.pages,
    arity: 'list',
    gives: 'the tenant scope, and a subject when the page is brought up on one',
    binding: 'build',
    onError: 'only this page shows that it cannot be read',
    summary: `The pages of the shell, in the order of their order and id. ${FIXED}`,
  },
  {
    ...SHARED,
    name: POINT.sidebar,
    arity: 'list',
    gives: 'the tenant scope',
    binding: 'build',
    onError: 'only this section shows that it cannot be read',
    summary: `The sections of the sidebar, in the order of their order and id. ${FIXED}`,
  },
  {
    ...SHARED,
    name: POINT.float,
    arity: 'list',
    gives: 'the tenant scope',
    binding: 'build',
    onError: 'only this item is not drawn',
    summary: `What floats over the whole application once somebody is signed in, in the order of their order and id. ${FIXED}`,
  },
]

/** The contract of a point a view module declares: what is put there can change while running. */
export function pointContract(
  name: string,
  keyed: boolean,
  words: Readonly<{ summary?: string; key?: string }> = {},
): Contract {
  return {
    ...SHARED,
    name,
    arity: keyed ? 'keyed-list' : 'list',
    key: keyed ? (words.key ?? 'the key the host shows') : SHARED.key,
    gives: 'the tenant scope and the subject the host shows',
    binding: 'run',
    onError: 'only this item shows that it cannot be read',
    summary: words.summary ?? `The point ${name}.`,
  }
}

export type DrawingWords = Readonly<{
  name: string
  key: string
  summary: string
  subject?: string
  example?: string
}>

export function drawingContract(words: DrawingWords): Contract {
  const { subject, example, ...said } = words
  const told = subject === undefined ? 'the subject the host shows' : `the subject (${subject})`
  return {
    ...SHARED,
    ...said,
    ...(example === undefined ? {} : { example }),
    arity: 'keyed-one',
    gives: `the scope of the tenant, ${told}, and generic, the drawing the host uses when nothing is put`,
    resolve: 'most-specific',
    binding: 'run',
    onError: 'a drawing that throws falls back to the generic drawing of the host',
  }
}

type Spot = Readonly<{ point: string; key: string; id: string; rank: number }>

/** An attached place is a point, or a point and a key after the first colon. */
function anchored(anchor: string): Readonly<{ point: string; key: string }> {
  const at = anchor.indexOf(':')
  return at === -1
    ? { point: anchor, key: '' }
    : { point: anchor.slice(0, at), key: anchor.slice(at + 1) }
}

const SPOT: { readonly [K in SlotName]: (item: ItemOf<K>) => Spot } = {
  gate: () => ({ point: POINT.gate, key: '', id: '', rank: 0 }),
  pages: item => ({ point: POINT.pages, key: '', id: item.id, rank: item.order }),
  sidebar: item => ({ point: POINT.sidebar, key: '', id: item.id, rank: item.order }),
  float: item => ({ point: POINT.float, key: '', id: item.id, rank: item.order }),
  attached: item => ({ ...anchored(item.anchor), id: item.id, rank: item.order }),
}

/** A render function has no digest of its own: the instance that put it stands for its content. */
export function entryOf<K extends SlotName>(slot: K, item: ItemOf<K>, instance: Instance): Entry {
  const digest = `${instance.fiber}#${instance.generation}`
  return { ...SPOT[slot](item), scope: [], digest, item }
}

export type SlotView<K extends SlotName = SlotName> = Readonly<{
  items: readonly ItemOf<K>[]
  conflicts: readonly SlotConflict[]
}>

const NOTHING: SlotView<never> = { items: [], conflicts: [] }

function conflictOf(slot: SlotName, entries: readonly Placed[]): SlotConflict {
  const [first] = entries as readonly [Placed<Partial<AttachedItem>>, ...Placed[]]
  const by = entries.map(entry => entry.instance.fiber)
  return { slot, anchor: first.item.anchor, id: first.id, by }
}

function gateView(registry: Registry): SlotView<'gate'> {
  const answer = ask<GateItem>(registry, POINT.gate, '', deployment)
  if (answer.kind === 'one') return { items: [answer.entry.item], conflicts: [] }
  if (answer.kind !== 'conflict') return NOTHING
  return { items: [], conflicts: [conflictOf('gate', answer.entries)] }
}

function listView<K extends SlotName>(registry: Registry, slot: K, point: string): SlotView<K> {
  const listing = list<ItemOf<K>>(registry, point, null, deployment)
  if (listing.kind !== 'read') return NOTHING
  return {
    items: listing.items.map(item => item.entry.item),
    conflicts: listing.conflicts.map(entries => conflictOf(slot, entries)),
  }
}

const LISTED: readonly string[] = ['list', 'keyed-list']

const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

const byOrderThenId = (left: AttachedItem, right: AttachedItem): number =>
  left.order - right.order || byText(left.id, right.id) || byText(left.anchor, right.anchor)

/** A declared point that holds a list of drawn items, and is not one of the four of the shell, is a place something can be attached to. */
function attachedView(registry: Registry): SlotView<'attached'> {
  const declared = list<Contract>(registry, CATALOG, null, deployment)
  if (declared.kind !== 'read') return NOTHING
  const own: readonly string[] = Object.values(POINT)
  const views = declared.items
    .filter(item => item.entry.item.item.fields['render'] === 'function')
    .filter(item => LISTED.includes(item.entry.item.arity))
    .map(item => item.entry.key)
    .filter(name => !own.includes(name))
    .map(name => listView(registry, 'attached', name))
  return {
    items: views.flatMap(view => view.items).sort(byOrderThenId),
    conflicts: views.flatMap(view => view.conflicts),
  }
}

const VIEW: { readonly [K in SlotName]: (registry: Registry) => SlotView<K> } = {
  gate: gateView,
  pages: registry => listView(registry, 'pages', POINT.pages),
  sidebar: registry => listView(registry, 'sidebar', POINT.sidebar),
  float: registry => listView(registry, 'float', POINT.float),
  attached: attachedView,
}

export function viewOf<K extends SlotName>(registry: Registry, slot: K): SlotView<K> {
  return VIEW[slot](registry)
}

/** Two views are one when they hold the same items in the same order and name the same conflicts. */
export function sameView(left: SlotView, right: SlotView): boolean {
  return (
    left.items.length === right.items.length &&
    left.items.every((item, index) => item === right.items[index]) &&
    JSON.stringify(left.conflicts) === JSON.stringify(right.conflicts)
  )
}
