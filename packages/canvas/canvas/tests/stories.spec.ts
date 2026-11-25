import { describe, expect, it } from 'vitest'
import type { Item, Reference, Spot } from '@omne-harness/canvas-contract'
import { CONFIG, kind, media, world } from './fixture.ts'

/**
 * The five rules of where things land, each walked through as a person on the sheet and as an
 * agent through the tools would: what they expect to see, run on the real canvas.
 */

type World = ReturnType<typeof world>

const STEP = CONFIG.sheet.grid
/** The room of an item without a size, with its name line. */
const ROOM = { width: CONFIG.footprint.width, height: CONFIG.footprint.height + 22 }
const SEAT = { x: CONFIG.sheet.width / 2, y: CONFIG.sheet.height / 2 }
const AGENT = { kind: 'agent', session: 's-week' } as const

const session = (ref: string): Reference => ({ kind: 'session.session', ref })

function canvasWith(store?: World['store'], away?: number) {
  const w = world({
    ...(store === undefined ? {} : { store }),
    ...(away === undefined ? {} : { config: { limits: { ...CONFIG.limits, away } } }),
  })
  w.kinds.declare(kind('media.object'))
  w.kinds.declare(kind('session.session'))
  return w
}

async function look(w: World) {
  const read = await w.canvas.look(w.ctx, { canvas: 'main' })
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value
}

async function put(w: World, reference: Reference, where: object = {}): Promise<Item> {
  const answer = await w.canvas.place(w.ctx, { canvas: 'main', reference, ...where })
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
  return answer.value.item
}

async function done(answer: Promise<{ kind: string }>) {
  expect(await answer).toMatchObject({ kind: 'done' })
}

const take = (w: World, items: readonly string[]) =>
  done(w.canvas.take(w.ctx, { canvas: 'main', items: [...items] }))

const spotOf = async (w: World, id: string) =>
  (await look(w)).items.find(item => item.id === id)!.at

async function awayItems(w: World) {
  const read = await w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 100 })
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value.items
}

const awayRefs = async (w: World) => (await awayItems(w)).map(item => item.reference.ref)

type Box = Readonly<{ x: number; y: number; width: number; height: number }>
const boxOf = (at: Spot): Box => ({ ...at, ...ROOM })
const SEAT_BOX: Box = {
  x: SEAT.x - CONFIG.footprint.width / 2,
  y: SEAT.y - CONFIG.footprint.height / 2,
  ...CONFIG.footprint,
}

/** How far apart two boxes are: the larger of the gaps across and down, 0 or less when they meet. */
const gapBetween = (a: Box, b: Box) =>
  Math.max(
    b.x - (a.x + a.width),
    a.x - (b.x + b.width),
    b.y - (a.y + a.height),
    a.y - (b.y + b.height),
  )

/** Every two of these, and each of them and the seat, at least a step of the grid apart. */
function breathing(spots: readonly Spot[]) {
  const boxes = [...spots.map(boxOf), SEAT_BOX]
  for (const [n, box] of boxes.entries())
    for (const other of boxes.slice(n + 1))
      expect(gapBetween(box, other)).toBeGreaterThanOrEqual(STEP)
}

const distance = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y)

describe('rule 1: sharing only an edge does not press', () => {
  it('a person lines two screenshots up edge to edge, takes one off and puts it back: it comes back flush, where it was', async () => {
    const w = canvasWith()
    await put(w, media('left'), { at: { x: 800, y: 800 } })
    const right = await put(w, media('right'), { at: { x: 800 + ROOM.width, y: 800 } })
    await take(w, [right.id])
    expect((await put(w, media('right'))).at).toEqual({ x: 960, y: 800 })
  })

  it('an agent stacks five sessions in a column, each right under the name of the one above; the person takes the third and puts it back into its slot', async () => {
    const w = canvasWith()
    w.movers.set(AGENT)
    const column = Array.from({ length: 5 }, (_, n) => ({ x: 400, y: 400 + n * ROOM.height }))
    const items = []
    for (const [n, at] of column.entries()) items.push(await put(w, session(`s${n}`), { at }))
    expect(items.map(item => item.at)).toEqual(column)
    w.movers.set({ kind: 'human' })
    await take(w, [items[2]!.id])
    expect((await put(w, session('s2'))).at).toEqual(column[2])
  })
})

