import { describe, expect, it } from 'vitest'
import type { ChangeAnswer, PlaceAnswer } from '@omne-harness/canvas-contract'
import { CONFIG, kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

/** A canvas with the item i1 loose and the item i2 in the pile p1, and the kind media.object declared. */
async function seeded() {
  const w = world()
  w.kinds.declare(kind('media.object'))
  for (const [ref, x] of [
    ['a', 0],
    ['b', 400],
  ] as const)
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media(ref), at: { x, y: 0 } })
  await w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i2'] })
  return w
}

const revision = async (w: World) => {
  const read = await w.canvas.look(w.ctx, { canvas: 'main' })
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value.revision
}

/** One valid request of each write, which changes the seeded canvas. */
const WRITES: readonly (readonly [string, (w: World) => Promise<ChangeAnswer | PlaceAnswer>])[] = [
  ['place', w => w.canvas.place(w.ctx, { canvas: 'main', reference: media('c') })],
  [
    'arrange',
    w =>
      w.canvas.arrange(w.ctx, {
        canvas: 'main',
        items: [{ item: 'i1', top: true, size: { width: 200, height: 200 } }],
      }),
  ],
  ['take', w => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })],
  ['pile', w => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i1'] })],
  ['scatter', w => w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p1' })],
  ['lock', w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: true })],
]

/** Requests that do not fit, each with where the answer says it does not. */
const INVALID: readonly (readonly [string, (w: World) => Promise<unknown>, string, unknown[]])[] = [
  [
    'place on another canvas',
    w => w.canvas.place(w.ctx, { canvas: 'other', reference: media('c') }),
    'canvas',
    ['canvas'],
  ],
  [
    'place without a reference',
    w => w.canvas.place(w.ctx, { canvas: 'main' }),
    'request',
    ['reference'],
  ],
  [
    'place off the sheet',
    w =>
      w.canvas.place(w.ctx, {
        canvas: 'main',
        reference: media('c'),
        at: { x: CONFIG.sheet.width, y: 0 },
      }),
    'spot',
    ['at'],
  ],
  [
    'place near a spot off the sheet',
    w =>
      w.canvas.place(w.ctx, {
        canvas: 'main',
        reference: media('c'),
        near: { x: 0, y: CONFIG.sheet.height },
      }),
    'spot',
    ['near'],
  ],
  [
    'place below the least size',
    w =>
      w.canvas.place(w.ctx, {
        canvas: 'main',
        reference: media('c'),
        size: { width: 119, height: 64 },
      }),
    'size',
    ['size'],
  ],
  [
    'arrange above the most size',
    w =>
      w.canvas.arrange(w.ctx, {
        canvas: 'main',
        items: [{ item: 'i1', size: { width: 901, height: 100 } }],
      }),
    'size',
    ['items', 0, 'size'],
  ],
  [
    'arrange a pile off the sheet',
    w =>
      w.canvas.arrange(w.ctx, { canvas: 'main', piles: [{ pile: 'p1', at: { x: 0, y: 99999 } }] }),
    'spot',
    ['piles', 0, 'at'],
  ],
  ['arrange nothing', w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [] }), 'request', []],
  [
    'arrange an entry that changes nothing',
    w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1' }] }),
    'request',
    ['items', 0],
  ],
  [
    'arrange a spot into a pile',
    w =>
      w.canvas.arrange(w.ctx, {
        canvas: 'main',
        items: [{ item: 'i1', pile: 'p1', at: { x: 0, y: 0 } }],
      }),
    'request',
    ['items', 0],
  ],
  [
    'arrange one item twice',
    w =>
      w.canvas.arrange(w.ctx, {
        canvas: 'main',
        items: [
          { item: 'i1', top: true },
          { item: 'i1', at: { x: 0, y: 0 } },
        ],
      }),
    'repeated',
    ['items', 1, 'item'],
  ],
  [
    'arrange one pile twice',
    w =>
      w.canvas.arrange(w.ctx, {
        canvas: 'main',
        piles: [
          { pile: 'p1', name: 'a' },
          { pile: 'p1', name: 'b' },
        ],
      }),
    'repeated',
    ['piles', 1, 'pile'],
  ],
  [
    'take one item twice',
    w => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1', 'i1'] }),
    'repeated',
    ['items', 1],
  ],
  [
    'take more than a batch',
    w =>
      w.canvas.take(w.ctx, {
        canvas: 'main',
        items: Array.from({ length: CONFIG.limits.batch + 1 }, (_, n) => `x${n}`),
      }),
    'batch',
    [],
  ],
  [
    'pile nothing',
    w => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: [] }),
    'request',
    ['items'],
  ],
  [
    'pile at a spot off the sheet',
    w => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p9', items: ['i1'], at: { x: -1, y: 0 } }),
    'request',
    ['at', 'x'],
  ],
  ['scatter without a pile', w => w.canvas.scatter(w.ctx, { canvas: 'main' }), 'request', ['pile']],
  [
    'lock both ways at once',
    w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: 'both' }),
    'request',
    ['locked'],
  ],
  [
    'lock one item twice',
    w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1', 'i1'], locked: true }),
    'repeated',
    ['items', 1],
  ],
]

