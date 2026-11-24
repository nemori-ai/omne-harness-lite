import {
  tenantIdSchema,
  type CanvasOperations,
  type KindListing,
  type KindName,
} from '@omne-harness/canvas-contract'
import { describe, expect, it } from 'vitest'
import { NAMES, OTHER, SHEET, TENANT, world, type Name } from './fixtures/world.ts'

const SAMPLES: Record<Name, Record<string, unknown>> = {
  look: { canvas: 'main' },
  kinds: {},
}

const EMPTY = { sheet: SHEET, items: [], piles: [], revision: 0 }

describe('the first three steps', () => {
  it.each([
    ['a login that may not act for the tenant', 'denied', 'denied'],
    ['an identity that cannot answer', 'basis-unavailable', 'basis-unavailable'],
    ['an identity that throws', 'throws', 'basis-unavailable'],
  ] as const)('%s stops every operation before the canvas', async (_label, login, outcome) => {
    const w = world()
    w.state.login = login
    for (const name of NAMES) expect(await w.call(name, SAMPLES[name])).toEqual({ outcome })
    expect(w.authority.asked()).toEqual([])
    expect(w.state.contexts).toEqual([])
  })

  it('asks whether the login acts for the tenant of the body, at every call', async () => {
    const w = world()
    await w.call('look', SAMPLES.look)
    await w.call('look', { ...SAMPLES.look, tenant: OTHER })
    await w.call('kinds', {})
    expect(w.state.logins).toEqual([TENANT, OTHER, TENANT])
  })

  it('hands the canvas the context of the principal issued for that tenant', async () => {
    const w = world()
    await w.call('look', SAMPLES.look)
    expect(w.state.contexts).toEqual([
      { tenant: tenantIdSchema.parse(TENANT), subject: w.principal },
    ])
    expect(w.authority.asked()).toEqual([{ tenant: TENANT, action: 'read' }])
  })

  it('answers an unavailable basis while the canvas is not there, after the login is checked', async () => {
    const w = world()
    w.state.face = undefined
    for (const name of NAMES)
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
    expect(w.state.logins).toHaveLength(NAMES.length)
  })

  it('refuses another tenant with the same bytes as any other refusal: no body', async () => {
    const w = world()
    w.state.login = 'denied'
    const refused = JSON.stringify(await w.call('look', { ...SAMPLES.look, tenant: OTHER }))
    expect(refused).toBe(JSON.stringify(await w.call('kinds', { tenant: OTHER })))
    expect(refused).toBe(JSON.stringify({ outcome: 'denied' }))
    w.state.login = 'acting'
    w.authority.answer('denied')
    expect(JSON.stringify(await w.call('look', SAMPLES.look))).toBe(refused)
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
    const at = '2026-11-24T06:00:00.000Z'
    w.store.seed(tenantIdSchema.parse(TENANT), 'main', {
      revision: 2,
      items: [
        {
          id: 'i1',
          reference: { kind: 'media.object', ref: 'o1' },
          state: 'on',
          at: { x: 8, y: 16 },
          size: { width: 160, height: 80 },
          rank: 1,
          pile: 'p1',
          locked: false,
          by: { kind: 'agent', session: 's-1' },
          when: at,
        },
      ],
      piles: [{ id: 'p1', name: null, at: { x: 8, y: 16 }, by: { kind: 'human' }, when: at }],
    } as never)
    expect(await w.call('look', SAMPLES.look)).toMatchObject({
      outcome: 'succeeded',
      body: {
        revision: 2,
        items: [{ id: 'i1', pile: 'p1', when: '2026-11-24T06:00:00.000Z' }],
        piles: [{ id: 'p1', when: '2026-11-24T06:00:00.000Z' }],
      },
    })
  })
})

describe('kinds', () => {
  it('lists the declared kinds and the names in conflict with who declared them', async () => {
    const w = world()
    const listed = [
      { kind: 'declared', name: 'canvas.app', label: '画布小应用', summary: 's', reference: 'r' },
      { kind: 'conflict', name: 'media.object', by: ['a', 'b'] },
    ] as KindListing[]
    const declared = { label: '画布小应用', summary: 's', reference: 'r' }
    w.kinds.declare({ name: 'canvas.app' as KindName, ...declared })
    for (const by of ['a', 'b'])
      w.kinds.declare({ name: 'media.object' as KindName, ...declared }, by)
    expect(await w.call('kinds', {})).toEqual({ outcome: 'succeeded', body: { kinds: listed } })
  })

  it('answers an unavailable basis when the registry cannot be read', async () => {
    const w = world()
    w.kinds.fail('unavailable')
    expect(await w.call('kinds', {})).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('step four', () => {
  it.each(NAMES)('%s answers an unavailable basis when the canvas throws', async name => {
    const w = world()
    const throwing = {
      look: () => Promise.reject(new Error('gone')),
      kinds: () => {
        throw new Error('gone')
      },
    } as unknown as CanvasOperations
    w.state.face = throwing
    expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
  })
})
