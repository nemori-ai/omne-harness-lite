import {
  MAIN_CANVAS,
  instantSchema,
  itemIdSchema,
  pileIdSchema,
  tenantIdSchema,
  type Item,
  type Reference,
} from '@omne-harness/canvas-contract'
import { createCanvas, type CanvasConfig } from '../canvas.ts'
import type { CanvasStore, Rules, StoreAnswer, StoreRead } from '../store.ts'
import { fakeAuthority, fakeClock, fakeKinds, fakeMovers } from './fakes.ts'

export type StoreConformanceCase = Readonly<{
  name: string
  /** Runs the case against a store of its own; rejects with what did not hold. */
  run(open: () => Promise<CanvasStore>): Promise<void>
}>

const T1 = tenantIdSchema.parse('conformance-tenant-1')
const T2 = tenantIdSchema.parse('conformance-tenant-2')
const RULES: Rules = {
  sheet: { width: 4800, height: 3200, grid: 8 },
  footprint: { width: 160, height: 80 },
  placed: 3,
  away: 2,
}
const stamp = {
  canvas: MAIN_CANVAS,
  by: { kind: 'human' },
  when: instantSchema.parse('2026-11-24T06:00:00.000Z'),
  rules: RULES,
} as const
const ref = (name: string): Reference => ({ kind: 'media.object', ref: name })
const itemId = (text: string) => itemIdSchema.parse(text)
const pileId = (text: string) => pileIdSchema.parse(text)

