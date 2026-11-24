import type {
  Admission,
  CanvasOperations,
  Item,
  KindDeclaration,
  KindName,
} from '@omne-harness/canvas-contract'
import { createCanvas, type CanvasConfig } from '../canvas.ts'
import type { CanvasStore } from '../store.ts'
import { context, fakeAuthority, fakeClock, fakeKinds, fakeMovers } from './fakes.ts'

/** A small generator with a seed, so that a failing sequence can be run again from its seed. */
function random(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (below: number) => Math.floor(next() * below)
  const pick = <T>(of: readonly T[]): T => of[int(of.length)]!
  const some = <T>(of: readonly T[], most: number): T[] =>
    Array.from({ length: 1 + int(most) }, () => pick(of))
  return { int, pick, some, chance: (p: number) => next() < p }
}

export const PROPERTY_CONFIG: CanvasConfig = {
  sheet: { width: 1600, height: 1200, grid: 8 },
  limits: { placed: 6, away: 4, batch: 6 },
  size: { min: { width: 120, height: 64 }, max: { width: 480, height: 400 } },
  footprint: { width: 160, height: 80 },
  admitTimeoutMs: 1000,
}

const REFS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const PILES = ['p1', 'p2', 'p3']
const ADMISSIONS: readonly (Admission['kind'] | 'throw')[] = [
  'admitted',
  'admitted',
  'admitted',
  'refused',
  'unknown',
  'basis-unavailable',
  'throw',
]

type Generator = ReturnType<typeof random>
type Step = Readonly<{ name: string; run(canvas: CanvasOperations): Promise<unknown> }>

function stepOf(g: Generator, known: readonly string[]): Step {
  const ctx = context()
  const ids = [...known, 'i99']
  const { width, height } = PROPERTY_CONFIG.sheet
  const spot = () => (g.chance(0.05) ? { x: width, y: 0 } : { x: g.int(width), y: g.int(height) })
  const maybe = <T>(value: () => T) => (g.chance(0.4) ? value() : undefined)
  const size = () => ({ width: 120 + g.int(300), height: 64 + g.int(300) })
  const request = (fields: Record<string, unknown>) => {
    const out: Record<string, unknown> = { canvas: 'main' }
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) out[key] = value
    return out
  }
  switch (g.int(8)) {
    case 0:
    case 1: {
      const kind = g.pick(['media.object', 'media.object', 'canvas.app', 'other.kind'])
      const body = request({
        reference: { kind, ref: g.pick(REFS) },
        at: maybe(spot),
        near: maybe(spot),
        size: maybe(size),
      })
      return { name: `place ${JSON.stringify(body)}`, run: canvas => canvas.place(ctx, body) }
    }
    case 2: {
      const items = g.some(ids, 3).map(item =>
        request({
          item,
          at: maybe(spot),
          size: maybe(size),
          top: g.chance(0.3) ? true : undefined,
          pile: g.chance(0.3) ? g.pick([null, ...PILES]) : undefined,
        }),
      )
      const body = request({
        items: items.map(({ canvas: _canvas, ...rest }) => rest),
        piles: g.chance(0.3) ? [{ pile: g.pick(PILES), at: spot() }] : [],
      })
      return { name: `arrange ${JSON.stringify(body)}`, run: canvas => canvas.arrange(ctx, body) }
    }
    case 3: {
      const body = request({ items: g.some(ids, 2) })
      return { name: `take ${JSON.stringify(body)}`, run: canvas => canvas.take(ctx, body) }
    }
    case 4: {
      const body = request({ pile: g.pick(PILES), items: g.some(ids, 3), at: maybe(spot) })
      return { name: `pile ${JSON.stringify(body)}`, run: canvas => canvas.pile(ctx, body) }
    }
    case 5: {
      const body = request({ pile: g.pick(PILES) })
      return { name: `scatter ${JSON.stringify(body)}`, run: canvas => canvas.scatter(ctx, body) }
    }
    default: {
      const body = request({ items: g.some(ids, 2), locked: g.chance(0.6) })
      return { name: `lock ${JSON.stringify(body)}`, run: canvas => canvas.lock(ctx, body) }
    }
  }
}

type Seen = Readonly<{ revision: number; on: readonly Item[]; off: readonly Item[] }>

