import { createCanvasChanges } from '@omne-harness/canvas'
import { createMemoryStore, tenantOf } from '@omne-harness/canvas/testing'
import type { CanvasChange } from '@omne-harness/canvas-contract'
import { describe, expect, it } from 'vitest'
import { kind, media, world } from './fixture.ts'

const TENANT = tenantOf('tenant-1')
const MAIN = { tenant: TENANT, canvas: 'main' }

/** A canvas whose store tells a feed, with a listener of its tenant and one of another tenant. */
function watched(store = createMemoryStore()) {
  const reported: unknown[] = []
  const changes = createCanvasChanges(error => reported.push(error))
  const heard: CanvasChange[] = []
  const elsewhere: CanvasChange[] = []
  const closed: string[] = []
  changes.subscribe(TENANT, {
    changed: change => heard.push(change),
    closed: () => closed.push('mine'),
  })
  changes.subscribe(tenantOf('tenant-2'), {
    changed: change => elsewhere.push(change),
    closed: () => closed.push('theirs'),
  })
  const w = world({ store, changes })
  w.kinds.declare(kind('media.object'))
  const place = (ref: string, x = 0) =>
    w.canvas.place(w.ctx, { canvas: 'main', reference: media(ref), at: { x, y: 0 } })
  return { ...w, changes, heard, elsewhere, closed, reported, place }
}

describe('the changes of a canvas', () => {
  it('tell the tenant once after each commit that changed the arrangement, and no other tenant', async () => {
    const w = watched()
    const writes = [
      () => w.place('a'),
      () => w.place('b', 400),
      () =>
        w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i1', at: { x: 8, y: 8 } }] }),
      () => w.canvas.pile(w.ctx, { canvas: 'main', pile: 'p1', items: ['i1'] }),
      () => w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p1' }),
      () => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i2'], locked: true }),
      () => w.canvas.lock(w.ctx, { canvas: 'main', items: ['i2'], locked: false }),
      () => w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] }),
    ]
    for (const [at, write] of writes.entries()) {
      expect(await write()).toMatchObject({ kind: 'done' })
      expect(w.heard).toHaveLength(at + 1)
    }
    expect(new Set(w.heard.map(change => JSON.stringify(change)))).toEqual(
      new Set([JSON.stringify(MAIN)]),
    )
    expect(w.elsewhere).toEqual([])
  })

  it('tell nothing of a write that changed nothing, found nothing, was not allowed or was rolled back', async () => {
    const w = watched()
    await w.place('a')
    await w.canvas.lock(w.ctx, { canvas: 'main', items: ['i1'], locked: true })
    const heard = w.heard.length
    const answers = [
      await w.place('a'),
      await w.canvas.arrange(w.ctx, { canvas: 'main', items: [{ item: 'i9', top: true }] }),
      await w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] }),
      await w.canvas.scatter(w.ctx, { canvas: 'main', pile: 'p9' }),
      await w.canvas.place(w.ctx, { canvas: 'main', reference: media('b'), at: { x: -1, y: 0 } }),
    ]
    expect(answers.map(answer => answer.kind)).toEqual([
      'no-change',
      'not-found',
      'conflict',
      'no-change',
      'invalid',
    ])
    w.store.failCommits('rolled-back')
    expect(await w.place('b', 400)).toEqual({ kind: 'basis-unavailable' })
    expect(w.heard).toHaveLength(heard)
  })

  it.each(['unknown-lost', 'unknown-applied'] as const)(
    'tell a commit whose result is not known (%s): the canvas may have changed',
    async fault => {
      const w = watched()
      w.store.failCommits(fault)
      expect(await w.place('a')).toEqual({ kind: 'unknown' })
      expect(w.heard).toEqual([MAIN])
    },
  )

  it('tell a commit that threw, and the write still answers unknown', async () => {
    const store = createMemoryStore()
    const w = watched({ ...store, take: () => Promise.reject(new Error('the disk went away')) })
    await w.place('a')
    expect(await w.canvas.take(w.ctx, { canvas: 'main', items: ['i1'] })).toEqual({
      kind: 'unknown',
    })
    expect(w.heard).toEqual([MAIN, MAIN])
  })

  it('report a listener that throws; the commit and the other listeners do not notice', async () => {
    const w = watched()
    const after: CanvasChange[] = []
    const fault = new Error('the observer fell over')
    w.changes.subscribe(TENANT, {
      changed: () => {
        throw fault
      },
      closed: () => undefined,
    })
    w.changes.subscribe(TENANT, { changed: change => after.push(change), closed: () => undefined })
    expect(await w.place('a')).toMatchObject({ kind: 'done' })
    expect([w.heard, after, w.reported]).toEqual([[MAIN], [MAIN], [fault]])
  })

  it('stop telling a listener that left', async () => {
    const w = watched()
    const left: CanvasChange[] = []
    const leave = w.changes.subscribe(TENANT, {
      changed: c => left.push(c),
      closed: () => undefined,
    })
    await w.place('a')
    leave()
    await w.place('b', 400)
    expect([left.length, w.heard.length]).toEqual([1, 2])
  })

  it('once closed, tell every listener so once, a later one at once, and nothing more', async () => {
    const w = watched()
    w.changes.close()
    expect(w.closed).toEqual(['mine', 'theirs'])
    const late: string[] = []
    w.changes.subscribe(TENANT, {
      changed: () => late.push('changed'),
      closed: () => late.push('closed'),
    })
    expect(late).toEqual(['closed'])
    expect(await w.place('a')).toMatchObject({ kind: 'done' })
    expect([w.heard, late, w.closed]).toEqual([[], ['closed'], ['mine', 'theirs']])
  })
})