describe('found free spots keep a step of the grid from everything else', () => {
  it('an agent asked to put this week’s five sessions on the sheet gives no spot: they spread round the seat with room between them', async () => {
    const w = canvasWith()
    w.movers.set(AGENT)
    const spots = []
    for (let n = 0; n < 5; n += 1) spots.push((await put(w, session(`week-${n}`))).at)
    breathing(spots)
    for (const at of spots) expect(distance(at, SEAT)).toBeLessThan(3 * ROOM.width)
  })

  it('a person drops three files on one spot: they spread a little from it, with room between them', async () => {
    const w = canvasWith()
    const drop = { x: 800, y: 600 }
    const spots = []
    for (const name of ['shot-1', 'shot-2', 'notes.pdf'])
      spots.push((await put(w, media(name), { near: drop })).at)
    expect(spots[0]).toEqual(drop)
    breathing(spots)
    for (const at of spots) expect(distance(at, drop)).toBeLessThan(2 * ROOM.width)
  })
})

describe('rule 2: nearest in a straight line, the upper and then the left of spots as near', () => {
  it('a person opens the finder on top of a screenshot and picks a session: it lands just under the screenshot, the nearest room', async () => {
    const w = canvasWith()
    await put(w, media('shot'), { at: { x: 800, y: 800 } })
    // The first grid line at least a step under the screenshot and its name: 800 + 102 + 8, up to 912.
    expect((await put(w, session('s'), { near: { x: 840, y: 820 } })).at).toEqual({
      x: 840,
      y: 912,
    })
  })

  it('an agent puts a session near a spot exactly between room above and room below: it takes the upper', async () => {
    const w = canvasWith()
    w.movers.set(AGENT)
    await put(w, media('shot'), { at: { x: 800, y: 800 } })
    // 112 above (800 - 102 - 8, down to the grid at 688) and 112 below (800 + 102 + 8, up to 912).
    expect((await put(w, session('s'), { near: { x: 800, y: 800 } })).at).toEqual({
      x: 800,
      y: 688,
    })
  })

  it('the same calls on two canvases leave the same layout, so an agent can tell the person where things went', async () => {
    const layouts = []
    for (let canvas = 0; canvas < 2; canvas += 1) {
      const w = canvasWith()
      w.movers.set(AGENT)
      for (let n = 0; n < 4; n += 1) await put(w, session(`s${n}`))
      layouts.push((await look(w)).items.map(item => item.at))
    }
    expect(layouts[1]).toEqual(layouts[0])
  })
})

describe('rule 3: an item taken out of a pile keeps the spot of the pile', () => {
  async function referencePile() {
    const w = canvasWith()
    const shots = []
    for (const [n, name] of ['ref-1', 'ref-2', 'ref-3'].entries())
      shots.push(await put(w, media(name), { at: { x: n * 400, y: 0 } }))
    await done(
      w.canvas.pile(w.ctx, {
        canvas: 'main',
        pile: 'refs',
        items: shots.map(shot => shot.id),
        at: { x: 1600, y: 800 },
      }),
    )
    return { w, shots }
  }

  it('a person takes a screenshot off from the pile “参考图” and puts it back the next day: it lands beside the pile, where it was last seen, not where it was before it was piled', async () => {
    const { w, shots } = await referencePile()
    await take(w, [shots[0]!.id])
    const back = await put(w, media('ref-1'))
    expect(back.pile).toBeNull()
    expect(gapBetween(boxOf(back.at), boxOf({ x: 1600, y: 800 }))).toBeGreaterThanOrEqual(STEP)
    expect(distance(back.at, { x: 1600, y: 800 })).toBeLessThan(2 * ROOM.width)
  })

  it('an agent takes the last item off a pile, so the pile is gone, then puts it back: it is where the pile was', async () => {
    const w = canvasWith()
    w.movers.set(AGENT)
    const only = await put(w, session('s'), { at: { x: 24, y: 24 } })
    await done(
      w.canvas.pile(w.ctx, {
        canvas: 'main',
        pile: 'p',
        items: [only.id],
        at: { x: 2000, y: 400 },
      }),
    )
    await take(w, [only.id])
    expect((await look(w)).piles).toEqual([])
    expect((await put(w, session('s'))).at).toEqual({ x: 2000, y: 400 })
  })
})