describe('the answers before the state is looked at', () => {
  it.each(INVALID)(
    '1, invalid: %s, before the authority is asked',
    async (_name, call, where, path) => {
      const w = await seeded()
      const before = await revision(w)
      w.authority.answer('denied')
      const asked = w.authority.asked().length
      expect(await call(w)).toEqual({ kind: 'invalid', where, path })
      expect(w.authority.asked().length).toBe(asked)
      w.authority.answer('allowed')
      expect(await revision(w)).toBe(before)
    },
  )

  it.each(WRITES)(
    '2, denied: %s answers denied with no body, before any basis is read',
    async (_name, call) => {
      const w = await seeded()
      const before = await revision(w)
      w.authority.answer('denied')
      w.movers.set(null)
      w.store.failReads(true)
      w.store.failCommits('rolled-back')
      expect(JSON.stringify(await call(w))).toBe('{"kind":"denied"}')
      w.store.failReads(false)
      w.authority.answer('allowed')
      expect(await revision(w)).toBe(before)
    },
  )

  it.each(WRITES)(
    '3, basis unavailable: %s, when the authority, who it is by or the store cannot be read',
    async (_name, call) => {
      for (const fail of [
        (w: World) => w.authority.answer('unavailable'),
        (w: World) => w.authority.answer('throw'),
        (w: World) => w.movers.set(null),
        (w: World) => {
          w.store.failReads(true)
          w.store.failCommits('rolled-back')
        },
      ]) {
        const w = await seeded()
        const before = await revision(w)
        fail(w)
        expect(await call(w)).toEqual({ kind: 'basis-unavailable' })
        w.authority.answer('allowed')
        w.store.failReads(false)
        expect(await revision(w)).toBe(before)
      }
    },
  )

  it('4, place: a kind not declared is a conflict; declared twice is an unavailable basis naming both', async () => {
    const w = await seeded()
    const place = () =>
      w.canvas.place(w.ctx, { canvas: 'main', reference: { kind: 'session.session', ref: 's' } })
    expect(await place()).toEqual({ kind: 'conflict', reason: 'kind-undeclared' })
    w.kinds.declare(kind('session.session'), 'session-row')
    w.kinds.declare(kind('session.session'), 'other-row')
    expect(await place()).toEqual({
      kind: 'basis-unavailable',
      conflict: { name: 'session.session', by: ['other-row', 'session-row'] },
    })
    w.kinds.fail('throw')
    expect(await place()).toEqual({ kind: 'basis-unavailable' })
    expect(await revision(w)).toBe(3)
  })

  it('5, place: a full sheet is a conflict, and the owner is not asked', async () => {
    const w = world({ config: { limits: { ...CONFIG.limits, placed: 1 } } })
    let asked = 0
    w.kinds.declare(
      kind('media.object', async () => {
        asked += 1
        return { kind: 'admitted' }
      }),
    )
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media('a') })
    expect(await w.canvas.place(w.ctx, { canvas: 'main', reference: media('b') })).toEqual({
      kind: 'conflict',
      reason: 'full',
    })
    expect(asked).toBe(1)
  })

  it.each([
    [
      'refuses',
      async () => ({ kind: 'refused' }) as const,
      { kind: 'conflict', reason: 'not-admitted' },
    ],
    [
      'answers an unavailable basis',
      async () => ({ kind: 'basis-unavailable' }) as const,
      { kind: 'basis-unavailable' },
    ],
    ['answers unknown', async () => ({ kind: 'unknown' }) as const, { kind: 'unknown' }],
  ])('6, place: when the owner %s', async (_name, admit, answer) => {
    const w = await seeded()
    w.kinds.declare(kind('canvas.app', admit))
    expect(
      await w.canvas.place(w.ctx, { canvas: 'main', reference: { kind: 'canvas.app', ref: 'x' } }),
    ).toEqual(answer)
    expect(await revision(w)).toBe(3)
  })

  it.each(WRITES)(
    '7, unknown: %s, when the outcome of the commit is not known',
    async (_name, call) => {
      for (const fault of ['unknown-lost', 'unknown-applied'] as const) {
        const w = await seeded()
        w.store.failCommits(fault)
        expect(await call(w)).toEqual({ kind: 'unknown' })
      }
    },
  )

  it.each(WRITES)('7, unknown: %s, when the store throws on its commit', async (name, call) => {
    const w = await seeded()
    const thrower = () => Promise.reject(new Error('lost'))
    Object.assign(w.store, { [name]: thrower })
    expect(await call(w)).toEqual({ kind: 'unknown' })
  })
})
