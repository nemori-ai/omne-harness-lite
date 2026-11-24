import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { context } from '@omne-harness/canvas/testing'
import { kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>
const T1 = context('tenant-1')
const T2 = context('tenant-2')

/** Tenant 1 has one item and the pile p1; tenant 2, when `busy`, has four items and the piles p1 and p7. */
async function seeded(busy: boolean) {
  const w = world()
  w.kinds.declare(kind('media.object'))
  await w.canvas.place(T1, { canvas: 'main', reference: media('a'), at: { x: 0, y: 0 } })
  await w.canvas.pile(T1, { canvas: 'main', pile: 'p1', items: ['i1'] })
  if (busy) {
    for (const ref of ['a', 'b', 'c', 'd'])
      await w.canvas.place(T2, { canvas: 'main', reference: media(ref) })
    await w.canvas.pile(T2, { canvas: 'main', pile: 'p7', items: ['i3', 'i4'] })
  }
  return w
}

/** Every write tenant 1 makes with identities that are tenant 2's when it is busy, and nobody's otherwise. */
const FOREIGN: readonly (readonly [string, (w: World) => Promise<unknown>])[] = [
  [
    'arrange an item',
    w => w.canvas.arrange(T1, { canvas: 'main', items: [{ item: 'i4', top: true }] }),
  ],
  [
    'arrange a pile',
    w => w.canvas.arrange(T1, { canvas: 'main', piles: [{ pile: 'p7', name: 'x' }] }),
  ],
  [
    'arrange into a pile',
    w => w.canvas.arrange(T1, { canvas: 'main', items: [{ item: 'i1', pile: 'p7' }] }),
  ],
  ['take', w => w.canvas.take(T1, { canvas: 'main', items: ['i3'] })],
  ['pile an item', w => w.canvas.pile(T1, { canvas: 'main', pile: 'p1', items: ['i4'] })],
  ['pile into a pile', w => w.canvas.pile(T1, { canvas: 'main', pile: 'p7', items: ['i1'] })],
  ['scatter', w => w.canvas.scatter(T1, { canvas: 'main', pile: 'p7' })],
  ['lock', w => w.canvas.lock(T1, { canvas: 'main', items: ['i2'], locked: true })],
  ['unlock', w => w.canvas.lock(T1, { canvas: 'main', items: ['i2'], locked: false })],
]

describe('one tenant’s canvas is not another’s', () => {
  it('each reads its own, the other’s things nowhere', async () => {
    const w = await seeded(true)
    const look = async (ctx: typeof T1) =>
      JSON.stringify(await w.canvas.look(ctx, { canvas: 'main' }))
    const mine = await look(T1)
    expect(
      JSON.parse(mine).value.items.map(
        (item: { reference: { ref: string } }) => item.reference.ref,
      ),
    ).toEqual(['a'])
    expect(JSON.parse(await look(T2)).value.items).toHaveLength(4)
    const fresh = await seeded(false)
    expect(JSON.stringify(await fresh.canvas.look(T1, { canvas: 'main' }))).toBe(mine)
  })

  it.each(FOREIGN)(
    '%s with the other tenant’s identity answers byte for byte as one that never was',
    async (_name, call) => {
      const busy = await seeded(true)
      const fresh = await seeded(false)
      const answer = JSON.stringify(await call(busy))
      expect(answer).toBe(JSON.stringify(await call(fresh)))
      expect(JSON.stringify(await busy.canvas.look(T1, { canvas: 'main' }))).toBe(
        JSON.stringify(await fresh.canvas.look(T1, { canvas: 'main' })),
      )
      expect(
        (await busy.canvas.look(T2, { canvas: 'main' })) as { value: { revision: number } },
      ).toMatchObject({ value: { revision: 5 } })
    },
  )
})

describe('a locked item is the same to a person and to an agent', () => {
  const ATTEMPTS: readonly (readonly [string, (w: World) => Promise<unknown>])[] = [
    ['place it again', w => w.canvas.place(w.ctx, { canvas: 'main', reference: media('a') })],
    [
      'move it',
      w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', at: { x: 8, y: 8 } }] }),
    ],
    [
      'size it',
      w =>
        w.canvas.arrange(w.ctx, {
          canvas: 'main',
          items: [{ item: 'i1', size: { width: 200, height: 100 } }],
        }),
    ],
    [
      'raise it',
      w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', top: true }] }),
    ],
    [
      'put it in a pile by arrange',
      w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', pile: 'p1' }] }),
    ],
    [
      'take it out of a pile',
      w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', pile: null }] }),
    ],
    ['take it', w => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })],
    ['pile it', w => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i1'] })],
    ['lock it', w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: true })],
    ['unlock it', w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: false })],
  ]

  async function lockedBy(mover: 'human' | 'agent') {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('a'), at: { x: 0, y: 0 } })
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('b'), at: { x: 800, y: 0 } })
    await w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i2'] })
    await w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: true })
    w.movers.set(mover === 'human' ? { kind: 'human' } : { kind: 'agent', session: 's-1' })
    return w
  }

  it.each(ATTEMPTS)('%s answers the same bytes whoever calls', async (_name, call) => {
    const answers = []
    for (const mover of ['human', 'agent'] as const)
      answers.push(JSON.stringify(await call(await lockedBy(mover))))
    expect(answers[1]).toBe(answers[0])
  })

  it('the source of the domain does not tell a person from an agent', () => {
    const src = join(import.meta.dirname, '..', 'src')
    const product = readdirSync(src).filter(name => name.endsWith('.ts'))
    for (const name of product)
      expect(readFileSync(join(src, name), 'utf8')).not.toMatch(/'agent'|'human'|\.by\.kind/u)
  })
})
