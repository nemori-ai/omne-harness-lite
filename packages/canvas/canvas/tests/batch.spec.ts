import { describe, expect, it } from 'vitest'
import { kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

/** i1 and i2 loose, i3 locked, i4 alone in the pile p1. */
async function seeded() {
  const w = world()
  w.kinds.declare(kind('media.object'))
  for (const [ref, x] of [
    ['a', 0],
    ['b', 400],
    ['c', 800],
    ['d', 1200],
  ] as const)
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media(ref), at: { x, y: 0 } })
  await w.canvas.lock(w.ctx, { canvas: 'main', items: ['i3'], locked: true })
  await w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i4'] })
  return w
}

async function state(w: World) {
  const on = await w.canvas.look(w.ctx, { canvas: 'main' })
  const off = await w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 100 })
  return { on, off }
}

describe('a batch is one commit, or none', () => {
  it('does nothing of a batch with an entry not found, and names it', async () => {
    const w = await seeded()
    const before = await state(w)
    const answer = await w.canvas.arrange(w.ctx, {
      canvas: 'main',
      items: [
        { item: 'i1', at: { x: 8, y: 8 } },
        { item: 'i9', top: true },
        { item: 'i2', top: true },
      ],
    })
    expect(answer).toEqual({ kind: 'not-found', entry: { item: 'i9' } })
    expect(await state(w)).toEqual(before)
  })

  it.each([
    ['take', (w: World) => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1', 'i3'] })],
    [
      'pile',
      (w: World) => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p2', items: ['i1', 'i3'] }),
    ],
    [
      'lock',
      (w: World) => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1', 'i4'], locked: true }),
    ],
    [
      'arrange',
      (w: World) =>
        w.canvas.arrange(w.ctx, {
          canvas: 'main',
          items: [
            { item: 'i2', top: true },
            { item: 'i3', top: true },
          ],
        }),
    ],
  ])(
    'does nothing of a %s batch with an entry the state does not allow, and names it',
    async (_name, call) => {
      const w = await seeded()
      const before = await state(w)
      const answer = await call(w)
      expect(answer).toMatchObject({
        kind: 'conflict',
        entry: { item: expect.stringMatching(/^i[34]$/) },
      })
      expect(await state(w)).toEqual(before)
    },
  )

  it('answers no change for a batch none of whose entries changes anything, without a commit', async () => {
    const w = await seeded()
    const before = await state(w)
    const answer = await w.canvas.arrange(w.ctx, {
      canvas: 'main',
      items: [
        { item: 'i1', at: { x: 0, y: 0 } },
        { item: 'i2', pile: null },
        { item: 'i4', pile: 'p1' },
      ],
    })
    expect(answer).toEqual({ kind: 'no-change' })
    expect(await state(w)).toEqual(before)
  })

  it('stamps only the entries that changed with who did it and when', async () => {
    const w = await seeded()
    w.movers.set({ kind: 'agent', session: 's-1' })
    w.clock.set('2026-11-24T07:00:00.000Z')
    await w.canvas.arrange(w.ctx, {
      canvas: 'main',
      items: [
        { item: 'i1', at: { x: 0, y: 0 } },
        { item: 'i2', at: { x: 400, y: 400 } },
      ],
    })
    const read = await w.canvas.look(w.ctx, { canvas: 'main' })
    if (read.kind !== 'done') throw new Error(read.kind)
    const by = (id: string) => read.value.items.find(item => item.id === id)
    expect(by('i1')).toMatchObject({ by: { kind: 'human' }, when: '2026-11-24T06:00:00.000Z' })
    expect(by('i2')).toMatchObject({
      by: { kind: 'agent', session: 's-1' },
      when: '2026-11-24T07:00:00.000Z',
    })
  })
})

describe('a write sent again once it is done changes nothing', () => {
  const AGAIN: readonly (readonly [string, (w: World) => Promise<unknown>])[] = [
    ['place', w => w.canvas.place(w.ctx, { canvas: 'main', reference: media('e') })],
    [
      'arrange',
      w =>
        w.canvas.arrange(w.ctx, {
          canvas: 'main',
          items: [
            { item: 'i1', at: { x: 64, y: 64 }, top: true, size: { width: 200, height: 100 } },
            { item: 'i4', pile: null },
          ],
          piles: [],
        }),
    ],
    ['take', w => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1', 'i4'] })],
    ['pile', w => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p2', items: ['i1', 'i2', 'i4'] })],
    ['scatter', w => w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p1' })],
    ['lock', w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1', 'i2'], locked: true })],
    ['unlock', w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i3'], locked: false })],
    ['look-away', w => w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 10 })],
  ]

  it.each(AGAIN)('%s', async (name, call) => {
    const w = await seeded()
    const first = (await call(w)) as { kind: string }
    expect(first.kind).toBe('done')
    const after = await state(w)
    const again = (await call(w)) as { kind: string; item?: unknown }
    if (name === 'look-away') expect(again).toEqual(first)
    else expect(again.kind).toBe('no-change')
    if (name === 'place')
      expect(again.item).toEqual((first as unknown as { value: { item: unknown } }).value.item)
    expect(await state(w)).toEqual(after)
  })
})
