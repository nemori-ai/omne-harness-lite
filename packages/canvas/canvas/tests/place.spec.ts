import { describe, expect, it } from 'vitest'
import { createMemoryStore, tenantOf, type MemoryStore } from '@omne-harness/canvas/testing'
import { holderOf, type Admission, type AdmitInput } from '@omne-harness/canvas-contract'
import { CONFIG, kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

/** An owner whose answers the test gives one at a time. */
function owner() {
  const asked: AdmitInput[] = []
  const pending: ((admission: Admission) => void)[] = []
  return {
    asked,
    admit: (input: AdmitInput) => {
      asked.push(input)
      return new Promise<Admission>(resolve => void pending.push(resolve))
    },
    answer: (admission: Admission = { kind: 'admitted' }) => pending.shift()!(admission),
    answerLatest: (admission: Admission = { kind: 'admitted' }) => pending.pop()!(admission),
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

async function records(w: World) {
  const on = await w.canvas.look(w.ctx, { canvas: 'main' })
  const off = await w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 100 })
  if (on.kind !== 'done' || off.kind !== 'done') throw new Error('unreadable')
  return [...on.value.items, ...off.value.items]
}

const place = (w: World, ref: string, extra: object = {}) =>
  w.canvas.place(w.ctx, { canvas: 'main', reference: media(ref), ...extra })

describe('place asks the owner before it commits', () => {
  it.each([
    [
      'refuses',
      async (): Promise<Admission> => ({ kind: 'refused' }),
      { kind: 'conflict', reason: 'not-admitted' },
    ],
    [
      'answers an unavailable basis',
      async (): Promise<Admission> => ({ kind: 'basis-unavailable' }),
      { kind: 'basis-unavailable' },
    ],
    [
      'throws',
      async (): Promise<Admission> => {
        throw new Error('the owner fell over')
      },
      { kind: 'basis-unavailable' },
    ],
    // The fake port holds the batch only for the place, as putKind does; that the kind can still be
    // withdrawn after the time limit is pinned on the real putKind, canvas-cordis-contract kinds-point.spec.ts.
    [
      'passes the time limit',
      () => new Promise<Admission>(() => undefined),
      { kind: 'basis-unavailable' },
    ],
    [
      'answers what is no answer',
      async () => ({ kind: 'maybe' }) as unknown as Admission,
      { kind: 'basis-unavailable' },
    ],
    ['answers unknown', async (): Promise<Admission> => ({ kind: 'unknown' }), { kind: 'unknown' }],
  ])('leaves no record when the owner %s', async (_name, admit, answer) => {
    const w = world()
    w.kinds.declare(kind('media.object', admit))
    expect(await place(w, 'a')).toEqual(answer)
    expect(await records(w)).toEqual([])
    expect(w.kinds.held()).toBe(0)
  })

  it('gives the owner the tenant, the subject, the identity and the holder fixed by tenant, canvas and reference', async () => {
    const w = world()
    const asked: AdmitInput[] = []
    w.kinds.declare(
      kind('media.object', async input => {
        asked.push(input)
        return { kind: 'unknown' }
      }),
    )
    await place(w, 'a')
    await place(w, 'a')
    const holder = holderOf(tenantOf('tenant-1'), 'main', media('a'))
    const expected = { tenant: 'tenant-1', subject: w.ctx.subject, ref: 'a', holder }
    expect(asked).toEqual([expected, expected])
    expect(holder).not.toBe(holderOf(tenantOf('tenant-2'), 'main', media('a')))
    expect(holder).not.toBe(
      holderOf(tenantOf('tenant-1'), 'main', { kind: 'media.other', ref: 'a' }),
    )
  })

  it('does not ask the owner when the sheet is full', async () => {
    const w = world({ config: { limits: { ...CONFIG.limits, placed: 1 } } })
    const own = owner()
    w.kinds.declare(kind('canvas.app'))
    w.kinds.declare(kind('media.object', own.admit))
    await w.canvas.place(w.ctx, { canvas: 'main', reference: { kind: 'canvas.app', ref: 'x' } })
    expect(await place(w, 'a')).toEqual({ kind: 'conflict', reason: 'full' })
    expect(own.asked).toEqual([])
  })

  it('keeps one record when two placements of one reference cross while the owner is asked', async () => {
    const w = world()
    const own = owner()
    w.kinds.declare(kind('media.object', own.admit))
    const first = place(w, 'a')
    await settle()
    const second = place(w, 'a')
    await settle()
    own.answerLatest()
    const done = await second
    expect(done).toMatchObject({ kind: 'done' })
    own.answer()
    const item = done.kind === 'done' ? done.value.item : null
    expect(await first).toEqual({ kind: 'no-change', item })
    expect(await records(w)).toHaveLength(1)
    expect(own.asked).toHaveLength(2)
  })

  it('does not commit when the kind is withdrawn while its owner is asked', async () => {
    const w = world()
    const own = owner()
    const withdraw = w.kinds.declare(kind('media.object', own.admit))
    const placing = place(w, 'a')
    await settle()
    withdraw()
    own.answer()
    expect(await placing).toEqual({ kind: 'conflict', reason: 'kind-undeclared' })
    expect(await records(w)).toEqual([])
  })

  it('commits when the kind is withdrawn after the commit was handed over, and holds the kind until the commit has answered', async () => {
    const memory = createMemoryStore()
    let landed: () => void = () => undefined
    const handed = new Promise<void>(resolve => void (landed = resolve))
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => void (release = resolve))
    const store: MemoryStore = {
      ...memory,
      place: async (...given) => {
        landed()
        await gate
        return memory.place(...given)
      },
    }
    const w = world({ store })
    const withdraw = w.kinds.declare(kind('media.object', async () => ({ kind: 'admitted' })))
    const placing = place(w, 'a')
    await handed
    withdraw()
    expect(w.kinds.held()).toBe(1)
    release()
    expect(await placing).toMatchObject({ kind: 'done' })
    expect(w.kinds.held()).toBe(0)
    expect((await records(w)).map(item => item.reference.ref)).toEqual(['a'])
  })

  it('answers full when the sheet fills while the owner is asked', async () => {
    const w = world({ config: { limits: { ...CONFIG.limits, placed: 1 } } })
    const own = owner()
    w.kinds.declare(kind('media.object', own.admit))
    w.kinds.declare(kind('canvas.app'))
    const placing = place(w, 'a')
    await settle()
    expect(
      await w.canvas.place(w.ctx, { canvas: 'main', reference: { kind: 'canvas.app', ref: 'x' } }),
    ).toMatchObject({ kind: 'done' })
    own.answer()
    expect(await placing).toEqual({ kind: 'conflict', reason: 'full' })
    expect((await records(w)).map(item => item.reference.kind)).toEqual(['canvas.app'])
  })

  it('does not ask the owner of a reference already on, and holds no entry of the kind', async () => {
    const w = world()
    let asked = 0
    w.kinds.declare(
      kind('media.object', async () => {
        asked += 1
        return { kind: 'admitted' }
      }),
    )
    await place(w, 'a')
    w.kinds.fail('throw')
    expect(await place(w, 'a')).toMatchObject({
      kind: 'no-change',
      item: { reference: media('a') },
    })
    expect(asked).toBe(1)
    expect(w.kinds.held()).toBe(0)
  })
})

