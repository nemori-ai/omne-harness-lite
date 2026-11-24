import {
  tenantIdSchema,
  type CanvasOperations,
  type KindListing,
  type KindName,
} from '@omne-harness/canvas-contract'
import { describe, expect, it } from 'vitest'
import {
  NAMES,
  OTHER,
  READS,
  SAMPLES,
  SHEET,
  TENANT,
  WRITES,
  media,
  world,
} from './fixtures/world.ts'

const EMPTY = { sheet: SHEET, items: [], piles: [], revision: 0 }
const AT = '2026-11-24T06:00:00.000Z'

/** A canvas that declares media.object and holds nothing yet. */
function declared() {
  const w = world()
  w.kinds.declare({ name: 'media.object' as KindName, label: '媒体', summary: 's', reference: 'r' })
  return w
}

describe('the first three steps', () => {
  it.each([
    ['a login that may not act for the tenant', 'denied', 'denied'],
    ['an identity that cannot answer', 'basis-unavailable', 'basis-unavailable'],
    ['an identity that throws', 'throws', 'basis-unavailable'],
  ] as const)('%s stops every operation before the canvas', async (_label, login, outcome) => {
    const w = world()
    w.state.login = login
    for (const name of NAMES)
      expect([name, await w.call(name, SAMPLES[name])]).toEqual([name, { outcome }])
    expect(w.authority.asked()).toEqual([])
    expect(w.state.contexts).toEqual([])
  })

  it('asks whether the login acts for the tenant of the body, at every call', async () => {
    const w = world()
    await w.call('look', SAMPLES.look)
    await w.call('take', { ...SAMPLES.take, tenant: OTHER })
    await w.call('kinds', {})
    expect(w.state.logins).toEqual([TENANT, OTHER, TENANT])
  })

  it('hands the canvas the context of the principal issued for that tenant, with no tool call', async () => {
    const w = declared()
    await w.call('place', SAMPLES.place)
    expect(w.state.contexts).toEqual([
      { tenant: tenantIdSchema.parse(TENANT), subject: w.principal },
    ])
    expect(w.authority.asked()).toEqual([{ tenant: TENANT, action: 'change' }])
  })

  it('answers an unavailable basis while the canvas is not there, a write too, after the login is checked', async () => {
    const w = world()
    w.state.face = undefined
    for (const name of NAMES)
      expect([name, await w.call(name, SAMPLES[name])]).toEqual([
        name,
        { outcome: 'basis-unavailable' },
      ])
    expect(w.state.logins).toHaveLength(NAMES.length)
  })

  it('refuses another tenant with the same bytes as any other refusal: no body', async () => {
    const w = world()
    w.state.login = 'denied'
    const refused = JSON.stringify(await w.call('look', { ...SAMPLES.look, tenant: OTHER }))
    for (const name of NAMES)
      expect(JSON.stringify(await w.call(name, { ...SAMPLES[name], tenant: OTHER }))).toBe(refused)
    expect(refused).toBe(JSON.stringify({ outcome: 'denied' }))
    w.state.login = 'acting'
    w.authority.answer('denied')
    for (const name of NAMES)
      expect(JSON.stringify(await w.call(name, SAMPLES[name]))).toBe(refused)
  })

  it('throws before it asks anything for a tenant that was not minted', async () => {
    const w = world()
    const handler = w.contribution.operations.take as (call: never, body: never) => Promise<unknown>
    await expect(
      handler({ principal: {} } as never, { tenant: {}, canvas: 'main', items: ['i1'] } as never),
    ).rejects.toThrow(/not a minted TenantId/)
    expect(w.state.logins).toEqual([])
  })
})

describe('step four', () => {
  const throwing = new Proxy({} as CanvasOperations, {
    get: () => () => Promise.reject(new Error('gone')),
  })

  it.each(READS)('%s answers an unavailable basis when the canvas throws', async name => {
    const w = world()
    w.state.face = throwing
    expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each(WRITES)(
    '%s answers unknown when the canvas throws, neither failure nor success',
    async name => {
      const w = world()
      w.state.face = throwing
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'unknown' })
    },
  )

  it('hands the canvas the request without the tenant', async () => {
    const w = world()
    const asked: unknown[] = []
    w.state.face = new Proxy({} as CanvasOperations, {
      get: () => async (_ctx: unknown, request: unknown) => {
        asked.push(request)
        return { kind: 'no-change' }
      },
    })
    await w.call('pile', { ...SAMPLES.pile, at: { x: 8, y: 0 } })
    expect(asked).toEqual([{ canvas: 'main', pile: 'p1', items: ['i1'], at: { x: 8, y: 0 } }])
  })
})

