import type { CanvasOperations } from '@omne-harness/canvas-contract'
import { describe, expect, it } from 'vitest'
import { SAMPLES, SHEET, world, type Name } from './fixtures/world.ts'

const AT = '2026-11-24T06:00:00.000Z'
const ITEM = {
  id: 'i1',
  reference: { kind: 'media.object', ref: 'a' },
  state: 'on',
  at: { x: 0, y: 0 },
  size: null,
  rank: 1,
  pile: null,
  locked: false,
  by: { kind: 'human' },
  when: AT,
}
const METHODS: Record<Name, keyof CanvasOperations> = {
  look: 'look',
  'look-away': 'lookAway',
  kinds: 'kinds',
  place: 'place',
  arrange: 'arrange',
  take: 'take',
  pile: 'pile',
  scatter: 'scatter',
  lock: 'lock',
}

/** The protocol answer for one answer of the canvas, as the entry writes it on the wire. */
async function mapped(name: Name, answer: unknown) {
  const w = world()
  const method = METHODS[name]
  w.state.face = { [method]: async () => answer } as unknown as CanvasOperations
  return w.call(name, SAMPLES[name])
}

const bare = (outcome: string) => ({ outcome })
const REFUSALS = [
  [{ kind: 'denied' }, bare('denied')],
  [{ kind: 'basis-unavailable' }, bare('basis-unavailable')],
] as const
const NOT_FITTING = [
  { kind: 'invalid', where: 'repeated', path: ['items', 1] },
  { outcome: 'invalid', body: { reason: 'repeated', path: ['items', 1] } },
] as const

const BATCH = [
  [
    { kind: 'done', value: { revision: 7 } },
    { outcome: 'succeeded', body: { revision: 7 } },
  ],
  [{ kind: 'no-change' }, { outcome: 'no-change', body: {} }],
  NOT_FITTING,
  [
    { kind: 'not-found', entry: { item: 'i9' } },
    { outcome: 'not-found', body: { entry: { item: 'i9' } } },
  ],
  [
    { kind: 'not-found', entry: { pile: 'p9' } },
    { outcome: 'not-found', body: { entry: { pile: 'p9' } } },
  ],
  ...(['kind-undeclared', 'full', 'not-admitted', 'locked', 'taken', 'in-pile'] as const).map(
    reason =>
      [
        { kind: 'conflict', reason, entry: { item: 'i2' } },
        { outcome: 'conflict', body: { reason, entry: { item: 'i2' } } },
      ] as const,
  ),
  [
    { kind: 'conflict', reason: 'locked' },
    { outcome: 'conflict', body: { reason: 'locked' } },
  ],
  ...REFUSALS,
  [
    { kind: 'basis-unavailable', conflict: { name: 'media.object', by: ['a', 'b'] } },
    bare('basis-unavailable'),
  ],
  [{ kind: 'unknown' }, bare('unknown')],
] as const

const PLACE = [
  [
    { kind: 'done', value: { revision: 3, item: ITEM } },
    { outcome: 'succeeded', body: { revision: 3, item: ITEM } },
  ],
  [
    { kind: 'no-change', item: ITEM },
    { outcome: 'no-change', body: { item: ITEM } },
  ],
  NOT_FITTING,
  ...(['kind-undeclared', 'full', 'not-admitted'] as const).map(
    reason =>
      [
        { kind: 'conflict', reason },
        { outcome: 'conflict', body: { reason } },
      ] as const,
  ),
  ...REFUSALS,
  [
    { kind: 'basis-unavailable', conflict: { name: 'media.object', by: ['a', 'b'] } },
    bare('basis-unavailable'),
  ],
  [{ kind: 'unknown' }, bare('unknown')],
] as const

const READS = [
  [
    'look',
    { kind: 'done', value: { sheet: SHEET, items: [ITEM], piles: [], revision: 4 } },
    { outcome: 'succeeded', body: { sheet: SHEET, items: [ITEM], piles: [], revision: 4 } },
  ],
  [
    'look',
    { kind: 'invalid', where: 'canvas' },
    { outcome: 'invalid', body: { reason: 'canvas' } },
  ],
  [
    'look-away',
    { kind: 'done', value: { items: [{ ...ITEM, state: 'off' }], next: 2 } },
    { outcome: 'succeeded', body: { items: [{ ...ITEM, state: 'off' }], next: 2 } },
  ],
  ['look-away', NOT_FITTING[0], NOT_FITTING[1]],
  ['kinds', { kind: 'done', value: [] }, { outcome: 'succeeded', body: { kinds: [] } }],
  ...(['look', 'look-away', 'kinds'] as const).flatMap(name =>
    REFUSALS.map(([answer, wire]) => [name, answer, wire] as const),
  ),
] as const

describe('what the canvas answers, as canvas/v1 answers it', () => {
  it.each(READS)('%s: %j answers %j', async (name, answer, wire) => {
    expect(await mapped(name, answer)).toEqual(wire)
  })

  it.each(PLACE)('place: %j answers %j', async (answer, wire) => {
    expect(await mapped('place', answer)).toEqual(wire)
  })

  it.each(
    (['arrange', 'take', 'pile', 'scatter', 'lock'] as const).flatMap(name =>
      BATCH.map(([answer, wire]) => [name, answer, wire] as const),
    ),
  )('%s: %j answers %j', async (name, answer, wire) => {
    expect(await mapped(name, answer)).toEqual(wire)
  })
})
