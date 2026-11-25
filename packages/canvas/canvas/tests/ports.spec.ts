import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore, type MemoryStore } from '@omne-harness/canvas/testing'
import type { ChangeAnswer, PlaceAnswer } from '@omne-harness/canvas-contract'
import { kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

const place = (w: World, ref = 'a') =>
  w.canvas.place(w.ctx, { canvas: 'main', reference: media(ref) })

async function records(w: World) {
  const on = await w.canvas.look(w.ctx, { canvas: 'main' })
  if (on.kind !== 'done') throw new Error(on.kind)
  return on.value
}

/** One valid request of each write on a canvas with i1 placed. */
const WRITES: readonly (readonly [string, (w: World) => Promise<ChangeAnswer | PlaceAnswer>])[] = [
  ['place', w => place(w, 'b')],
  ['arrange', w => w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', top: true }] })],
  ['take', w => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })],
  ['pile', w => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i1'] })],
  ['scatter', w => w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p1' })],
  ['lock', w => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: true })],
]

async function seeded() {
  const w = world()
  w.kinds.declare(kind('media.object'))
  await place(w)
  return w
}

describe('every write asks the authority whether the canvas may be changed', () => {
  it.each(WRITES)('%s', async (_name, write) => {
    const w = await seeded()
    const asked = w.authority.asked().length
    await write(w)
    expect(w.authority.asked().slice(asked)).toEqual([{ tenant: 'tenant-1', action: 'change' }])
  })
})

describe('who made a change cannot be told', () => {
  it.each(WRITES)(
    '%s answers an unavailable basis and writes nothing when it throws',
    async (_name, write) => {
      const w = await seeded()
      const before = await records(w)
      w.movers.moverOf = async () => {
        throw new Error('the session is gone')
      }
      expect(await write(w)).toEqual({ kind: 'basis-unavailable' })
      expect(await records(w)).toEqual(before)
    },
  )
})

describe('place', () => {
  it('answers an unavailable basis when the store throws on the read before the commit', async () => {
    const store: MemoryStore = {
      ...createMemoryStore(),
      placing: () => {
        throw new Error('the storage is gone')
      },
    }
    const w = world({ store })
    w.kinds.declare(kind('media.object'))
    expect(await place(w)).toEqual({ kind: 'basis-unavailable' })
  })

  it('answers an unavailable basis and nothing more when the registry cannot be read', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    w.kinds.fail('unavailable')
    expect(await place(w)).toEqual({ kind: 'basis-unavailable' })
  })

  describe('leaves no timer behind once the owner has answered', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it.each([
      ['accepts', { kind: 'admitted' } as const, 'done'],
      ['refuses', { kind: 'refused' } as const, 'conflict'],
    ])('when the owner %s', async (_name, admission, answer) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const w = world()
      w.kinds.declare(kind('media.object', async () => admission))
      expect(await place(w)).toMatchObject({ kind: answer })
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
