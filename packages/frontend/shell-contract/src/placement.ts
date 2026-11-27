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
  type Scope,
  type Scopes,
} from '@omne-harness/dynamis'
import { NO_TENANT } from './closed.ts'
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
const OPEN =
  'A plugin adds to it while the app runs, for its tenant; one with the id of an item of the app takes its place.'

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

const copied = (member: string, file: string, code: readonly string[]): string =>
  [member, `${file}:`, ...code].join('\n')

const EXAMPLE = {
  pages: copied(
    '{"point":"shell.pages","key":"","id":"weather","rank":50,"module":"weather-page.js","export":"page"}',
    'weather-page.js',
    [
      "export const page = ({ React }) => ({ id: 'weather', title: 'Weather', order: 50, icon: 'weather',",
      "  render: ({ scope }) => React.createElement('main', null, 'The forecast') })",
    ],
  ),
  sidebar: copied(
    '{"point":"shell.sidebar","key":"","id":"weather-now","rank":50,"module":"weather-side.js","export":"section"}',
    'weather-side.js',
    [
      "export const section = ({ React }) => ({ id: 'weather-now', order: 50,",
      "  render: () => React.createElement('div', null, 'Sunny') })",
    ],
  ),
  float: copied(
    '{"point":"shell.float","key":"","id":"weather-chip","rank":50,"module":"weather-chip.js","export":"chip"}',
    'weather-chip.js',
    [
      "export const chip = ({ React }) => ({ id: 'weather-chip', order: 50,",
      "  render: ({ grip }) => React.createElement('div', grip, 'Sunny') })",
    ],
  ),
  back: copied('{"point":"shell.back","key":"","module":"back.js","export":"back"}', 'back.js', [
    "export const back = ({ React }) => ({ id: 'plain-back',",
    "  render: ({ turn }) => React.createElement('button', { onClick: turn }, 'Turn back') })",
  ]),
  say: copied('{"point":"shell.say","key":"","module":"say.js","export":"say"}', 'say.js', [
    "export const say = () => ({ id: 'nowhere', targets: () => [], current: () => undefined,",
    '  subscribe: () => () => undefined, show: () => undefined,',
    "  say: async () => ({ kind: 'failed', reason: 'this place takes no words yet' }) })",
  ]),
  actions: copied(
    '{"point":"shell.actions","key":"","id":"weather.refresh","rank":50,"module":"refresh.js","export":"refresh"}',
    'refresh.js',
    [
      "export const refresh = () => ({ id: 'weather.refresh', title: 'Refresh the forecast', group: 'weather',",
      "  kind: 'command', order: 50, available: () => true, run: () => undefined })",
    ],
  ),
  keymap: copied(
    '{"point":"shell.keymap","key":"","module":"keys.js","export":"keys"}',
    'keys.js',
    [
      "export const keys = () => ({ id: 'my-keys', changes: () => ({}), subscribe: () => () => undefined })",
    ],
  ),
} as const

/** The six places of the shell itself. The login gate is fixed when the application is built; the others are open. */
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
    revision: 2,
    item: {
      kind: 'pure',
      fields: {
        id: 'string',
        title: 'string',
        order: 'number',
        icon: 'string',
        render: 'function',
      },
    },
    gives: 'the tenant scope, and a subject when the page is brought up on one',
    binding: 'run',
    resolve: 'most-specific',
    onError: 'only this page shows that it cannot be read',
    summary: `The pages of the shell, in the order of their order and id. ${OPEN}`,
    example: EXAMPLE.pages,
  },
  {
    ...SHARED,
    name: POINT.sidebar,
    arity: 'list',
    revision: 2,
    item: { kind: 'pure', fields: { id: 'string', order: 'number', render: 'function' } },
    gives: 'the tenant scope',
    binding: 'run',
    resolve: 'most-specific',
    onError: 'only this section shows that it cannot be read',
    summary: `The sections of the sidebar, in the order of their order and id. ${OPEN}`,
    example: EXAMPLE.sidebar,
  },
  {
    ...SHARED,
    name: POINT.float,
    arity: 'list',
    revision: 2,
    item: { kind: 'pure', fields: { id: 'string', order: 'number', render: 'function' } },
    gives:
      'the tenant scope; grip, the attributes that let a person drag it; corner; dragging; and note, where the shell writes a note beside it',
    binding: 'run',
    resolve: 'most-specific',
    onError: 'only this item is not drawn',
    summary: `What floats over the whole application once somebody is signed in, in the order of their order and id. ${OPEN}`,
    example: EXAMPLE.float,
  },
  {
    ...SHARED,
    name: POINT.back,
    arity: 'one',
    revision: 2,
    item: { kind: 'pure', fields: { id: 'string', render: 'function' } },
    gives:
      "the tenant scope; turn, which turns the application to its other face; and home, which goes where the front's home goes",
    binding: 'run',
    resolve: 'most-specific',
    onError: 'only this item shows that it cannot be read; the shell still turns to the front',
    summary: `The back of the application: its other face once somebody is signed in. ${OPEN}`,
    example: EXAMPLE.back,
  },
  {
    ...SHARED,
    name: POINT.say,
    arity: 'one',
    revision: 4,
    item: {
      kind: 'pure',
      fields: {
        id: 'string',
        targets: 'function',
        current: 'function',
        subscribe: 'function',
        say: 'function',
        show: 'function',
      },
    },
    gives: 'nothing: the shell hands the tenant scope with each call',
    binding: 'run',
    resolve: 'most-specific',
    onError:
      'a reading that throws or answers undefined lets nothing be said; a say that throws ends unknown and is not said again; with no said, no reply, or a reply that throws, the shell writes only that the words were taken',
    conformance:
      "from revision 2 the item may know pictures; from revision 3 a sent outcome may carry said, and reply(scope, said, listener) gives the listener the whole text the agent has said so far with coming, ended or unknown, and nothing after ended or unknown; from revision 4 the item names itself with id, and one of the tenant takes the place of the app's",
    summary: `Where the words a person says to the figure go, and what the agent says back: the item draws nothing, and the shell asks it afresh each time. ${OPEN}`,
    example: EXAMPLE.say,
  },
]

