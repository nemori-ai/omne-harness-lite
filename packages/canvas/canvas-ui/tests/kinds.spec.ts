import { describe, expect, it } from 'vitest'
import { drawingsInConflict, standingOf, type PlacedDrawings } from '../src/model/kinds.ts'

const POINT = 'canvas.drawing'
const KEY = 'test.note'
const TENANT = 't1'
const AT_TENANT = ['tenant', TENANT]
const AT_LOOK = ['tenant', TENANT, 'look', 'paper']

type Placed = PlacedDrawings['placed'][number]
const placed = (fiber: string, scope: readonly string[], over: Partial<Placed> = {}): Placed => ({
  point: POINT,
  key: KEY,
  scope,
  instance: { fiber, generation: 1 },
  ...over,
})

const host = (
  drawings: readonly Placed[],
  serving: PlacedDrawings['serving'] = drawings.map(one => one.instance),
  look?: string,
) => ({ registry: () => ({ serving, placed: drawings }), look: () => look })

describe('standingOf', () => {
  it('is the standing of the kind of that name, not of the first one listed', () => {
    const kinds = {
      kind: 'read',
      value: [
        { kind: 'declared', name: 'a', label: '甲', summary: '', reference: '' },
        { kind: 'declared', name: 'b', label: '乙', summary: '', reference: '' },
      ],
    } as const
    expect(standingOf(kinds, 'b')).toEqual({ kind: 'declared', label: '乙' })
  })
})

describe('drawingsInConflict', () => {
  it('two modules drawing a kind at the tenant layer are in conflict, named in order', () => {
    const drawings = [placed('f2', AT_TENANT), placed('f1', AT_TENANT)]
    expect(drawingsInConflict(host(drawings), POINT, KEY, TENANT)).toEqual(['f1', 'f2'])
  })

  it('one module, or one module twice, is no conflict', () => {
    expect(drawingsInConflict(host([placed('f1', AT_TENANT)]), POINT, KEY, TENANT)).toEqual([])
    const twice = [placed('f1', AT_TENANT), placed('f1', [])]
    expect(drawingsInConflict(host(twice), POINT, KEY, TENANT)).toEqual([])
  })

  it('only the deepest layer the tenant sees counts', () => {
    const drawings = [placed('f1', []), placed('f2', AT_TENANT)]
    expect(drawingsInConflict(host(drawings), POINT, KEY, TENANT)).toEqual([])
    const looked = [placed('f1', AT_TENANT), placed('f2', AT_TENANT), placed('f3', AT_LOOK)]
    expect(drawingsInConflict(host(looked, undefined, 'paper'), POINT, KEY, TENANT)).toEqual([])
  })

  it('a layer of another tenant, or of a look not taken, is not seen', () => {
    const other = [placed('f1', ['tenant', 't2']), placed('f2', ['tenant', 't2'])]
    expect(drawingsInConflict(host(other), POINT, KEY, TENANT)).toEqual([])
    const unlooked = [placed('f1', AT_TENANT), placed('f2', AT_LOOK)]
    expect(drawingsInConflict(host(unlooked), POINT, KEY, TENANT)).toEqual([])
  })

  it('drawings on another point or another key are not counted', () => {
    const drawings = [
      placed('f1', AT_TENANT),
      placed('f2', AT_TENANT, { point: 'canvas.finder' }),
      placed('f3', AT_TENANT, { key: 'media.object' }),
    ]
    expect(drawingsInConflict(host(drawings), POINT, KEY, TENANT)).toEqual([])
  })

  it('a drawing put by an instance that no longer serves is not counted', () => {
    const drawings = [
      placed('f1', AT_TENANT),
      placed('f2', AT_TENANT, { instance: { fiber: 'f2', generation: 1 } }),
      placed('f3', AT_TENANT),
    ]
    const serving = [
      { fiber: 'f1', generation: 1 },
      { fiber: 'f2', generation: 2 },
    ]
    expect(drawingsInConflict(host(drawings, serving), POINT, KEY, TENANT)).toEqual([])
    const current = [placed('f1', AT_TENANT), placed('f2', AT_TENANT, { instance: serving[1]! })]
    expect(drawingsInConflict(host(current, serving), POINT, KEY, TENANT)).toEqual(['f1', 'f2'])
  })
})
