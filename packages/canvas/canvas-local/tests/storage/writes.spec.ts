// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import { createCanvas } from '@omne-harness/canvas'
import {
  context,
  fakeAuthority,
  fakeClock,
  fakeKinds,
  fakeMovers,
  runCanvasProperties,
  tenantOf,
} from '@omne-harness/canvas/testing'
import { MAIN_CANVAS, type KindName } from '@omne-harness/canvas-contract'
import { createSqlCanvasStore } from '@omne-harness/canvas-local'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { POLICY } from '../fixture.ts'
import { openSqlWorld, type SqlWorld } from './world.ts'

const open: SqlWorld[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map(world => world.close()))
})

async function sqlWorld(wrap?: (storage: SqlStorage) => SqlStorage) {
  const world = await openSqlWorld(wrap === undefined ? {} : { wrap })
  open.push(world)
  return world
}

function canvasOver(world: SqlWorld) {
  const kinds = fakeKinds()
  kinds.declare({ name: 'media.object' as KindName, label: 'm', summary: 'm', reference: 'm' })
  return createCanvas({
    store: world.store,
    authority: fakeAuthority(),
    movers: fakeMovers(),
    kinds,
    clock: fakeClock(),
    config: POLICY,
  })
}

const request = (fields: object) => ({ canvas: 'main', ...fields })

describe('the canvas over a real SQLite storage', () => {
  it('commits once for each write that changes the arrangement, and not past its script', async () => {
    let commits = 0
    const world = await sqlWorld(storage => ({
      ...storage,
      commit: input => {
        commits += 1
        return storage.commit(input)
      },
    }))
    const canvas = canvasOver(world)
    const ctx = context()
    const done = [
      await canvas.place(
        ctx,
        request({ reference: { kind: 'media.object', ref: 'a' }, at: { x: 0, y: 0 } }),
      ),
      await canvas.place(ctx, request({ reference: { kind: 'media.object', ref: 'b' } })),
      await canvas.arrange(
        ctx,
        request({ items: [{ item: 'i1', at: { x: 8, y: 8 }, top: true }] }),
      ),
      await canvas.pile(ctx, request({ pile: 'p1', items: ['i1', 'i2'] })),
      await canvas.scatter(ctx, request({ pile: 'p1' })),
      await canvas.lock(ctx, request({ items: ['i1'], locked: true })),
      await canvas.lock(ctx, request({ items: ['i1'], locked: false })),
      await canvas.take(ctx, request({ items: ['i2'] })),
    ]
    expect(done.map(answer => answer.kind)).toEqual(Array(8).fill('done'))
    expect(commits).toBe(8)
    const look = await canvas.look(ctx, { canvas: 'main' })
    expect(look).toMatchObject({ kind: 'done', value: { revision: 8, items: [{ id: 'i1' }] } })
    const away = await canvas.lookAway(ctx, request({ limit: 5 }))
    expect(away).toMatchObject({
      kind: 'done',
      value: { items: [{ id: 'i2', state: 'off' }], next: null },
    })
    expect(await canvas.take(ctx, request({ items: ['i2'] }))).toEqual({ kind: 'no-change' })
  })

  it('answers unknown when the outcome of a commit is not known, and an unavailable read as unavailable', async () => {
    const world = await sqlWorld(storage => ({
      ...storage,
      commit: async input => ({ kind: 'unknown', identity: input.identity, diagnostic: null }),
      read: async () => {
        throw new Error('the reader is gone')
      },
    }))
    const store = createSqlCanvasStore({ storage: world.storage, bind: world.bind })
    const stamp = {
      canvas: MAIN_CANVAS,
      by: { kind: 'human' },
      when: fakeClock().now(),
      rules: { sheet: POLICY.sheet, footprint: POLICY.footprint, placed: 5, away: 5 },
    } as const
    const tenant = tenantOf('tenant-1')
    expect(await store.take(tenant, { ...stamp, items: [] })).toEqual({ kind: 'unknown' })
    expect(await store.look(tenant, MAIN_CANVAS)).toEqual({ kind: 'unavailable' })
    const canvas = canvasOver(world)
    expect(await canvas.lock(context(), request({ items: ['i1'], locked: true }))).toEqual({
      kind: 'unknown',
    })
    expect(
      await canvas.place(context(), request({ reference: { kind: 'media.object', ref: 'a' } })),
    ).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('answers an unavailable basis for a tenant with no storage domain', async () => {
    const world = await sqlWorld()
    const store = createSqlCanvasStore({ storage: world.storage, bind: async () => null })
    const tenant = tenantOf('tenant-1')
    expect(await store.look(tenant, MAIN_CANVAS)).toEqual({ kind: 'unavailable' })
    expect(
      await store.scatter(tenant, {
        canvas: MAIN_CANVAS,
        by: { kind: 'human' },
        when: fakeClock().now(),
        rules: { sheet: POLICY.sheet, footprint: POLICY.footprint, placed: 5, away: 5 },
        pile: 'p1' as never,
      }),
    ).toEqual({ kind: 'rolled-back' })
  })

  it.each([201, 202, 203])(
    'keeps the properties of the arrangement over random writes, seed %i',
    async seed => {
      await expect(
        runCanvasProperties(async () => (await sqlWorld()).store, seed, 40),
      ).resolves.toBeUndefined()
    },
  )
})
