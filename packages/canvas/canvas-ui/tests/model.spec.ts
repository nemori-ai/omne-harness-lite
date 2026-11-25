import { PAPER_NAME_LINE } from '@omne-harness/ui-kit'
import { describe, expect, it } from 'vitest'
import { keptView, magnetText, type CanvasPreferences } from '../src/model/preferences.ts'
import { fitSize, holds, pileBox } from '../src/model/sheet.ts'
import { canvas, pile, SHEET } from './fixtures/canvas.tsx'

const holding = (view: string): CanvasPreferences => ({
  read: name => (name === 'view' ? view : null),
  write: () => undefined,
})

describe('the view this device kept', () => {
  it('is a view only when its centre is two numbers and its zoom a number above nought', () => {
    expect(keptView(holding('{"x":10,"y":20,"zoom":0.5}'))).toEqual({ x: 10, y: 20, zoom: 0.5 })
    for (const text of [
      '{"x":"10","y":20,"zoom":1}',
      '{"x":10,"y":"20","zoom":1}',
      '{"x":10,"y":20,"zoom":"1"}',
      '{"x":1e999,"y":20,"zoom":1}',
      '{"x":10,"y":20}',
      '{"x":10,"y":20,"zoom":0}',
      '{"x":10,"y":20,"zoom":-1}',
    ])
      expect(keptView(holding(text)), text).toBeUndefined()
  })

  it('keeps the magnet as the words on and off', () => {
    expect(magnetText(true)).toBe('on')
    expect(magnetText(false)).toBe('off')
  })
})

describe('the box of a pile', () => {
  it('is the footprint, with the name line under it', () => {
    const sheet = { ...SHEET, step: SHEET.grid }
    expect(pileBox(pile('p', { at: { x: 40, y: 40 } }), sheet)).toEqual({
      x: 40,
      y: 40,
      width: SHEET.footprint.width,
      height: SHEET.footprint.height + PAPER_NAME_LINE,
    })
  })
})

describe('a size a picker or an intake gave', () => {
  const limited = (grid: number, min: number, max: number) => {
    const body = canvas([])
    return {
      ...body,
      sheet: {
        ...body.sheet,
        grid,
        size: { min: { width: min, height: min }, max: { width: max, height: max } },
      },
    }
  }

  it('lands on the grid lines inside limits that are not on the grid', () => {
    const body = limited(8, 100, 300)
    expect(fitSize({ width: 50, height: 1000 }, body)).toEqual({ width: 104, height: 296 })
  })

  it('keeps to the limits when no grid line lies between them', () => {
    expect(fitSize({ width: 101, height: 0 }, limited(8, 100, 103))).toEqual({
      width: 103,
      height: 100,
    })
  })

  it('is the one grid line when only one lies between the limits', () => {
    expect(fitSize({ width: 200, height: 0 }, limited(8, 100, 110))).toEqual({
      width: 104,
      height: 104,
    })
  })

  it('is a whole number inside the limits when the sheet has no grid', () => {
    expect(fitSize({ width: 150.4, height: 1000 }, limited(0, 100, 300))).toEqual({
      width: 150,
      height: 300,
    })
  })
})

describe('whether a box holds a point', () => {
  const box = { x: 100, y: 100, width: 50, height: 40 }

  it('holds a point inside it, and none beside it on any side', () => {
    expect(holds(box, { x: 120, y: 120 })).toBe(true)
    expect(holds(box, { x: 99, y: 120 })).toBe(false)
    expect(holds(box, { x: 151, y: 120 })).toBe(false)
    expect(holds(box, { x: 120, y: 99 })).toBe(false)
    expect(holds(box, { x: 120, y: 141 })).toBe(false)
  })
})