describe('look', () => {
  it('reads the empty canvas of a tenant that has no record, with the sheet', async () => {
    expect(await world().call('look', SAMPLES.look)).toEqual({ outcome: 'succeeded', body: EMPTY })
  })

  it('answers an unavailable basis when the store cannot read, never an empty canvas', async () => {
    const w = world()
    w.store.failReads(true)
    expect(await w.call('look', SAMPLES.look)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('says the canvas does not fit when it names one the tenant does not have', async () => {
    expect(await world().call('look', { canvas: 'second' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'canvas' },
    })
  })

  it('carries the items and piles the canvas gives, with their instants', async () => {
    const w = world()
    w.store.seed(tenantIdSchema.parse(TENANT), 'main', {
      revision: 2,
      items: [
        {
          id: 'i1',
          reference: media('o1'),
          state: 'on',
          at: { x: 8, y: 16 },
          size: { width: 160, height: 80 },
          rank: 1,
          pile: 'p1',
          locked: false,
          by: { kind: 'agent', session: 's-1' },
          when: AT,
        },
      ],
      piles: [{ id: 'p1', name: null, at: { x: 8, y: 16 }, by: { kind: 'human' }, when: AT }],
    } as never)
    expect(await w.call('look', SAMPLES.look)).toMatchObject({
      outcome: 'succeeded',
      body: {
        revision: 2,
        items: [{ id: 'i1', pile: 'p1', when: AT, by: { kind: 'agent', session: 's-1' } }],
        piles: [{ id: 'p1', when: AT }],
      },
    })
  })

  it('throws, rather than send it, when the canvas kept an instant that cannot be read', async () => {
    const w = world()
    w.state.face = {
      look: async () => ({
        kind: 'done',
        value: {
          ...EMPTY,
          piles: [
            { id: 'p1', name: null, at: { x: 0, y: 0 }, by: { kind: 'human' }, when: 'yesterday' },
          ],
        },
      }),
    } as unknown as CanvasOperations
    await expect(w.call('look', SAMPLES.look)).rejects.toThrow(/invalid instant/)
  })
})

describe('kinds', () => {
  it('lists the declared kinds and the names in conflict, marked so, with who declared them', async () => {
    const w = world()
    const listed = [
      { kind: 'declared', name: 'canvas.app', label: '画布小应用', summary: 's', reference: 'r' },
      { kind: 'conflict', name: 'media.object', by: ['a', 'b'] },
    ] as KindListing[]
    const declaration = { label: '画布小应用', summary: 's', reference: 'r' }
    w.kinds.declare({ name: 'canvas.app' as KindName, ...declaration })
    for (const by of ['a', 'b'])
      w.kinds.declare({ name: 'media.object' as KindName, ...declaration }, by)
    expect(await w.call('kinds', {})).toEqual({ outcome: 'succeeded', body: { kinds: listed } })
  })

  it('answers an unavailable basis when the registry cannot be read', async () => {
    const w = world()
    w.kinds.fail('unavailable')
    expect(await w.call('kinds', {})).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('the writes over the canvas', () => {
  it('place gives the item it put on, with who did it and when, and the same item when it is on already', async () => {
    const w = declared()
    const placed = await w.call('place', SAMPLES.place)
    const item = {
      id: 'i1',
      reference: media('a'),
      state: 'on',
      at: { x: 0, y: 0 },
      size: null,
      rank: 1,
      pile: null,
      locked: false,
      by: { kind: 'human' },
      when: AT,
    }
    expect(placed).toEqual({ outcome: 'succeeded', body: { revision: 1, item } })
    expect(await w.call('place', { ...SAMPLES.place, at: { x: 400, y: 0 } })).toEqual({
      outcome: 'no-change',
      body: { item },
    })
  })

  it('a batch with an entry that may not change is not done, and the answer names the entry', async () => {
    const w = declared()
    await w.call('place', SAMPLES.place)
    await w.call('place', { ...SAMPLES.place, reference: media('b'), at: { x: 400, y: 0 } })
    await w.call('lock', { canvas: 'main', items: ['i1'], locked: true })
    expect(await w.call('take', { canvas: 'main', items: ['i2', 'i1'] })).toEqual({
      outcome: 'conflict',
      body: { reason: 'locked', entry: { item: 'i1' } },
    })
    expect(await w.call('scatter', { canvas: 'main', pile: 'p9' })).toEqual({
      outcome: 'no-change',
      body: {},
    })
    expect(await w.call('arrange', { canvas: 'main', piles: [{ pile: 'p9', name: 'x' }] })).toEqual(
      {
        outcome: 'not-found',
        body: { entry: { pile: 'p9' } },
      },
    )
    expect(await w.call('look', SAMPLES.look)).toMatchObject({ body: { revision: 3 } })
  })

  it('says what in a request does not fit and where, before it asks anything else', async () => {
    const w = declared()
    expect(
      await w.call('arrange', { canvas: 'main', items: [{ item: 'i1', at: { x: 9999, y: 0 } }] }),
    ).toEqual({
      outcome: 'invalid',
      body: { reason: 'spot', path: ['items', 0, 'at'] },
    })
    expect(await w.call('look-away', { canvas: 'main', limit: 5000 })).toEqual({
      outcome: 'invalid',
      body: { reason: 'request', path: ['limit'] },
    })
    expect(w.authority.asked()).toEqual([])
  })

  it('look-away pages what was taken, the newest first', async () => {
    const w = declared()
    for (const [ref, x] of [
      ['a', 0],
      ['b', 400],
    ] as const)
      await w.call('place', { ...SAMPLES.place, reference: media(ref), at: { x, y: 0 } })
    await w.call('take', { canvas: 'main', items: ['i1', 'i2'] })
    const first = await w.call('look-away', { canvas: 'main', limit: 1 })
    expect(first).toMatchObject({
      outcome: 'succeeded',
      body: { items: [{ id: 'i2', state: 'off', when: AT }] },
    })
    const next = (first as { body: { next: number } }).body.next
    expect(await w.call('look-away', { canvas: 'main', limit: 1, before: next })).toMatchObject({
      body: { items: [{ id: 'i1' }], next: null },
    })
  })
})
