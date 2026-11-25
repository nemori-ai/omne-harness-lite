import { describe, expect, it } from 'vitest'
import { createCanvasChanges } from '@omne-harness/canvas'
import { createMemoryStore, tenantOf, type MemoryStore } from '@omne-harness/canvas/testing'
import type { CanvasChange } from '@omne-harness/canvas-contract'
import { CONFIG, kind, media, world } from './fixture.ts'

type World = ReturnType<typeof world>

const away = (w: World, page: object = {}) =>
  w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 100, ...page })

const ids = async (w: World, page: object = {}) => {
  const read = await away(w, page)
  if (read.kind !== 'done') throw new Error(read.kind)
  return read.value.items.map(item => item.reference.ref)
}

/** A canvas with the references placed in this order, each at its own spot. */
async function placed(refs: readonly string[], options: Parameters<typeof world>[0] = {}) {
  const w = world(options)
  w.kinds.declare(kind('media.object'))
  for (const [n, ref] of refs.entries())
    await w.canvas.place(w.ctx, { canvas: 'main', reference: media(ref), at: { x: n * 400, y: 0 } })
  return w
}

const take = (w: World, items: readonly string[]) =>
  w.canvas.take(w.ctx, { canvas: 'main', items: [...items] })

describe('look-away', () => {
  it('answers a request that does not fit as not fitting, before it asks the authority', async () => {
    const w = world()
    expect(await w.canvas.lookAway(w.ctx, { canvas: 'main', limit: 0 })).toMatchObject({
      kind: 'invalid',
    })
    expect(w.authority.asked()).toEqual([])
  })

  it('asks the authority whether the canvas may be read, and stops at a refusal', async () => {
    const w = await placed(['a'])
    await take(w, ['i1'])
    const asked = w.authority.asked().length
    w.authority.answer('denied')
    expect(await away(w)).toEqual({ kind: 'denied' })
    w.authority.answer('unavailable')
    expect(await away(w)).toEqual({ kind: 'basis-unavailable' })
    expect(
      w.authority
        .asked()
        .slice(asked)
        .map(({ action }) => action),
    ).toEqual(['read', 'read'])
  })

  it('answers an unavailable basis when the store cannot read or throws, never an empty page', async () => {
    const failing = createMemoryStore()
    failing.failReads(true)
    const throwing: MemoryStore = {
      ...createMemoryStore(),
      away: () => {
        throw new Error('the storage is gone')
      },
    }
    for (const store of [failing, throwing])
      expect(await away(world({ store }))).toEqual({ kind: 'basis-unavailable' })
  })

  it('gives a page of the limit asked for, and the next page from where it ends', async () => {
    const w = await placed(['a', 'b', 'c'])
    for (const id of ['i1', 'i2', 'i3']) await take(w, [id])
    const first = await away(w, { limit: 2 })
    if (first.kind !== 'done') throw new Error(first.kind)
    expect(first.value.items.map(item => item.reference.ref)).toEqual(['c', 'b'])
    expect(first.value.next).not.toBeNull()
    expect(await ids(w, { limit: 2, before: first.value.next })).toEqual(['a'])
  })

  it('has no next page when the records fill the page exactly', async () => {
    const w = await placed(['a', 'b'])
    await take(w, ['i1', 'i2'])
    expect(await away(w, { limit: 2 })).toMatchObject({ kind: 'done', value: { next: null } })
  })
})

describe('the limit of taken records', () => {
  const limited = { config: { limits: { ...CONFIG.limits, away: 2 } } }

  it('keeps the newest taken when one take takes more than the limit', async () => {
    const w = await placed(['a', 'b', 'c', 'd'], limited)
    expect(await take(w, ['i1', 'i2', 'i3', 'i4'])).toMatchObject({ kind: 'done' })
    expect(await ids(w)).toEqual(['d', 'c'])
  })

  describe('once the limit is lowered below the records kept', () => {
    /** Three references taken off under the configured limit; then the same store under a limit of one. */
    async function lowered() {
      const store = createMemoryStore()
      const before = await placed(['a', 'b', 'c'], { store })
      await take(before, ['i1', 'i2', 'i3'])
      const heard: CanvasChange[] = []
      const changes = createCanvasChanges(() => undefined)
      changes.subscribe(tenantOf('tenant-1'), {
        changed: change => heard.push(change),
        closed: () => undefined,
      })
      const w = world({ store, changes, config: { limits: { ...CONFIG.limits, away: 1 } } })
      w.kinds.declare(kind('media.object'))
      return { w, heard }
    }
    const revision = async (w: World) => {
      const read = await w.canvas.look(w.ctx, { canvas: 'main' })
      if (read.kind !== 'done') throw new Error(read.kind)
      return read.value.revision
    }

    it('taking again what is taken is no change: no revision, no record dropped, nothing told', async () => {
      const { w, heard } = await lowered()
      const was = await revision(w)
      expect(await take(w, ['i1'])).toEqual({ kind: 'no-change' })
      expect(await revision(w)).toBe(was)
      expect(await ids(w)).toEqual(['c', 'b', 'a'])
      expect(heard).toEqual([])
    })

    it('the next thing really taken drops the oldest down to the new limit at once', async () => {
      const store = createMemoryStore()
      const before = await placed(['a', 'b', 'c', 'd'], { store })
      await take(before, ['i1', 'i2', 'i3'])
      const w = world({ store, config: { limits: { ...CONFIG.limits, away: 2 } } })
      w.kinds.declare(kind('media.object'))
      expect(await take(w, ['i4'])).toMatchObject({ kind: 'done' })
      expect(await ids(w)).toEqual(['d', 'c'])
    })

    it('a batch that takes one thing on the sheet is a change, though the rest were taken', async () => {
      const { w } = await lowered()
      const put = await w.canvas.place(w.ctx, {
        canvas: 'main',
        reference: media('d'),
        at: { x: 1600, y: 0 },
      })
      if (put.kind !== 'done') throw new Error(put.kind)
      const was = await revision(w)
      expect(await take(w, ['i1', put.value.item.id])).toMatchObject({
        kind: 'done',
        value: { revision: was + 1 },
      })
      expect(await ids(w)).toContain('d')
    })
  })

  it('drops the one taken longest ago, whatever the order they were placed in', async () => {
    const w = await placed(['a', 'b', 'c'], limited)
    for (const id of ['i3', 'i2', 'i1']) await take(w, [id])
    expect(await ids(w)).toEqual(['a', 'b'])
  })
})