describe('where place puts a reference', () => {
  async function spotOf(w: World, ref: string, extra: object = {}) {
    const answer = await place(w, ref, extra)
    if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
    return answer.value.item.at
  }

  it('at the spot given, as given', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    expect(await spotOf(w, 'a', { at: { x: 13, y: 7 } })).toEqual({ x: 13, y: 7 })
  })

  it('near a spot given: the nearest free spot on the grid', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await spotOf(w, 'a', { at: { x: 800, y: 800 } })
    const at = await spotOf(w, 'b', { near: { x: 801, y: 801 } })
    expect((at.x % 8) + (at.y % 8)).toBe(0)
    expect(at).not.toEqual({ x: 800, y: 800 })
    const room = { width: 160, height: 80 + 22 }
    const clear =
      at.x >= 800 + room.width ||
      at.x + room.width <= 800 ||
      at.y >= 800 + room.height ||
      at.y + room.height <= 800
    expect(clear).toBe(true)
    expect(Math.hypot(at.x - 801, at.y - 801)).toBeLessThanOrEqual(room.height + 8)
  })

  it('counts the name line under an item as 22 high, the line the shared sheet draws', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await spotOf(w, 'a', { at: { x: 800, y: 802 } })
    expect(await spotOf(w, 'b', { near: { x: 800, y: 904 } })).toEqual({ x: 800, y: 904 })
  })

  it('with no spot: beside the seat in the middle of the sheet', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    const at = await spotOf(w, 'a')
    expect(Math.hypot(at.x - 2400, at.y - 1600)).toBeLessThan(200)
    expect((at.x % 8) + (at.y % 8)).toBe(0)
  })

  it('back from away without a spot: where it was taken from', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await spotOf(w, 'a', { at: { x: 40, y: 40 } })
    await w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })
    expect(await spotOf(w, 'a')).toEqual({ x: 40, y: 40 })
  })

  it('back from away to a spot taken since: the nearest free spot to it', async () => {
    const w = world()
    w.kinds.declare(kind('media.object'))
    await spotOf(w, 'a', { at: { x: 40, y: 40 } })
    await w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })
    await spotOf(w, 'b', { at: { x: 40, y: 40 } })
    const at = await spotOf(w, 'a')
    expect(at).not.toEqual({ x: 40, y: 40 })
    expect(Math.hypot(at.x - 40, at.y - 40)).toBeLessThanOrEqual(160 + 8)
  })

  it('on a sheet with no free spot: at the spot asked for, over the others, on top', async () => {
    const config = {
      sheet: { width: 320, height: 200, grid: 8 },
      size: { min: { width: 120, height: 64 }, max: { width: 320, height: 200 } },
    }
    const w = world({ config })
    w.kinds.declare(kind('media.object'))
    await spotOf(w, 'a', { at: { x: 0, y: 0 }, size: { width: 320, height: 176 } })
    const answer = await place(w, 'b', { near: { x: 100, y: 100 } })
    expect(answer).toMatchObject({
      kind: 'done',
      value: { item: { at: { x: 104, y: 104 }, rank: 2 } },
    })
  })

  it('as tall as the sheet, so that with its name line it fits nowhere: at the spot asked for, on the grid', async () => {
    const config = {
      sheet: { width: 320, height: 200, grid: 8 },
      size: { min: { width: 120, height: 64 }, max: { width: 320, height: 200 } },
    }
    const w = world({ config })
    w.kinds.declare(kind('media.object'))
    const answer = await place(w, 'a', {
      near: { x: 101, y: 99 },
      size: { width: 160, height: 200 },
    })
    expect(answer).toMatchObject({ kind: 'done', value: { item: { at: { x: 104, y: 96 } } } })
  })
})
