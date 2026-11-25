import { describe, expect, it } from 'vitest'

import {
  clampView,
  moveBox,
  PAPER_NAME_LINE,
  panBy,
  resizeBox,
  snap,
  snapBox,
  spreadShift,
} from '../src/paper/geometry.ts'
import { capture, pastSlop, SLOP } from '../src/paper/pointer.ts'

const SHEET = { width: 100, height: 100, step: 8 }
const LIMITS = { minWidth: 10, minHeight: 10 + PAPER_NAME_LINE, maxWidth: 500, maxHeight: 500 }

describe('a gesture with the magnet off', () => {
  const off = { on: false, step: 8 }

  it('reaches the edge of the paper, not the last grid line before it', () => {
    expect(
      moveBox({ x: 10, y: 10, width: 30, height: 30 }, { x: 500, y: 500 }, SHEET, off),
    ).toEqual({ x: 70, y: 70, width: 30, height: 30 })
  })
})

describe('a resize from one corner', () => {
  const off = { on: false, step: 8 }

  it('keeps the opposite edges where they are and stops at the edge of the paper', () => {
    const box = { x: 60, y: 50, width: 20, height: 20 + PAPER_NAME_LINE }
    expect(resizeBox(box, 'se', { x: 500, y: 0 }, SHEET, LIMITS, off)).toEqual({
      ...box,
      width: 40,
    })
  })
})

describe('the view of a paper larger than the lens', () => {
  const lens = { width: 200, height: 100, sizeFactor: 1 }
  const sheet = { width: 1000, height: 500, step: 8 }
  const limits = { min: 0.5, max: 4 }

  it('stops panning where the far edge of the paper meets the edge of the lens', () => {
    const far = clampView({ x: 5000, y: 5000, zoom: 1 }, sheet, lens, limits)
    expect(far).toEqual({ x: 900, y: 450, zoom: 1 })
  })

  it('pans by the screen distance over the zoom', () => {
    const view = { x: 500, y: 250, zoom: 2 }
    expect(panBy(view, { x: 100, y: 40 }, sheet, lens, limits)).toEqual({ x: 450, y: 230, zoom: 2 })
  })

  it('keeps a zoom it is given that is no number to its limits, and a centre that is no number on the paper', () => {
    const view = clampView({ x: Number.NaN, y: Number.NaN, zoom: Number.NaN }, sheet, lens, {
      min: 2,
      max: 4,
    })
    expect(view.zoom).toBeGreaterThanOrEqual(2)
    expect(view.zoom).toBeLessThanOrEqual(4)
    expect(Number.isFinite(view.x) && Number.isFinite(view.y)).toBe(true)
  })
})

describe('a magnet with no grid to keep to', () => {
  const none = { on: true, step: 0 }

  it('leaves a value and a box as they are', () => {
    expect(snap(13.4, none)).toBe(13.4)
    expect(snap(13.4, { on: true, step: -8 })).toBe(13.4)
    const box = { x: 10.5, y: 3, width: 30, height: 30 }
    expect(snapBox(box, none)).toBe(box)
    expect(snapBox(box, { on: true, step: -8 })).toBe(box)
  })

  it('still lands a gesture on the paper, in whole units', () => {
    expect(
      moveBox({ x: 10, y: 10, width: 30, height: 30 }, { x: 3.4, y: 500 }, SHEET, none),
    ).toEqual({
      x: 13,
      y: 70,
      width: 30,
      height: 30,
    })
    const box = { x: 60, y: 50, width: 20, height: 20 + PAPER_NAME_LINE }
    expect(resizeBox(box, 'se', { x: 500, y: 0 }, SHEET, LIMITS, none)).toEqual({
      ...box,
      width: 40,
    })
  })

  it('keeps to the paper as no magnet does, even for a box whose size is not whole', () => {
    const box = { x: 10, y: 10, width: 30.5, height: 30.5 }
    const off = { on: false, step: 8 }
    const far = { x: 500, y: 500 }
    expect(moveBox(box, far, SHEET, none)).toEqual(moveBox(box, far, SHEET, off))
    expect(moveBox(box, far, SHEET, off)).toMatchObject({ x: 69, y: 69 })
  })
})

describe('the view through a lens that gives no size factor', () => {
  const sheet = { width: 1000, height: 500, step: 8 }
  const limits = { min: 0.5, max: 4 }

  it.each([0, -1])(
    'with a factor of %i, is kept on the paper as at a factor of one',
    sizeFactor => {
      const lens = { width: 200, height: 100, sizeFactor }
      expect(clampView({ x: 5000, y: -5000, zoom: 1 }, sheet, lens, limits)).toEqual({
        x: 900,
        y: 50,
        zoom: 1,
      })
    },
  )
})

describe('the view of a paper smaller than the lens', () => {
  const lens = { width: 2000, height: 1000, sizeFactor: 1 }
  const sheet = { width: 1000, height: 500, step: 8 }
  const limits = { min: 1, max: 4 }

  it('moves freely as long as the whole paper stays in the lens', () => {
    expect(clampView({ x: 300, y: 400, zoom: 1 }, sheet, lens, limits)).toEqual({
      x: 300,
      y: 400,
      zoom: 1,
    })
  })

  it('stops where an edge of the paper meets the edge of the lens', () => {
    expect(clampView({ x: -500, y: 900, zoom: 1 }, sheet, lens, limits)).toEqual({
      x: 0,
      y: 500,
      zoom: 1,
    })
  })
})

describe('the spread of an open pile', () => {
  it('stays where it is drawn when it ends exactly at the edge of the view', () => {
    const view = { left: 0, top: 0, width: 1000, height: 800 }
    const anchor = { left: 400, top: 474, width: 160, height: 22 }
    const spread = { left: 400, top: 500, width: 600, height: 300 }
    expect(spreadShift(anchor, spread, view)).toEqual({ x: 0, y: 0 })
  })
})

describe('a press that moves', () => {
  it('is a drag only once it has moved past the slop, not at it', () => {
    expect(pastSlop(SLOP, 0)).toBe(false)
    expect(pastSlop(0, SLOP + 0.01)).toBe(true)
  })
})

describe('holding the pointer for a gesture', () => {
  const element = (fails?: Error) => {
    const held: number[] = []
    const made = {
      setPointerCapture(pointer: number) {
        if (fails !== undefined) throw fails
        held.push(pointer)
      },
    }
    return { held, element: made as unknown as Element }
  }

  it('captures the pointer on the element', () => {
    const made = element()
    capture(made.element, 7)
    expect(made.held).toEqual([7])
  })

  it('goes on when the pointer is already gone, and lets any other failure through', () => {
    expect(() =>
      capture(element(new DOMException('gone', 'NotFoundError')).element, 7),
    ).not.toThrow()
    expect(() => capture(element(new TypeError('broken')).element, 7)).toThrow('broken')
  })
})
