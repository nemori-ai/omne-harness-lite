import { describe, expect, it } from 'vitest'
import { kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

async function placed(...spots: readonly { x: number; y: number }[]) {
  const w = world()
  w.kinds.declare(kind('media.object'))
  for (const [n, at] of spots.entries())
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media(`r${n}`), at })
  return w
}

async function look(w: World) {
  const read = await w.canvas.look(w.ctx, { canvas: 'main' })
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value
}

const spotOf = async (w: World, id: string) =>
  (await look(w)).items.find(item => item.id === id)?.at

describe('an item taken out of a pile', () => {
  it('keeps the spot of the pile, where it was drawn, and comes back there', async () => {
    const w = await placed({ x: 16, y: 16 })
    await w.canvas.pile(w.ctx, {
      canvas: 'main',
      pile: 'p1',
      items: ['i1'],
      at: { x: 800, y: 800 },
    })
    await w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })
    const off = await w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 10 })
    expect(off).toMatchObject({
      kind: 'done',
      value: { items: [{ id: 'i1', at: { x: 800, y: 800 } }] },
    })
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('r0') })
    expect(await spotOf(w, 'i1')).toEqual({ x: 800, y: 800 })
  })
})

describe('a scattered pile', () => {
  it('gives the nearest free spot to its items in their stacking order, the lowest first', async () => {
    const w = await placed({ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 800, y: 0 })
    await w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', top: true }] })
    await w.canvas.pile(w.ctx, {
      canvas: 'main',
      pile: 'p1',
      items: ['i1', 'i2', 'i3'],
      at: { x: 1600, y: 800 },
    })
    expect(await w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p1' })).toMatchObject({
      kind: 'done',
    })
    const spots = await Promise.all(['i2', 'i3', 'i1'].map(id => spotOf(w, id)))
    const away = spots.map(spot => Math.hypot(spot!.x - 1600, spot!.y - 800))
    expect(spots[0]).toEqual({ x: 1600, y: 800 })
    expect(away[1]).toBeLessThanOrEqual(away[2]!)
    expect(away[0]).toBeLessThan(away[1]!)
  })
})
