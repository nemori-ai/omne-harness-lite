import { describe, expect, it } from 'vitest'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations, observations } = canvasProtocol
const instant = '2026-11-24T06:00:00Z'
const item = {
  id: 'i1',
  reference: { kind: 'media.object', ref: 'obj-1' },
  state: 'on',
  at: { x: 0, y: 40 },
  size: null,
  rank: 0,
  pile: null,
  locked: false,
  by: { kind: 'human' },
  when: instant,
}
const canvas = {
  sheet: { width: 4800, height: 3200, grid: 8 },
  items: [
    item,
    {
      ...item,
      id: 'i2',
      size: { width: 160, height: 80 },
      rank: 4,
      pile: 'p1',
      locked: true,
      by: { kind: 'agent', session: 's-1' },
    },
  ],
  piles: [{ id: 'p1', name: '下周', at: { x: 8, y: 8 }, by: { kind: 'human' }, when: instant }],
  revision: 12,
}

describe('canvas/v1', () => {
  it('is canvas major 1 with two reads by login that count as access, and no observation yet', () => {
    expect([canvasProtocol.name, canvasProtocol.major]).toEqual(['canvas', 1])
    expect(Object.keys(operations).sort()).toEqual(['kinds', 'look'])
    expect(Object.keys(observations)).toEqual([])
    for (const operation of Object.values(operations))
      expect([
        operation.identity,
        operation.effect,
        operation.limit,
        operation.countsAsAccess,
      ]).toEqual(['login', 'read', 'small', true])
  })

  it('answers a read without nothing-changed and without unknown, and with the fixed refusals', () => {
    for (const [name, operation] of Object.entries(operations)) {
      const outcomes = Object.keys(operation.outcomes)
      for (const absent of ['no-change', 'unknown'])
        expect([name, absent, outcomes.includes(absent)]).toEqual([name, absent, false])
      for (const fixed of ['denied', 'basis-unavailable', 'protocol-rejected'])
        expect([name, fixed, outcomes.includes(fixed)]).toEqual([name, fixed, true])
    }
  })
})

describe('look', () => {
  it('names the tenant and the canvas', () => {
    expectRoundTrip(operations.look.body, { tenant, canvas: 'main' })
    for (const bad of [{ tenant }, { tenant, canvas: '' }, { tenant, canvas: 'main', extra: 1 }])
      expect(readSample(operations.look.body, bad).ok).toBe(false)
  })

  it('gives the sheet, the items, the piles and the revision, an empty canvas too', () => {
    expectRoundTrip(operations.look.outcomes.succeeded, canvas)
    expectRoundTrip(operations.look.outcomes.succeeded, {
      ...canvas,
      items: [],
      piles: [],
      revision: 0,
    })
  })

  it('carries no spot below zero, no size of zero and no other mover', () => {
    const bad = [
      { ...item, at: { x: -1, y: 0 } },
      { ...item, size: { width: 0, height: 10 } },
      { ...item, by: { kind: 'system' } },
      { ...item, state: 'gone' },
    ]
    for (const wrong of bad)
      expect(readSample(operations.look.outcomes.succeeded, { ...canvas, items: [wrong] }).ok).toBe(
        false,
      )
  })

  it('says where a request does not fit', () => {
    for (const reason of ['request', 'canvas'])
      expectRoundTrip(operations.look.outcomes.invalid, { reason })
    expect(readSample(operations.look.outcomes.invalid, { reason: 'sheet' }).ok).toBe(false)
  })
})

describe('kinds', () => {
  it('lists the kinds declared and the names declared twice with who declared them', () => {
    expectRoundTrip(operations.kinds.body, { tenant })
    expectRoundTrip(operations.kinds.outcomes.succeeded, { kinds: [] })
    expectRoundTrip(operations.kinds.outcomes.succeeded, {
      kinds: [
        {
          kind: 'declared',
          name: 'canvas.app',
          label: '画布小应用',
          summary: '一份 plugin 带来的小应用。',
          reference: '小应用的名字。',
        },
        { kind: 'conflict', name: 'media.object', by: ['media', 'media-copy'] },
      ],
    })
    expect(
      readSample(operations.kinds.outcomes.succeeded, {
        kinds: [{ kind: 'conflict', name: 'media.object' }],
      }).ok,
    ).toBe(false)
  })
})
