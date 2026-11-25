import { describe, expect, it } from 'vitest'
import { tenantOf } from '@omne-harness/canvas/testing'
import type { Item, Pile } from '@omne-harness/canvas-contract'
import { kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

const AT = '2026-11-24T06:00:00.000Z'

async function look(w: World) {
  const read = await w.canvas.look(w.ctx, { canvas: 'main' })
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value
}

const itemOf = async (w: World, id: string) => (await look(w)).items.find(item => item.id === id)

async function placed(...spots: readonly { x: number; y: number }[]) {
  const w = world()
  w.kinds.declare(kind('media.object'))
  for (const [n, at] of spots.entries())
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media(`r${n}`), at })
  return w
}

describe('a change answers the revision it made', () => {
  it('arrange', async () => {
    const w = await placed({ x: 0, y: 0 })
    const { revision } = await look(w)
    expect(
      await w.canvas.arrange(w.ctx, {
        canvas: 'main',
        items: [{ item: 'i1', at: { x: 80, y: 0 } }],
      }),
    ).toEqual({ kind: 'done', value: { revision: revision + 1 } })
  })
})

describe('a change to the values a record has is no change', () => {
  it('whatever order the stored record keeps its fields in', async () => {
    const w = world()
    const item = {
      when: AT,
      by: { kind: 'human' },
      locked: false,
      pile: null,
      rank: 1,
      size: { height: 100, width: 200 },
      at: { y: 16, x: 8 },
      state: 'on',
      reference: { ref: 'a', kind: 'media.object' },
      id: 'i1',
    } as unknown as Item
    w.store.seed(tenantOf('tenant-1'), 'main', { revision: 4, items: [item], piles: [] })
    expect(
      await w.canvas.arrange(w.ctx, {
        canvas: 'main',
        items: [{ item: 'i1', at: { x: 8, y: 16 }, size: { width: 200, height: 100 } }],
      }),
    ).toEqual({ kind: 'no-change' })
    expect((await look(w)).revision).toBe(4)
  })

  it('a pile moved to where it is and named what it is called, by someone else later', async () => {
    const w = await placed({ x: 0, y: 0 })
    await w.canvas.pile(w.ctx, {
      canvas: 'main',
      pile: 'p1',
      items: ['i1'],
      at: { x: 400, y: 400 },
    })
    await w.canvas.arrange(w.ctx, { canvas: 'main', piles: [{ pile: 'p1', name: 'notes' }] })
    const before = await look(w)
    w.movers.set({ kind: 'agent', session: 's-1' })
    w.clock.set('2026-11-24T07:00:00.000Z')
    expect(
      await w.canvas.arrange(w.ctx, {
        canvas: 'main',
        piles: [{ pile: 'p1', at: { x: 400, y: 400 }, name: 'notes' }],
      }),
    ).toEqual({ kind: 'no-change' })
    expect(await look(w)).toEqual(before)
  })

  it('a loose item asked to leave a pile stays where it is, though it lies off the grid on another', async () => {
    const w = await placed({ x: 0, y: 0 }, { x: 3, y: 5 })
    const before = await look(w)
    expect(
      await w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i2', pile: null }] }),
    ).toEqual({ kind: 'no-change' })
    expect(await look(w)).toEqual(before)
  })
})

describe('a pile keeps what a change does not name', () => {
  async function piled() {
    const w = await placed({ x: 0, y: 0 })
    await w.canvas.pile(w.ctx, {
      canvas: 'main',
      pile: 'p1',
      items: ['i1'],
      at: { x: 400, y: 400 },
    })
    await w.canvas.arrange(w.ctx, { canvas: 'main', piles: [{ pile: 'p1', name: 'notes' }] })
    return w
  }
  const pileOf = async (w: World): Promise<Pile> => (await look(w)).piles[0]!

  it('its spot when it is renamed', async () => {
    const w = await piled()
    await w.canvas.arrange(w.ctx, { canvas: 'main', piles: [{ pile: 'p1', name: 'later' }] })
    expect(await pileOf(w)).toMatchObject({ at: { x: 400, y: 400 }, name: 'later' })
  })

  it('its name when it is moved', async () => {
    const w = await piled()
    await w.canvas.arrange(w.ctx, { canvas: 'main', piles: [{ pile: 'p1', at: { x: 800, y: 8 } }] })
    expect(await pileOf(w)).toMatchObject({ at: { x: 800, y: 8 }, name: 'notes' })
  })
})

describe('the size of a placed item', () => {
  const size = { width: 200, height: 120 }

  it('is the size given', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    const done = await w.canvas.place(w.ctx, { canvas: 'main', reference: media('a'), size })
    expect(done).toMatchObject({ kind: 'done', value: { item: { size } } })
    expect(await itemOf(w, 'i1')).toMatchObject({ size })
  })

  it('is kept when a taken item is put back without one', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('a'), size })
    await w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('a') })
    expect(await itemOf(w, 'i1')).toMatchObject({ size, state: 'on' })
  })

  it('is none when none was ever given', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('a') })
    expect(await itemOf(w, 'i1')).toMatchObject({ size: null })
  })
})