export const shellContracts: readonly Contract[] = places.map(contract =>
  contract.name === POINT.gate ? { ...contract, scopes: NO_TENANT } : contract,
)

export const actionsContract: Contract = {
  ...SHARED,
  name: POINT.actions,
  arity: 'list',
  revision: 2,
  item: {
    kind: 'pure',
    fields: {
      id: 'string',
      title: 'string',
      group: 'string',
      kind: 'string',
      order: 'number',
      available: 'function',
      run: 'function',
    },
  },
  gives: 'nothing: an action asks what it needs when it runs',
  resolve: 'most-specific',
  binding: 'run',
  onError: 'the action is not run, and the person is told why',
  summary:
    'The shell actions by name: what a key, the palette and a button run. A module puts its own; they leave with it. The actions of the shell itself are locked.',
  example: EXAMPLE.actions,
}

export const keymapContract: Contract = {
  ...SHARED,
  name: POINT.keymap,
  arity: 'one',
  revision: 2,
  item: { kind: 'pure', fields: { id: 'string', changes: 'function', subscribe: 'function' } },
  gives: 'nothing',
  resolve: 'most-specific',
  binding: 'run',
  onError: 'the keys are the ones the actions come with',
  summary:
    "The account's changes to the keys of the actions: what the dispatcher and the palette read.",
  example: EXAMPLE.keymap,
}

function attachedExample(name: string, keyed: boolean): string {
  const anchor = keyed ? `${name}:<key>` : name
  return copied(
    `{"point":"${name}","key":"${keyed ? '<key>' : ''}","id":"mine","rank":50,"module":"item.js","export":"item"}`,
    'item.js',
    [
      `export const item = ({ React }) => ({ id: 'mine', order: 50, anchor: '${anchor}',`,
      "  render: ({ subject }) => React.createElement('div', null, subject) })",
    ],
  )
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
    revision: 2,
    key: keyed ? (words.key ?? 'the key the host shows') : SHARED.key,
    item: {
      kind: 'pure',
      fields: { id: 'string', order: 'number', anchor: 'string', render: 'function' },
    },
    gives: 'the tenant scope and the subject the host shows',
    resolve: 'most-specific',
    binding: 'run',
    onError: 'only this item shows that it cannot be read',
    summary: words.summary ?? `The point ${name}.`,
    example: attachedExample(name, keyed),
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
export function entryOf<K extends SlotName>(
  slot: K,
  item: ItemOf<K>,
  instance: Instance,
  scope: Scope = [],
  lock = false,
): Entry {
  const digest = `${instance.fiber}#${instance.generation}`
  return { ...SPOT[slot](item), scope, digest, item, ...(lock && { lock: true as const }) }
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
  asker: Scope,
): SlotView<K> {
  const answer = ask<ItemOf<K>>(registry, POINT[slot], '', asker)
  if (answer.kind === 'one') return { items: [answer.entry.item], conflicts: [] }
  if (answer.kind !== 'conflict') return NOTHING
  return { items: [], conflicts: [conflictOf(slot, answer.entries)] }
}

function listView<K extends SlotName>(
  registry: Registry,
  slot: K,
  point: string,
  asker: Scope,
): SlotView<K> {
  const listing = list<ItemOf<K>>(registry, point, null, asker)
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
function attachedView(registry: Registry, asker: Scope): SlotView<'attached'> {
  const declared = list<Contract>(registry, CATALOG, null, deployment)
  if (declared.kind !== 'read') return NOTHING
  const own: readonly string[] = Object.values(POINT)
  const views = declared.items
    .filter(item => item.entry.item.item.fields['render'] === 'function')
    .filter(item => LISTED.includes(item.entry.item.arity))
    .map(item => item.entry.key)
    .filter(name => !own.includes(name))
    .map(name => listView(registry, 'attached', name, asker))
  return {
    items: views.flatMap(view => view.items).sort(byOrderThenId),
    conflicts: views.flatMap(view => view.conflicts),
  }
}

const VIEW: { readonly [K in SlotName]: (registry: Registry, asker: Scope) => SlotView<K> } = {
  gate: (registry, asker) => oneView(registry, 'gate', asker),
  pages: (registry, asker) => listView(registry, 'pages', POINT.pages, asker),
  sidebar: (registry, asker) => listView(registry, 'sidebar', POINT.sidebar, asker),
  float: (registry, asker) => listView(registry, 'float', POINT.float, asker),
  back: (registry, asker) => oneView(registry, 'back', asker),
  say: (registry, asker) => oneView(registry, 'say', asker),
  attached: attachedView,
  actions: (registry, asker) => listView(registry, 'actions', POINT.actions, asker),
  keymap: (registry, asker) => oneView(registry, 'keymap', asker),
}

export function viewOf<K extends SlotName>(
  registry: Registry,
  slot: K,
  asker: Scope = deployment,
): SlotView<K> {
  return VIEW[slot](registry, asker)
}

/** Two views are one when they hold the same items in the same order and name the same conflicts. */
export function sameView(left: SlotView, right: SlotView): boolean {
  return (
    left.items.length === right.items.length &&
    left.items.every((item, index) => item === right.items[index]) &&
    JSON.stringify(left.conflicts) === JSON.stringify(right.conflicts)
  )
}
