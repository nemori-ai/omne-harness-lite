import { describe, expect, it } from 'vitest'
import {
  CANVAS_APP,
  MAIN_CANVAS,
  canvasAppKind,
  itemSchema,
  kindNameSchema,
  moverSchema,
  parseLook,
  pileSchema,
  referenceSchema,
  sheetSchema,
  sizeRangeSchema,
} from '@omne-harness/canvas-contract'

const AT = '2026-11-24T06:00:00.000Z'
const item = {
  id: 'i1',
  reference: { kind: 'media.object', ref: 'obj-1' },
  state: 'on',
  at: { x: 0, y: 40 },
  size: null,
  rank: 3,
  pile: null,
  locked: false,
  by: { kind: 'agent', session: 's-1' },
  when: AT,
}

describe('the values of a canvas', () => {
  it('reads an item with every field of the record', () => {
    expect(itemSchema.parse(item)).toEqual(item)
    expect(
      itemSchema.parse({ ...item, size: { width: 160, height: 80 }, pile: 'p1' }),
    ).toMatchObject({ size: { width: 160, height: 80 }, pile: 'p1' })
  })

  it('takes a spot from the top left corner: whole numbers, none below zero', () => {
    for (const at of [{ x: -1, y: 0 }, { x: 0, y: 1.5 }, { x: 0 }])
      expect(itemSchema.safeParse({ ...item, at }).success).toBe(false)
  })

  it('takes a size that is a whole number above zero, or none', () => {
    for (const size of [
      { width: 0, height: 10 },
      { width: 10, height: 2.5 },
    ])
      expect(itemSchema.safeParse({ ...item, size }).success).toBe(false)
  })

  it('records a person or the agent of one session as the one who moved it, and nobody else', () => {
    expect(moverSchema.parse({ kind: 'human' })).toEqual({ kind: 'human' })
    expect(moverSchema.safeParse({ kind: 'system' }).success).toBe(false)
    expect(moverSchema.safeParse({ kind: 'agent' }).success).toBe(false)
  })

  it('keeps a reference as two opaque texts within their bounds', () => {
    expect(referenceSchema.safeParse({ kind: 'k'.repeat(64), ref: 'r'.repeat(1024) }).success).toBe(
      true,
    )
    for (const reference of [
      { kind: '', ref: 'r' },
      { kind: 'k'.repeat(65), ref: 'r' },
      { kind: 'k', ref: '' },
      { kind: 'k', ref: 'r'.repeat(1025) },
      { kind: 'k', ref: 'r', extra: 1 },
    ])
      expect(referenceSchema.safeParse(reference).success).toBe(false)
  })

  it('has a pile with a name or none, and a sheet with edges and a grid', () => {
    const pile = { id: 'p1', name: null, at: { x: 8, y: 8 }, by: { kind: 'human' }, when: AT }
    expect(pileSchema.parse(pile)).toEqual(pile)
    expect(pileSchema.safeParse({ ...pile, name: '' }).success).toBe(false)
    expect(sheetSchema.safeParse({ width: 100, height: 100, grid: 0 }).success).toBe(false)
  })

  it('has a range of sizes with a least and a most, each a size', () => {
    const range = { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } }
    expect(sizeRangeSchema.parse(range)).toEqual(range)
    for (const broken of [
      { min: range.min },
      { ...range, max: { width: 0, height: 900 } },
      { ...range, step: 8 },
    ])
      expect(sizeRangeSchema.safeParse(broken).success).toBe(false)
  })
})

describe('the name of a kind', () => {
  it('is <domain>.<name> and at most 64 long', () => {
    expect(kindNameSchema.safeParse('media.object').success).toBe(true)
    for (const name of ['media', 'Media.object', 'media.object.x', `a.${'b'.repeat(63)}`])
      expect(kindNameSchema.safeParse(name).success).toBe(false)
  })

  it('names the canvas own kind canvas.app, declared without admit', () => {
    expect(CANVAS_APP).toBe('canvas.app')
    expect(canvasAppKind.name).toBe(CANVAS_APP)
    expect(kindNameSchema.safeParse(canvasAppKind.name).success).toBe(true)
    expect(canvasAppKind.admit).toBeUndefined()
    for (const text of [canvasAppKind.label, canvasAppKind.summary, canvasAppKind.reference])
      expect(text.length).toBeGreaterThan(0)
    expect(Object.isFrozen(canvasAppKind)).toBe(true)
  })
})

describe('reading a look', () => {
  it('takes the one canvas of the tenant', () => {
    expect(MAIN_CANVAS).toBe('main')
    expect(parseLook({ canvas: 'main' })).toEqual({ ok: { canvas: 'main' } })
  })

  it('names the canvas when it is another, and the request when anything else does not fit', () => {
    expect(parseLook({ canvas: 'second' })).toEqual({ invalid: 'canvas' })
    expect(parseLook({})).toEqual({ invalid: 'canvas' })
    expect(parseLook({ canvas: 'main', extra: true })).toEqual({ invalid: 'request' })
    expect(parseLook(null)).toEqual({ invalid: 'request' })
  })
})
