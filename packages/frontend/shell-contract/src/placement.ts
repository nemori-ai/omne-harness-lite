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
  type Scopes,
} from '@omne-harness/dynamis'
import { NO_TENANT, READ_FOR_ALL } from './closed.ts'
import type { AttachedItem, ItemOf, SlotConflict, SlotName } from './slots.ts'

const POINT = {
  gate: 'shell.gate',
  pages: 'shell.pages',
  sidebar: 'shell.sidebar',
  float: 'shell.float',
  back: 'shell.back',
  say: 'shell.say',
  actions: 'shell.actions',
  keymap: 'shell.keymap',
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

/** The six places of the shell itself. What they hold is fixed when the application is built. */
const places: readonly Contract[] = [
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
  {
    ...SHARED,
    name: POINT.back,
    arity: 'one',
    gives:
      "the tenant scope; turn, which turns the application to its other face; and home, which goes where the front's home goes",
    binding: 'build',
    onError: 'only this item shows that it cannot be read; the shell still turns to the front',
    summary: `The back of the application: its other face once somebody is signed in. ${FIXED}`,
  },
  {
    ...SHARED,
    name: POINT.say,
    arity: 'one',
    revision: 3,
    item: {
      kind: 'pure',
      fields: {
        targets: 'function',
        current: 'function',
        subscribe: 'function',
        say: 'function',
        show: 'function',
      },
    },
    gives: 'nothing: the shell hands the tenant scope with each call',
    binding: 'build',
    onError:
      'a reading that throws or answers undefined lets nothing be said; a say that throws ends unknown and is not said again; with no said, no reply, or a reply that throws, the shell writes only that the words were taken',
    conformance:
      'from revision 2 the item may know pictures; from revision 3 a sent outcome may carry said, and reply(scope, said, listener) gives the listener the whole text the agent has said so far with coming, ended or unknown, and nothing after ended or unknown',
    summary: `Where the words a person says to the figure go, and what the agent says back: the item draws nothing, and the shell asks it afresh each time. ${FIXED}`,
  },
]

export const shellContracts: readonly Contract[] = places.map(contract => ({
  ...contract,
  scopes: contract.name === POINT.gate ? NO_TENANT : READ_FOR_ALL,
}))

export const actionsContract: Contract = {
  ...SHARED,
  name: POINT.actions,
  arity: 'list',
  item: { kind: 'pure', fields: { available: 'function', run: 'function' } },
  gives: 'nothing: an action asks what it needs when it runs',
  binding: 'run',
  scopes: READ_FOR_ALL,
  onError: 'the action is not run, and the person is told why',
  summary:
    'The shell actions by name: what a key, the palette and a button run. A module puts its own; they leave with it.',
}

export const keymapContract: Contract = {
  ...SHARED,
  name: POINT.keymap,
  arity: 'one',
  item: { kind: 'pure', fields: { changes: 'function', subscribe: 'function' } },
  gives: 'nothing',
  binding: 'run',
  scopes: READ_FOR_ALL,
  onError: 'the keys are the ones the actions come with',
  summary:
    "The account's changes to the keys of the actions: what the dispatcher and the palette read.",
}

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
    scopes: READ_FOR_ALL,
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
  scopes?: Scopes
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
  back: () => ({ point: POINT.back, key: '', id: '', rank: 0 }),
  say: () => ({ point: POINT.say, key: '', id: '', rank: 0 }),
  attached: item => ({ ...anchored(item.anchor), id: item.id, rank: item.order }),
  actions: item => ({ point: POINT.actions, key: '', id: item.id, rank: item.order }),
  keymap: () => ({ point: POINT.keymap, key: '', id: '', rank: 0 }),
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

function oneView<K extends 'gate' | 'back' | 'say' | 'keymap'>(
  registry: Registry,
  slot: K,
): SlotView<K> {
  const answer = ask<ItemOf<K>>(registry, POINT[slot], '', deployment)
  if (answer.kind === 'one') return { items: [answer.entry.item], conflicts: [] }
  if (answer.kind !== 'conflict') return NOTHING
  return { items: [], conflicts: [conflictOf(slot, answer.entries)] }
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

/** A declared point that holds a list of drawn items, and is not one of the places of the shell, is a place something can be attached to. */
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
  gate: registry => oneView(registry, 'gate'),
  pages: registry => listView(registry, 'pages', POINT.pages),
  sidebar: registry => listView(registry, 'sidebar', POINT.sidebar),
  float: registry => listView(registry, 'float', POINT.float),
  back: registry => oneView(registry, 'back'),
  say: registry => oneView(registry, 'say'),
  attached: attachedView,
  actions: registry => listView(registry, 'actions', POINT.actions),
  keymap: registry => oneView(registry, 'keymap'),
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
