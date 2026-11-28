import { describe, expect, it } from 'vitest'
import {
  CELLS,
  holderOf,
  parseArrange,
  parseLock,
  parseLookAway,
  parsePile,
  parsePlace,
  parseScatter,
  parseTake,
  statusOf,
  tenantIdSchema,
  type Bounds,
  type Item,
} from '@omne-harness/canvas-contract'

const BOUNDS: Bounds = {
  sheet: { width: 100, height: 50, grid: 8 },
  size: { min: { width: 10, height: 10 }, max: { width: 40, height: 40 } },
  batch: 3,
}

describe('reading a write', () => {
  it('takes a spot on the sheet and refuses one on its edge or past it', () => {
    const at = (x: number, y: number) =>
      parsePlace({ canvas: 'main', reference: { kind: 'k', ref: 'r' }, at: { x, y } }, BOUNDS)
    expect(at(99, 49)).toMatchObject({ ok: { at: { x: 99, y: 49 } } })
    expect(at(100, 0)).toEqual({ invalid: { kind: 'invalid', where: 'spot', path: ['at'] } })
    expect(at(0, 50)).toEqual({ invalid: { kind: 'invalid', where: 'spot', path: ['at'] } })
  })

  it('takes a size within the least and the most, both ends included', () => {
    const sized = (width: number, height: number) =>
      parseArrange({ canvas: 'main', items: [{ item: 'i1', size: { width, height } }] }, BOUNDS)
    expect(sized(10, 40)).toHaveProperty('ok')
    expect(sized(9, 40)).toEqual({
      invalid: { kind: 'invalid', where: 'size', path: ['items', 0, 'size'] },
    })
    expect(sized(10, 41)).toHaveProperty('invalid.where', 'size')
    expect(
      parseArrange({ canvas: 'main', items: [{ item: 'i1', size: null }] }, BOUNDS),
    ).toHaveProperty('ok')
  })

  it('takes at most a batch, and each item and pile at most once', () => {
    expect(parseTake({ canvas: 'main', items: ['a', 'b', 'c'] }, BOUNDS)).toHaveProperty('ok')
    expect(parseTake({ canvas: 'main', items: ['a', 'b', 'c', 'd'] }, BOUNDS)).toHaveProperty(
      'invalid.where',
      'batch',
    )
    expect(parseLock({ canvas: 'main', items: ['a', 'a'], locked: true }, BOUNDS)).toHaveProperty(
      'invalid.where',
      'repeated',
    )
    expect(parsePile({ canvas: 'main', pile: 'p', items: ['a', 'b', 'a'] }, BOUNDS)).toHaveProperty(
      'invalid.path',
      ['items', 2],
    )
    const both = parseArrange(
      { canvas: 'main', items: [{ item: 'p1', top: true }], piles: [{ pile: 'p1', name: 'x' }] },
      BOUNDS,
    )
    expect(both).toHaveProperty('ok')
  })

  it('names the canvas when it is another, the request when anything else does not fit', () => {
    expect(parseScatter({ canvas: 'second', pile: 'p' })).toHaveProperty('invalid.where', 'canvas')
    expect(parseScatter({ canvas: 'main', pile: 'p', extra: 1 })).toHaveProperty(
      'invalid.where',
      'request',
    )
    expect(parseLookAway({ canvas: 'main', limit: 0 })).toHaveProperty('invalid.path', ['limit'])
    expect(parseLookAway({ canvas: 'main', limit: 5, before: 9 })).toEqual({
      ok: { canvas: 'main', limit: 5, before: 9 },
    })
  })
})

describe('the total table', () => {
  const item = (fields: Partial<Item>) =>
    ({ state: 'on', pile: null, locked: false, ...fields }) as Item

  it('tells the five states of a reference apart', () => {
    expect(statusOf(null)).toBe('none')
    expect(statusOf(item({ state: 'off' }))).toBe('away')
    expect(statusOf(item({ locked: true }))).toBe('locked')
    expect(statusOf(item({ pile: 'p' as Item['pile'] }))).toBe('piled')
    expect(statusOf(item({}))).toBe('loose')
  })

  it('has a cell for every operation in every state, and only place makes a record from none', () => {
    for (const [operation, row] of Object.entries(CELLS)) {
      expect(Object.keys(row).sort()).toEqual(['away', 'locked', 'loose', 'none', 'piled'])
      expect(row.none).toBe(operation === 'place' ? 'apply' : 'not-found')
    }
  })
})

it('fixes the holder by the tenant, the canvas and the reference, whatever their text', () => {
  const tenant = tenantIdSchema.parse('t/1')
  const holder = holderOf(tenant, 'main', { kind: 'media.object', ref: 'a/b' })
  expect(holder).toBe('canvas/t%2F1/main/media.object/a%2Fb')
  expect(holderOf(tenant, 'main', { kind: 'media.object', ref: 'a' })).not.toBe(holder)
})
