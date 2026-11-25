import { describe, expect, it } from 'vitest'
import type { ChangeAnswer, Item, ItemStatus, PlaceAnswer } from '@omne-harness/canvas-contract'
import { kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

const P = 'p1'
const Q = 'p2'

async function look(w: World) {
  const read = await w.canvas.look(w.ctx, { canvas: 'main' })
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value
}

async function placed(w: World, ref: string, x: number): Promise<Item> {
  const answer = await w.canvas.place(w.ctx, {
    canvas: 'main',
    reference: media(ref),
    at: { x, y: 800 },
  })
  if (answer.kind !== 'done') throw new Error(`place ${ref}: ${JSON.stringify(answer)}`)
  return answer.value.item
}

const done = (answer: ChangeAnswer) => expect(answer).toMatchObject({ kind: 'done' })

/**
 * A canvas with the item `target` in one state, the item `other` loose beside it, and the pile `p2`
 * holding the item `third`. In `piled` the target is alone in `p1`.
 */
async function given(status: ItemStatus) {
  const w = world()
  w.kinds.declare(kind('media.object'))
  const other = await placed(w, 'other', 2000)
  const third = await placed(w, 'third', 3000)
  done(await w.canvas.pile(w.ctx, { canvas: 'main', pile: Q, items: [third.id] }))
  let target = status === 'none' ? null : await placed(w, 'target', 400)
  const id = target?.id ?? 'nowhere'
  if (status === 'piled') done(await w.canvas.pile(w.ctx, { canvas: 'main', pile: P, items: [id] }))
  if (status === 'away') done(await w.canvas.take(w.ctx, { canvas: 'main', items: [id] }))
  if (status === 'locked')
    done(await w.canvas.lock(w.ctx, { canvas: 'main', items: [id], locked: true }))
  const before = await look(w)
  target = before.items.find(item => item.id === id) ?? target
  return { w, id, other, third, before, target }
}

const itemIn = async (w: World, id: string) => (await look(w)).items.find(item => item.id === id)
const pileIds = async (w: World) => (await look(w)).piles.map(pile => pile.id)
const req = (fields: object) => ({ canvas: 'main', ...fields })

const NOT_FOUND = (id: string) => ({ kind: 'not-found', entry: { item: id } })
const CONFLICT = (reason: string, id: string) => ({ kind: 'conflict', reason, entry: { item: id } })
const NO_CHANGE = { kind: 'no-change' }

/** After an answer that changes nothing, the canvas reads as it did. */
async function unchanged(w: World, before: Awaited<ReturnType<typeof look>>) {
  expect(await look(w)).toEqual(before)
}

describe('place × the state of the reference', () => {
  const placeTarget = (w: World): Promise<PlaceAnswer> =>
    w.canvas.place(w.ctx, req({ reference: media('target') }))

  it('place × none: checks the kind and the limit, admits, makes the record on top', async () => {
    const { w } = await given('none')
    const answer = await placeTarget(w)
    expect(answer).toMatchObject({ kind: 'done', value: { item: { state: 'on', rank: 3 } } })
    expect((await look(w)).items.at(-1)?.reference).toEqual(media('target'))
  })

  it.each(['loose', 'piled', 'locked'] as const)(
    'place × %s: no change, the item given back where it is',
    async status => {
      const { w, before, target } = await given(status)
      expect(await placeTarget(w)).toEqual({ kind: 'no-change', item: target })
      await unchanged(w, before)
    },
  )

  it('place × away: back on, on top, where it was taken from', async () => {
    const { w, id } = await given('away')
    const answer = await placeTarget(w)
    expect(answer).toMatchObject({ kind: 'done', value: { item: { id, state: 'on' } } })
    expect(await itemIn(w, id)).toMatchObject({ at: { x: 400, y: 800 }, rank: 5, pile: null })
  })
})

describe('arrange × the state of the item', () => {
  const arrange = (w: World, change: object) => w.canvas.arrange(w.ctx, req({ items: [change] }))
  const move = (id: string) => ({ item: id, at: { x: 1000, y: 1000 } })
  const adjust = (id: string) => ({ item: id, size: { width: 200, height: 100 }, top: true })
  const enter = (id: string, pile = Q) => ({ item: id, pile })
  const leave = (id: string) => ({ item: id, pile: null })

  it.each([
    ['move', move],
    ['adjust', adjust],
    ['enter', enter],
    ['leave', leave],
  ] as const)('arrange %s × none: not found', async (_name, change) => {
    const { w, before } = await given('none')
    expect(await arrange(w, change('nowhere'))).toEqual(NOT_FOUND('nowhere'))
    await unchanged(w, before)
  })

  it.each([
    ['move', move],
    ['adjust', adjust],
    ['enter', enter],
    ['leave', leave],
  ] as const)('arrange %s × away: conflict, taken', async (_name, change) => {
    const { w, id, before } = await given('away')
    expect(await arrange(w, change(id))).toEqual(CONFLICT('taken', id))
    await unchanged(w, before)
  })

  it.each([
    ['move', move],
    ['adjust', adjust],
    ['enter', enter],
    ['leave', leave],
    ['move to where it is', (id: string) => ({ item: id, at: { x: 400, y: 800 } })],
  ] as const)('arrange %s × locked: conflict, locked', async (_name, change) => {
    const { w, id, before } = await given('locked')
    expect(await arrange(w, change(id))).toEqual(CONFLICT('locked', id))
    await unchanged(w, before)
  })

  it('arrange move × loose: moved; the same spot again is no change', async () => {
    const { w, id } = await given('loose')
    done(await arrange(w, move(id)))
    expect(await itemIn(w, id)).toMatchObject({ at: { x: 1000, y: 1000 } })
    const after = await look(w)
    expect(await arrange(w, move(id))).toEqual(NO_CHANGE)
    await unchanged(w, after)
  })

  it('arrange move × piled: conflict, in a pile, when it does not say it leaves', async () => {
    const { w, id, before } = await given('piled')
    expect(await arrange(w, move(id))).toEqual(CONFLICT('in-pile', id))
    await unchanged(w, before)
  })

  it('arrange adjust × loose: sized and raised; the same values again are no change', async () => {
    const { w, id, other } = await given('loose')
    done(await arrange(w, adjust(other.id)))
    expect(await itemIn(w, other.id)).toMatchObject({ size: { width: 200, height: 100 }, rank: 4 })
    expect(await arrange(w, adjust(other.id))).toEqual(NO_CHANGE)
    expect((await look(w)).items.map(item => item.id)).toEqual(['i2', id, other.id])
  })

  it('arrange adjust × piled: sized and raised, still in its pile', async () => {
    const { w, id } = await given('piled')
    done(await arrange(w, adjust(id)))
    expect(await itemIn(w, id)).toMatchObject({ size: { width: 200, height: 100 }, pile: P })
  })

  it('arrange enter × loose: goes into the pile', async () => {
    const { w, id } = await given('loose')
    done(await arrange(w, enter(id)))
    expect(await itemIn(w, id)).toMatchObject({ pile: Q })
  })

  it('arrange enter × piled: into the pile it is in is no change; into another moves it and the empty one is gone', async () => {
    const { w, id, before } = await given('piled')
    expect(await arrange(w, enter(id, P))).toEqual(NO_CHANGE)
    await unchanged(w, before)
    done(await arrange(w, enter(id, Q)))
    expect(await itemIn(w, id)).toMatchObject({ pile: Q })
    expect(await pileIds(w)).toEqual([Q])
  })

  it('arrange leave × loose: no change', async () => {
    const { w, id, before } = await given('loose')
    expect(await arrange(w, leave(id))).toEqual(NO_CHANGE)
    await unchanged(w, before)
  })

  it('arrange leave × piled: out beside the pile, which is gone once empty', async () => {
    const { w, id } = await given('piled')
    done(await arrange(w, leave(id)))
    const item = await itemIn(w, id)
    expect(item).toMatchObject({ pile: null })
    expect(item?.at).not.toEqual({ x: 400, y: 800 })
    expect(Math.abs(item!.at.x - 400) + Math.abs(item!.at.y - 800)).toBeLessThan(400)
    expect(await pileIds(w)).toEqual([Q])
  })

  it('arrange leave × piled with a spot: out at that spot', async () => {
    const { w, id } = await given('piled')
    done(await arrange(w, { item: id, pile: null, at: { x: 8, y: 8 } }))
    expect(await itemIn(w, id)).toMatchObject({ pile: null, at: { x: 8, y: 8 } })
  })
})

describe('take × the state of the item', () => {
  const take = (w: World, id: string) => w.canvas.take(w.ctx, req({ items: [id] }))

  it('take × none: not found', async () => {
    const { w, before } = await given('none')
    expect(await take(w, 'nowhere')).toEqual(NOT_FOUND('nowhere'))
    await unchanged(w, before)
  })

  it('take × loose: off the sheet, the record kept', async () => {
    const { w, id } = await given('loose')
    done(await take(w, id))
    expect(await itemIn(w, id)).toBeUndefined()
    const away = await w.canvas.lookAway(w.ctx, req({ limit: 10 }))
    expect(away).toMatchObject({ value: { items: [{ id, state: 'off', at: { x: 400, y: 800 } }] } })
  })

  it('take × piled: off the sheet, out of the pile, which is gone once empty', async () => {
    const { w, id } = await given('piled')
    done(await take(w, id))
    const away = await w.canvas.lookAway(w.ctx, req({ limit: 10 }))
    expect(away).toMatchObject({
      value: { items: [{ id, state: 'off', pile: null, locked: false }] },
    })
    expect(await pileIds(w)).toEqual([Q])
  })

  it('take × away: no change', async () => {
    const { w, id, before } = await given('away')
    expect(await take(w, id)).toEqual(NO_CHANGE)
    await unchanged(w, before)
  })

  it('take × locked: conflict, locked', async () => {
    const { w, id, before } = await given('locked')
    expect(await take(w, id)).toEqual(CONFLICT('locked', id))
    await unchanged(w, before)
  })
})

describe('pile × the state of the item', () => {
  const pile = (w: World, id: string, into = Q) =>
    w.canvas.pile(w.ctx, req({ pile: into, items: [id] }))

  it('pile × none: not found', async () => {
    const { w, before } = await given('none')
    expect(await pile(w, 'nowhere')).toEqual(NOT_FOUND('nowhere'))
    await unchanged(w, before)
  })

  it('pile × loose: into the pile', async () => {
    const { w, id } = await given('loose')
    done(await pile(w, id))
    expect(await itemIn(w, id)).toMatchObject({ pile: Q })
  })

  it('pile × piled: into its own pile is no change; into another moves it over', async () => {
    const { w, id, before } = await given('piled')
    expect(await pile(w, id, P)).toEqual(NO_CHANGE)
    await unchanged(w, before)
    done(await pile(w, id, Q))
    expect(await itemIn(w, id)).toMatchObject({ pile: Q })
    expect(await pileIds(w)).toEqual([Q])
  })

  it.each([
    ['away', 'taken'],
    ['locked', 'locked'],
  ] as const)('pile × %s: conflict, %s', async (status, reason) => {
    const { w, id, before } = await given(status)
    expect(await pile(w, id)).toEqual(CONFLICT(reason, id))
    await unchanged(w, before)
  })
})

describe('lock × the state of the item', () => {
  const lock = (w: World, id: string, locked: boolean) =>
    w.canvas.lock(w.ctx, req({ items: [id], locked }))

  it.each([true, false])('lock %s × none: not found', async locked => {
    const { w } = await given('none')
    expect(await lock(w, 'nowhere', locked)).toEqual(NOT_FOUND('nowhere'))
  })

  it('lock on × loose: locked', async () => {
    const { w, id } = await given('loose')
    done(await lock(w, id, true))
    expect(await itemIn(w, id)).toMatchObject({ locked: true })
  })

  it.each([
    ['piled', 'in-pile'],
    ['away', 'taken'],
  ] as const)('lock on × %s: conflict, %s', async (status, reason) => {
    const { w, id, before } = await given(status)
    expect(await lock(w, id, true)).toEqual(CONFLICT(reason, id))
    await unchanged(w, before)
  })

  it('lock on × locked: no change', async () => {
    const { w, id, before } = await given('locked')
    expect(await lock(w, id, true)).toEqual(NO_CHANGE)
    await unchanged(w, before)
  })

  it.each(['loose', 'piled', 'away'] as const)('lock off × %s: no change', async status => {
    const { w, id, before } = await given(status)
    expect(await lock(w, id, false)).toEqual(NO_CHANGE)
    await unchanged(w, before)
  })

  it('lock off × locked: unlocked', async () => {
    const { w, id } = await given('locked')
    done(await lock(w, id, false))
    expect(await itemIn(w, id)).toMatchObject({ locked: false })
  })
})

describe('a pile × whether it is there', () => {
  it('arrange move and rename × there: changed; the same values again are no change', async () => {
    const { w } = await given('loose')
    const change = { pile: Q, at: { x: 16, y: 16 }, name: '下周' }
    done(await w.canvas.arrange(w.ctx, req({ piles: [change] })))
    expect((await look(w)).piles).toMatchObject([{ id: Q, at: { x: 16, y: 16 }, name: '下周' }])
    expect(await w.canvas.arrange(w.ctx, req({ piles: [change] }))).toEqual(NO_CHANGE)
  })

  it('arrange move and rename × not there: not found', async () => {
    const { w, before } = await given('loose')
    const answer = await w.canvas.arrange(w.ctx, req({ piles: [{ pile: 'gone', name: 'x' }] }))
    expect(answer).toEqual({ kind: 'not-found', entry: { pile: 'gone' } })
    await unchanged(w, before)
  })

  it('arrange an item into it × there: in; × not there: not found', async () => {
    const { w, id, before } = await given('loose')
    const into = (pile: string) => w.canvas.arrange(w.ctx, req({ items: [{ item: id, pile }] }))
    expect(await into('gone')).toEqual({ kind: 'not-found', entry: { pile: 'gone' } })
    await unchanged(w, before)
    done(await into(Q))
  })

  it('pile × there: piled into it; × not there: made with the identity given, at the first item', async () => {
    const { w, id, other } = await given('loose')
    done(await w.canvas.pile(w.ctx, req({ pile: 'new', items: [other.id, id] })))
    expect((await look(w)).piles).toMatchObject([{ id: 'new', at: other.at }, { id: Q }])
    done(await w.canvas.pile(w.ctx, req({ pile: Q, items: [id], at: { x: 0, y: 0 } })))
    expect((await look(w)).piles).toMatchObject([{ id: 'new' }, { id: Q, at: { x: 3000, y: 800 } }])
  })

  it('pile × not there with a spot: made at that spot', async () => {
    const { w, id } = await given('loose')
    done(await w.canvas.pile(w.ctx, req({ pile: 'new', items: [id], at: { x: 24, y: 24 } })))
    expect((await look(w)).piles).toMatchObject([{ id: 'new', at: { x: 24, y: 24 } }, { id: Q }])
  })

  it('scatter × there: every item on a free spot beside it, the pile gone', async () => {
    const { w, third } = await given('loose')
    done(await w.canvas.scatter(w.ctx, req({ pile: Q })))
    const after = await look(w)
    expect(after.piles).toEqual([])
    expect(after.items.find(item => item.id === third.id)).toMatchObject({ pile: null })
  })

  it('scatter × not there: no change', async () => {
    const { w, before } = await given('loose')
    expect(await w.canvas.scatter(w.ctx, req({ pile: 'gone' }))).toEqual(NO_CHANGE)
    await unchanged(w, before)
  })
})