function same(actual: unknown, expected: unknown, what: string): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${what}: expected ${right}, got ${left}`)
}

function read<T>(answer: StoreRead<T>, what: string): T {
  if (answer.kind !== 'read') throw new Error(`${what}: the read answered ${answer.kind}`)
  return answer.value
}

function committed<T>(answer: StoreAnswer<T>, what: string): T {
  if (answer.kind !== 'committed') throw new Error(`${what}: the commit answered ${answer.kind}`)
  return answer.value
}

/** Puts a reference on at a spot of its own and gives back the item. */
async function placed(store: CanvasStore, name: string, x: number): Promise<Item> {
  const at = { x, y: 0 }
  const result = committed(
    await store.place(T1, { ...stamp, reference: ref(name), at, declared: true }),
    `place ${name}`,
  )
  if (result.kind !== 'changed') throw new Error(`place ${name}: ${result.kind}`)
  return result.item
}

/** Numbers apart from those of the deployment, so a look that kept its own would show. */
const CONFIG: CanvasConfig = {
  sheet: { width: 2400, height: 1600, grid: 16 },
  limits: { placed: 3, away: 2, batch: 5 },
  size: { min: { width: 96, height: 48 }, max: { width: 640, height: 480 } },
  footprint: { width: 200, height: 120 },
  admitTimeoutMs: 50,
}

const lookOf = async (store: CanvasStore, tenant = T1) =>
  read(await store.look(tenant, MAIN_CANVAS), 'look')

/** What every store of the canvas answers, whatever it keeps the facts in. */
export const storeConformanceCases: readonly StoreConformanceCase[] = [
  {
    name: 'a canvas nothing was committed to reads at revision 0, with no item and no pile',
    async run(open) {
      const store = await open()
      for (const tenant of [T1, T2])
        same(
          read(await store.look(tenant, MAIN_CANVAS), `the canvas of ${tenant}`),
          { revision: 0, items: [], piles: [] },
          `the canvas of ${tenant}`,
        )
    },
  },
  {
    name: 'place writes one item on top and moves the revision; placing it again changes nothing',
    async run(open) {
      const store = await open()
      const first = await placed(store, 'a', 0)
      const second = await placed(store, 'b', 400)
      same([first.rank < second.rank, first.state, first.pile], [true, 'on', null], 'the items')
      const again = committed(
        await store.place(T1, { ...stamp, reference: ref('a'), declared: true }),
        'place a again',
      )
      same(again, { kind: 'no-change', item: first }, 'place a again')
      const look = await lookOf(store)
      same([look.revision, look.items.map(item => item.id)], [2, [first.id, second.id]], 'look')
      same(
        read(await store.placing(T1, MAIN_CANVAS, ref('a')), 'placing'),
        { item: first, placed: 2 },
        'placing',
      )
    },
  },
  {
    name: 'place checks at its commit that the sheet is below the limit and the kind is declared',
    async run(open) {
      const store = await open()
      const undeclared = await store.place(T1, { ...stamp, reference: ref('a'), declared: false })
      same(
        committed(undeclared, 'undeclared'),
        { kind: 'conflict', reason: 'kind-undeclared' },
        'undeclared',
      )
      for (const [name, x] of [
        ['a', 0],
        ['b', 400],
        ['c', 800],
      ] as const)
        await placed(store, name, x)
      const full = await store.place(T1, { ...stamp, reference: ref('d'), declared: true })
      same(committed(full, 'full'), { kind: 'conflict', reason: 'full' }, 'full')
      same((await lookOf(store)).revision, 3, 'the revision')
    },
  },
  {
    name: 'arrange changes a batch in one commit; a batch with an entry not found writes nothing',
    async run(open) {
      const store = await open()
      const a = await placed(store, 'a', 0)
      const b = await placed(store, 'b', 400)
      const stopped = await store.arrange(T1, {
        ...stamp,
        items: [
          { item: a.id, at: { x: 16, y: 16 } },
          { item: itemId('nowhere'), top: true },
        ],
        piles: [],
      })
      same(
        committed(stopped, 'stopped'),
        { kind: 'not-found', entry: { item: 'nowhere' } },
        'stopped',
      )
      same((await lookOf(store)).items[0]?.at, a.at, 'the first entry of the stopped batch')
      const moved = await store.arrange(T1, {
        ...stamp,
        items: [{ item: a.id, at: { x: 16, y: 16 }, top: true }],
        piles: [],
      })
      same(committed(moved, 'moved'), { kind: 'changed', revision: 3 }, 'moved')
      const look = await lookOf(store)
      same(
        look.items.map(item => [item.id, item.at]),
        [
          [b.id, b.at],
          [a.id, { x: 16, y: 16 }],
        ],
        'look',
      )
      const again = await store.arrange(T1, {
        ...stamp,
        items: [{ item: a.id, at: { x: 16, y: 16 }, top: true }],
        piles: [],
      })
      same(committed(again, 'again'), { kind: 'no-change' }, 'again')
    },
  },
  {
    name: 'pile makes a pile the caller names, scatter takes it away again',
    async run(open) {
      const store = await open()
      const a = await placed(store, 'a', 0)
      const b = await placed(store, 'b', 400)
      const p = pileId('p1')
      const piled = await store.pile(T1, { ...stamp, pile: p, items: [b.id, a.id] })
      same(committed(piled, 'pile'), { kind: 'changed', revision: 3 }, 'pile')
      const look = await lookOf(store)
      same(
        look.piles.map(pile => [pile.id, pile.at]),
        [[p, b.at]],
        'the pile',
      )
      same(
        look.items.map(item => item.pile),
        [p, p],
        'the items in it',
      )
      same(
        committed(await store.pile(T1, { ...stamp, pile: p, items: [a.id] }), 'again'),
        { kind: 'no-change' },
        'again',
      )
      same(
        committed(await store.scatter(T1, { ...stamp, pile: p }), 'scatter'),
        { kind: 'changed', revision: 4 },
        'scatter',
      )
      const after = await lookOf(store)
      same([after.piles, after.items.map(item => item.pile)], [[], [null, null]], 'scattered')
      same(
        committed(await store.scatter(T1, { ...stamp, pile: p }), 'again'),
        { kind: 'no-change' },
        'gone',
      )
    },
  },
  {
    name: 'take keeps the record off the sheet, newest first, and drops the oldest past the limit',
    async run(open) {
      const store = await open()
      const items = [
        await placed(store, 'a', 0),
        await placed(store, 'b', 400),
        await placed(store, 'c', 800),
      ]
      for (const item of items)
        committed(await store.take(T1, { ...stamp, items: [item.id] }), `take ${item.id}`)
      const page = read(await store.away(T1, MAIN_CANVAS, { limit: 1 }), 'away')
      same(
        page.items.map(item => [item.id, item.state, item.at]),
        [[items[2]!.id, 'off', items[2]!.at]],
        'the newest',
      )
      const rest = read(
        await store.away(T1, MAIN_CANVAS, { limit: 5, before: page.next! }),
        'the rest',
      )
      same([rest.items.map(item => item.id), rest.next], [[items[1]!.id], null], 'the rest')
      same(
        read(await store.placing(T1, MAIN_CANVAS, ref('a')), 'a'),
        { item: null, placed: 0 },
        'the dropped',
      )
      same(
        committed(await store.take(T1, { ...stamp, items: [items[2]!.id] }), 'again'),
        { kind: 'no-change' },
        'again',
      )
    },
  },
  {
    name: 'lock and unlock write the lock, and nothing when it is already so',
    async run(open) {
      const store = await open()
      const a = await placed(store, 'a', 0)
      const locking = { ...stamp, items: [a.id], locked: true }
      same(
        committed(await store.lock(T1, locking), 'lock'),
        { kind: 'changed', revision: 2 },
        'lock',
      )
      same(committed(await store.lock(T1, locking), 'again'), { kind: 'no-change' }, 'again')
      same((await lookOf(store)).items[0]?.locked, true, 'locked')
      const moving = { ...stamp, items: [{ item: a.id, at: { x: 8, y: 8 } }], piles: [] }
      same(
        committed(await store.arrange(T1, moving), 'move'),
        { kind: 'conflict', reason: 'locked', entry: { item: a.id } },
        'move',
      )
      same(
        committed(await store.lock(T1, { ...locking, locked: false }), 'unlock'),
        { kind: 'changed', revision: 3 },
        'unlock',
      )
    },
  },
  {
    name: 'look over the store gives the sheet with the sizes and the footprint of the configuration',
    async run(open) {
      const store = await open()
      const a = await placed(store, 'a', 0)
      const ports = { authority: fakeAuthority(), movers: fakeMovers(), kinds: fakeKinds() }
      const canvas = createCanvas({ store, ...ports, clock: fakeClock(), config: CONFIG })
      const { sheet, size, footprint } = CONFIG
      same(
        await canvas.look({ tenant: T1, subject: { person: T1 } }, { canvas: MAIN_CANVAS }),
        {
          kind: 'done',
          value: { sheet: { ...sheet, size, footprint }, revision: 1, items: [a], piles: [] },
        },
        'look',
      )
    },
  },
  {
    name: 'one tenant’s commits are not seen by another, whose identities find nothing',
    async run(open) {
      const store = await open()
      const a = await placed(store, 'a', 0)
      same((await lookOf(store, T2)).items, [], 'the other tenant’s canvas')
      const take = await store.take(T2, { ...stamp, items: [a.id] })
      same(committed(take, 'take'), { kind: 'not-found', entry: { item: a.id } }, 'take')
      same(
        (await lookOf(store)).items.map(item => item.id),
        [a.id],
        'the first tenant’s canvas',
      )
    },
  },
]
