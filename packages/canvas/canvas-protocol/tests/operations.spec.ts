import { describe, expect, it } from 'vitest'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations, observations } = canvasProtocol
const instant = '2026-11-24T06:00:00Z'
const canvasOf = { tenant, canvas: 'main' }
/** One body of each operation, every optional field given. */
const BODIES: Record<string, Record<string, unknown>> = {
  look: canvasOf,
  'look-away': { ...canvasOf, limit: 20, before: 7 },
  kinds: { tenant },
  place: {
    ...canvasOf,
    reference: { kind: 'media.object', ref: 'obj-1' },
    at: { x: 0, y: 8 },
    near: { x: 16, y: 16 },
    size: { width: 160, height: 80 },
  },
  arrange: {
    ...canvasOf,
    items: [
      { item: 'i1', at: { x: 8, y: 8 }, size: null, top: true, pile: null },
      { item: 'i2', pile: 'p1' },
    ],
    piles: [{ pile: 'p1', at: { x: 0, y: 0 }, name: '下周' }],
  },
  take: { ...canvasOf, items: ['i1', 'i2'] },
  pile: { ...canvasOf, pile: 'p1', items: ['i1'], at: { x: 8, y: 8 } },
  scatter: { ...canvasOf, pile: 'p1' },
  lock: { ...canvasOf, items: ['i1'], locked: false },
}
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

const READS = ['kinds', 'look', 'look-away']
const WRITES = ['arrange', 'lock', 'pile', 'place', 'scatter', 'take']

describe('canvas/v1', () => {
  it('is canvas major 1 with three reads, six commits, all by login and counted as access, and one observation', () => {
    expect([canvasProtocol.name, canvasProtocol.major]).toEqual(['canvas', 1])
    expect(Object.keys(operations).sort()).toEqual([...READS, ...WRITES].sort())
    expect(Object.keys(observations)).toEqual(['observe-changes'])
    for (const [name, operation] of Object.entries(operations))
      expect([
        name,
        operation.identity,
        operation.effect,
        operation.limit,
        operation.countsAsAccess,
      ]).toEqual([name, 'login', READS.includes(name) ? 'read' : 'commit', 'small', true])
  })

  it('answers a read without nothing-changed and without unknown, and with the fixed refusals', () => {
    for (const name of READS) {
      const outcomes = Object.keys(operations[name as keyof typeof operations].outcomes)
      for (const absent of ['no-change', 'unknown'])
        expect([name, absent, outcomes.includes(absent)]).toEqual([name, absent, false])
      for (const fixed of ['denied', 'basis-unavailable', 'protocol-rejected'])
        expect([name, fixed, outcomes.includes(fixed)]).toEqual([name, fixed, true])
    }
  })

  it('answers a commit with the outcome names of the specification, and with no body where none is allowed', () => {
    const named = ['succeeded', 'no-change', 'invalid', 'conflict']
    const fixed = ['denied', 'basis-unavailable', 'unknown', 'protocol-rejected']
    for (const name of WRITES) {
      const outcomes = operations[name as keyof typeof operations].outcomes as Record<
        string,
        unknown
      >
      const expected = [...named, ...(name === 'place' ? [] : ['not-found']), ...fixed]
      expect([name, Object.keys(outcomes).sort()]).toEqual([name, expected.sort()])
      for (const bare of fixed) expect([name, bare, outcomes[bare]]).toEqual([name, bare, true])
    }
  })

  it('carries no field that says who did it: a body with one is not read', () => {
    const by = { kind: 'agent', session: 's-1' }
    for (const [name, sample] of Object.entries(BODIES)) {
      const codec = operations[name as keyof typeof operations].body
      expectRoundTrip(codec, sample)
      expect([name, readSample(codec, { ...sample, by }).ok]).toEqual([name, false])
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

describe('look-away', () => {
  it('pages the taken records with the cursor of the page before, the last page without one', () => {
    expectRoundTrip(operations['look-away'].body, { ...canvasOf, limit: 1 })
    const outcomes = operations['look-away'].outcomes
    expectRoundTrip(outcomes.succeeded, { items: [{ ...item, state: 'off' }], next: 3 })
    expectRoundTrip(outcomes.succeeded, { items: [], next: null })
    expectRoundTrip(outcomes.invalid, { reason: 'request', path: ['limit'] })
    for (const bad of [
      { ...canvasOf, limit: 0 },
      { ...canvasOf, limit: 5, before: -1 },
    ])
      expect(readSample(operations['look-away'].body, bad).ok).toBe(false)
  })
})

describe('the commits', () => {
  it('place gives the item it put on, or the one already on, and why it cannot put one on', () => {
    const { outcomes } = operations.place
    expectRoundTrip(operations.place.body, {
      ...canvasOf,
      reference: { kind: 'canvas.app', ref: 'c' },
    })
    expectRoundTrip(outcomes.succeeded, { revision: 3, item })
    expectRoundTrip(outcomes['no-change'], { item })
    for (const reason of ['kind-undeclared', 'full', 'not-admitted'])
      expectRoundTrip(outcomes.conflict, { reason })
    expect(readSample(outcomes.conflict, { reason: 'locked' }).ok).toBe(false)
  })

  it.each(WRITES.filter(name => name !== 'place'))(
    '%s names the entry it did not find or may not change, and says where a request does not fit',
    name => {
      const outcomes = operations[name as 'arrange'].outcomes
      expectRoundTrip(outcomes.succeeded, { revision: 9 })
      expectRoundTrip(outcomes['no-change'], {})
      for (const entry of [{ item: 'i9' }, { pile: 'p9' }]) {
        expectRoundTrip(outcomes['not-found'], { entry })
        expectRoundTrip(outcomes.conflict, { reason: 'locked', entry })
      }
      for (const reason of ['taken', 'in-pile']) expectRoundTrip(outcomes.conflict, { reason })
      for (const reason of ['canvas', 'request', 'spot', 'size', 'repeated', 'batch'])
        expectRoundTrip(outcomes.invalid, { reason, path: ['items', 0, 'at'] })
      expect(readSample(outcomes['not-found'], { entry: { item: 'i9', pile: 'p9' } }).ok).toBe(
        false,
      )
      expect(readSample(outcomes.conflict, { reason: 'gone' }).ok).toBe(false)
    },
  )

  it('arrange takes a batch of items, of piles or of both, each entry with only what it changes', () => {
    const { body } = operations.arrange
    expectRoundTrip(body, { ...canvasOf, items: [{ item: 'i1', top: true }] })
    expectRoundTrip(body, { ...canvasOf, piles: [{ pile: 'p1', name: null }] })
    for (const bad of [
      { ...canvasOf, items: [{ item: 'i1', top: false }] },
      { ...canvasOf, items: [{ item: 'i1', at: { x: 1, y: -1 } }] },
      { ...canvasOf, piles: [{ pile: 'p1', locked: true }] },
    ])
      expect(readSample(body, bad).ok).toBe(false)
  })
})

describe('observe-changes', () => {
  it('opens on a tenant and frames only that the canvas may have changed', () => {
    const observation = observations['observe-changes']
    expect([observation.identity, observation.ends]).toEqual(['login', []])
    expectRoundTrip(observation.open, { tenant })
    expectRoundTrip(observation.frame, { kind: 'changed' })
    expect(readSample(observation.frame, { kind: 'changed', revision: 3 }).ok).toBe(false)
  })
})