describe('rule 4: a scattered pile leaves its top page where the pile was', () => {
  async function pileOfFour() {
    const w = canvasWith()
    const items = []
    for (let n = 0; n < 4; n += 1)
      items.push(await put(w, media(`page-${n}`), { at: { x: n * 400, y: 0 } }))
    await done(
      w.canvas.pile(w.ctx, {
        canvas: 'main',
        pile: 'p',
        items: items.map(item => item.id),
        at: { x: 1600, y: 800 },
      }),
    )
    return { w, items, pile: { x: 1600, y: 800 } }
  }

  it('a person scatters a pile to go on reading its top page: the top page stays where the pile was, the others spread from it, top down', async () => {
    const { w, items, pile } = await pileOfFour()
    await done(w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p' }))
    const topDown = await Promise.all([...items].reverse().map(item => spotOf(w, item.id)))
    expect(topDown[0]).toEqual(pile)
    const away = topDown.map(at => distance(at, pile))
    for (let n = 1; n < away.length - 1; n += 1) expect(away[n]).toBeLessThanOrEqual(away[n + 1]!)
    breathing(topDown.slice(1))
  })

  it('an agent scatters a pile someone left a screenshot lying over: the top page cannot stay, so it takes the nearest room, before the pages under it', async () => {
    const { w, items, pile } = await pileOfFour()
    await put(w, media('over'), { at: { x: 1640, y: 840 } })
    w.movers.set(AGENT)
    await done(w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p' }))
    const topDown = await Promise.all([...items].reverse().map(item => spotOf(w, item.id)))
    expect(topDown[0]).not.toEqual(pile)
    const away = topDown.map(at => distance(at, pile))
    for (let n = 0; n < away.length - 1; n += 1) expect(away[n]).toBeLessThanOrEqual(away[n + 1]!)
  })
})

describe('rule 5: after the limit of taken items is lowered, the next real take drops to it at once', () => {
  async function sixTaken() {
    const w = canvasWith()
    const items = []
    for (let n = 0; n < 7; n += 1)
      items.push(await put(w, media(`old-${n}`), { at: { x: n * 400, y: 0 } }))
    for (const item of items.slice(0, 6)) await take(w, [item.id])
    return { store: w.store, last: items[6]! }
  }

  it('a person takes one more off after the deployment lowered the limit to 3: the list is the newest three, the one just taken first', async () => {
    const { store, last } = await sixTaken()
    const w = canvasWith(store, 3)
    expect(await awayRefs(w)).toHaveLength(6)
    await take(w, [last.id])
    expect(await awayRefs(w)).toEqual(['old-6', 'old-5', 'old-4'])
  })

  it('an agent puts one back and asks to take one that is already off: neither drops anything; only a real take does', async () => {
    const { store, last } = await sixTaken()
    const w = canvasWith(store, 3)
    w.movers.set(AGENT)
    await put(w, media('old-0'))
    expect(await awayRefs(w)).toEqual(['old-5', 'old-4', 'old-3', 'old-2', 'old-1'])
    const off = (await awayItems(w))[0]!
    expect(await w.canvas.take(w.ctx, { canvas: 'main', items: [off.id] })).toEqual({
      kind: 'no-change',
    })
    expect(await awayRefs(w)).toHaveLength(5)
    await take(w, [last.id])
    expect(await awayRefs(w)).toEqual(['old-6', 'old-5', 'old-4'])
  })
})