/** Every property the arrangement keeps after every step; the first that does not hold, in words. */
function broken(seen: Seen, before: Seen | null): string | null {
  const { sheet } = PROPERTY_CONFIG
  const all = [...seen.on, ...seen.off]
  const refs = new Set(all.map(item => JSON.stringify(item.reference)))
  if (refs.size !== all.length) return 'a reference has two records'
  const ranks = new Set(seen.on.map(item => item.rank))
  if (ranks.size !== seen.on.length) return 'two items on the sheet share a rank'
  if (seen.off.some(item => item.pile !== null || item.locked))
    return 'a taken item is in a pile or locked'
  if (seen.on.some(item => item.locked && item.pile !== null)) return 'a locked item is in a pile'
  if (seen.on.some(item => item.at.x >= sheet.width || item.at.y >= sheet.height))
    return 'an item is off the sheet'
  if (seen.on.length > PROPERTY_CONFIG.limits.placed) return 'more items are on than the limit'
  if (before === null) return null
  if (seen.revision < before.revision) return 'the revision went back'
  for (const was of before.on.filter(item => item.locked)) {
    const now = seen.on.find(item => item.id === was.id)
    if (now === undefined) return `the locked item ${was.id} left the sheet`
    if (
      now.locked &&
      JSON.stringify([now.at, now.size, now.pile]) !== JSON.stringify([was.at, was.size, was.pile])
    )
      return `the locked item ${was.id} changed`
  }
  return null
}

async function seenOf(canvas: CanvasOperations): Promise<Seen | string> {
  const ctx = context()
  const look = await canvas.look(ctx, { canvas: 'main' })
  const away = await canvas.lookAway(ctx, { canvas: 'main', limit: 1000 })
  if (look.kind !== 'done' || away.kind !== 'done') return 'the canvas could not be read'
  const inPiles = new Set(look.value.items.map(item => item.pile))
  const piles = new Set(look.value.piles.map(pile => pile.id))
  for (const pile of piles) if (!inPiles.has(pile)) return `the pile ${pile} has no item`
  for (const pile of inPiles) if (pile !== null && !piles.has(pile)) return `no pile ${pile}`
  return { revision: look.value.revision, on: look.value.items, off: away.value.items }
}

/** Runs one seeded sequence of every write on the domain over a store; rejects with the seed, the step and what broke. */
export async function runCanvasProperties(
  open: () => Promise<CanvasStore>,
  seed: number,
  steps: number,
): Promise<void> {
  const g = random(seed)
  const kinds = fakeKinds()
  const answer = async (): Promise<Admission> => {
    const kind = g.pick(ADMISSIONS)
    if (kind === 'throw') throw new Error('the owner fell over')
    return { kind }
  }
  const declaration = (name: string, admit?: KindDeclaration['admit']): KindDeclaration => ({
    name: name as KindName,
    label: name,
    summary: name,
    reference: name,
    ...(admit === undefined ? {} : { admit }),
  })
  kinds.declare(declaration('media.object', answer))
  kinds.declare(declaration('canvas.app'))
  const movers = fakeMovers()
  const store = await open()
  const canvas = createCanvas({
    store,
    authority: fakeAuthority(),
    movers,
    kinds,
    clock: fakeClock(),
    config: PROPERTY_CONFIG,
  })
  let before: Seen | null = null
  for (let step = 0; step < steps; step += 1) {
    movers.set(g.chance(0.5) ? { kind: 'human' } : { kind: 'agent', session: `s-${g.int(3)}` })
    const known = before === null ? [] : [...before.on, ...before.off].map(item => item.id)
    const next = stepOf(g, known)
    const answered = (await next.run(canvas)) as { kind: string }
    if (answered.kind === 'unknown' || answered.kind === 'basis-unavailable') {
      if (!next.name.startsWith('place'))
        throw new Error(`seed ${seed}, step ${step}, ${next.name}: ${answered.kind}`)
    }
    const seen = await seenOf(canvas)
    const problem = typeof seen === 'string' ? seen : broken(seen, before)
    if (problem !== null) throw new Error(`seed ${seed}, step ${step}, ${next.name}: ${problem}`)
    before = seen as Seen
  }
}
