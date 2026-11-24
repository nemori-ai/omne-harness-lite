import { describe, expect, it } from 'vitest'

import {
  clampView,
  clampZoom,
  type Lens,
  type Magnet,
  moveBox,
  type PaperBox,
  type PaperCorner,
  paperToScreen,
  panBy,
  type PaperSheet,
  type PaperView,
  resizeBox,
  screenToPaper,
  type SizeLimits,
  snap,
  snapBox,
  type ZoomLimits,
  zoomAround,
} from '../src/paper/geometry.ts'

const RUNS = 400
const CORNERS: readonly PaperCorner[] = ['nw', 'ne', 'sw', 'se']

function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function cases(seed: number, check: (draw: Draw) => void): void {
  const random = generator(seed)
  const draw: Draw = {
    between: (low, high) => low + random() * (high - low),
    whole: (low, high) => Math.floor(low + random() * (high - low + 1)),
    pick: items => items[Math.floor(random() * items.length)]!,
  }
  for (let run = 0; run < RUNS; run += 1) check(draw)
}

interface Draw {
  readonly between: (low: number, high: number) => number
  readonly whole: (low: number, high: number) => number
  readonly pick: <T>(items: readonly T[]) => T
}

function sheetOf(draw: Draw): PaperSheet {
  const step = draw.pick([4, 8, 10, 16])
  return { width: step * draw.whole(40, 400), height: step * draw.whole(40, 300), step }
}

function limitsOf(draw: Draw, sheet: PaperSheet): SizeLimits {
  const minWidth = sheet.step * draw.whole(2, 10)
  const minHeight = sheet.step * draw.whole(2, 10)
  return {
    minWidth,
    minHeight,
    maxWidth: minWidth + sheet.step * draw.whole(0, 60),
    maxHeight: minHeight + sheet.step * draw.whole(0, 60),
  }
}

function boxOf(draw: Draw, sheet: PaperSheet): PaperBox {
  return {
    x: draw.between(-200, sheet.width + 200),
    y: draw.between(-200, sheet.height + 200),
    width: draw.between(1, sheet.width / 2),
    height: draw.between(1, sheet.height / 2),
  }
}

function deltaOf(draw: Draw): { x: number; y: number } {
  return { x: draw.between(-3000, 3000), y: draw.between(-3000, 3000) }
}

const onGrid = (value: number, step: number): boolean =>
  Math.abs(value / step - Math.round(value / step)) < 1e-9

function expectOnPaper(box: PaperBox, sheet: PaperSheet): void {
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(sheet.width)
  expect(box.y + box.height).toBeLessThanOrEqual(sheet.height)
  for (const value of [box.x, box.y, box.width, box.height])
    expect(Number.isInteger(value)).toBe(true)
}

describe('the magnet', () => {
  it('hands any value and any box back as they were when it is off', () => {
    cases(1, draw => {
      const off: Magnet = { on: false, step: draw.pick([0, 4, 8, 16]) }
      const value = draw.between(-1e6, 1e6)
      expect(snap(value, off)).toBe(value)
      const box = boxOf(draw, sheetOf(draw))
      expect(snapBox(box, off)).toBe(box)
    })
  })

  it('puts the point and the size of the one gesture on the grid when it is on, and nothing more', () => {
    cases(2, draw => {
      const step = draw.pick([4, 8, 16, 24])
      const box = Object.freeze(boxOf(draw, sheetOf(draw)))
      const snapped = snapBox(box, { on: true, step })
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(onGrid(snapped[key], step)).toBe(true)
        expect(Math.abs(snapped[key] - box[key])).toBeLessThanOrEqual(step / 2)
      }
      expect(snapBox(snapped, { on: true, step })).toEqual(snapped)
    })
  })
})

describe('a move', () => {
  it('lands on the paper wherever it was dropped, on the grid when the magnet is on', () => {
    cases(3, draw => {
      const sheet = sheetOf(draw)
      const on = draw.pick([true, false])
      const start = {
        ...boxOf(draw, sheet),
        width: sheet.step * draw.whole(1, 20),
        height: sheet.step * draw.whole(1, 20),
      }
      const moved = moveBox(start, deltaOf(draw), sheet, { on, step: sheet.step })
      expectOnPaper(moved, sheet)
      expect([moved.width, moved.height]).toEqual([start.width, start.height])
      if (on) expect(onGrid(moved.x, sheet.step) && onGrid(moved.y, sheet.step)).toBe(true)
    })
  })

  it('goes exactly where it was dropped when the magnet is off and the drop is on the paper', () => {
    const sheet = { width: 1000, height: 800, step: 16 }
    const moved = moveBox({ x: 100, y: 100, width: 200, height: 100 }, { x: 37, y: -21 }, sheet, {
      on: false,
      step: 16,
    })
    expect(moved).toEqual({ x: 137, y: 79, width: 200, height: 100 })
  })

  it('keeps a page larger than the paper at the origin, so it is never lost', () => {
    const sheet = { width: 100, height: 80, step: 8 }
    const moved = moveBox({ x: 40, y: 40, width: 300, height: 200 }, { x: 500, y: 500 }, sheet, {
      on: true,
      step: 8,
    })
    expect(moved).toEqual({ x: 0, y: 0, width: 300, height: 200 })
  })
})

describe('a resize', () => {
  it('stays on the paper and in the limits from any corner, on the grid when the magnet is on', () => {
    cases(4, draw => {
      const sheet = sheetOf(draw)
      const limits = limitsOf(draw, sheet)
      const on = draw.pick([true, false])
      const start = boxOf(draw, sheet)
      const resized = resizeBox(start, draw.pick(CORNERS), deltaOf(draw), sheet, limits, {
        on,
        step: sheet.step,
      })
      expectOnPaper(resized, sheet)
      expect(resized.width).toBeGreaterThanOrEqual(limits.minWidth)
      expect(resized.width).toBeLessThanOrEqual(limits.maxWidth)
      expect(resized.height).toBeGreaterThanOrEqual(limits.minHeight)
      expect(resized.height).toBeLessThanOrEqual(limits.maxHeight)
      if (on)
        for (const value of [resized.x, resized.y, resized.width, resized.height])
          expect(onGrid(value, sheet.step)).toBe(true)
    })
  })

  it('keeps the opposite corner where it was when nothing forces it', () => {
    const sheet = { width: 1000, height: 800, step: 8 }
    const limits = { minWidth: 40, minHeight: 40, maxWidth: 600, maxHeight: 600 }
    const off = { on: false, step: 8 }
    const start = { x: 200, y: 200, width: 200, height: 100 }
    expect(resizeBox(start, 'se', { x: 30, y: 20 }, sheet, limits, off)).toEqual({
      x: 200,
      y: 200,
      width: 230,
      height: 120,
    })
    expect(resizeBox(start, 'nw', { x: -30, y: 20 }, sheet, limits, off)).toEqual({
      x: 170,
      y: 220,
      width: 230,
      height: 80,
    })
    expect(resizeBox(start, 'ne', { x: 10, y: -10 }, sheet, limits, off)).toEqual({
      x: 200,
      y: 190,
      width: 210,
      height: 110,
    })
    expect(resizeBox(start, 'sw', { x: 500, y: 0 }, sheet, limits, off)).toEqual({
      x: 360,
      y: 200,
      width: 40,
      height: 100,
    })
  })

  it('on a paper smaller than the least size, keeps the least size and sits at the origin', () => {
    const sheet = { width: 64, height: 48, step: 8 }
    const limits = { minWidth: 120, minHeight: 64, maxWidth: 900, maxHeight: 900 }
    for (const corner of CORNERS)
      expect(
        resizeBox(
          { x: 10, y: 10, width: 30, height: 30 },
          corner,
          { x: 400, y: -400 },
          sheet,
          limits,
          {
            on: true,
            step: 8,
          },
        ),
      ).toEqual({ x: 0, y: 0, width: 120, height: 64 })
  })
})

describe('the view', () => {
  function lensOf(draw: Draw): Lens {
    return {
      width: draw.between(0, 2400),
      height: draw.between(0, 1600),
      sizeFactor: draw.pick([0.75, 1, 1.25, 1.5]),
    }
  }
  const zoomLimits: ZoomLimits = { min: 0.5, max: 2 }

  function expectInside(view: PaperView, sheet: PaperSheet, lens: Lens): void {
    expect(view.zoom).toBeGreaterThanOrEqual(zoomLimits.min)
    expect(view.zoom).toBeLessThanOrEqual(zoomLimits.max)
    const seen = {
      width: lens.width / (view.zoom * lens.sizeFactor),
      height: lens.height / (view.zoom * lens.sizeFactor),
    }
    const tolerance = 1e-6
    if (seen.width <= sheet.width) {
      expect(view.x - seen.width / 2).toBeGreaterThanOrEqual(-tolerance)
      expect(view.x + seen.width / 2).toBeLessThanOrEqual(sheet.width + tolerance)
    } else {
      expect(view.x - seen.width / 2).toBeLessThanOrEqual(tolerance)
      expect(view.x + seen.width / 2).toBeGreaterThanOrEqual(sheet.width - tolerance)
    }
    if (seen.height <= sheet.height) {
      expect(view.y - seen.height / 2).toBeGreaterThanOrEqual(-tolerance)
      expect(view.y + seen.height / 2).toBeLessThanOrEqual(sheet.height + tolerance)
    }
  }

  it('keeps the zoom in its limits whatever it is asked, a broken number included', () => {
    cases(5, draw => {
      const asked = draw.pick([Number.NaN, Infinity, -Infinity, 0, -1, draw.between(-10, 10)])
      const zoom = clampZoom(asked, zoomLimits)
      expect(zoom).toBeGreaterThanOrEqual(zoomLimits.min)
      expect(zoom).toBeLessThanOrEqual(zoomLimits.max)
    })
  })

  it('never pans past the edge of the paper', () => {
    cases(6, draw => {
      const sheet = sheetOf(draw)
      const lens = lensOf(draw)
      const view = clampView(
        {
          x: draw.between(0, sheet.width),
          y: draw.between(0, sheet.height),
          zoom: draw.between(0.5, 2),
        },
        sheet,
        lens,
        zoomLimits,
      )
      expectInside(panBy(view, deltaOf(draw), sheet, lens, zoomLimits), sheet, lens)
      expectInside(
        clampView(
          { x: draw.between(-1e5, 1e5), y: Number.NaN, zoom: draw.between(-5, 5) },
          sheet,
          lens,
          zoomLimits,
        ),
        sheet,
        lens,
      )
    })
  })

  it('zooms around the pointer: the point of paper under it stays unless the edge holds the view', () => {
    cases(7, draw => {
      const sheet = sheetOf(draw)
      const lens = lensOf(draw)
      const view = clampView(
        {
          x: draw.between(0, sheet.width),
          y: draw.between(0, sheet.height),
          zoom: draw.between(0.5, 2),
        },
        sheet,
        lens,
        zoomLimits,
      )
      const at = { x: draw.between(0, lens.width), y: draw.between(0, lens.height) }
      const next = zoomAround(view, at, view.zoom * draw.between(0.3, 3), sheet, lens, zoomLimits)
      expectInside(next, sheet, lens)
      const before = screenToPaper(at, view, lens)
      const after = screenToPaper(at, next, lens)
      const free = clampView(
        {
          ...next,
          x: before.x - (at.x - lens.width / 2) / (next.zoom * lens.sizeFactor),
          y: before.y - (at.y - lens.height / 2) / (next.zoom * lens.sizeFactor),
        },
        sheet,
        lens,
        zoomLimits,
      )
      const heldX =
        Math.abs(free.x - (before.x - (at.x - lens.width / 2) / (next.zoom * lens.sizeFactor))) >
        1e-9
      const heldY =
        Math.abs(free.y - (before.y - (at.y - lens.height / 2) / (next.zoom * lens.sizeFactor))) >
        1e-9
      if (!heldX) expect(after.x).toBeCloseTo(before.x, 6)
      if (!heldY) expect(after.y).toBeCloseTo(before.y, 6)
    })
  })

  it('turns a paper point into a screen point and back', () => {
    cases(8, draw => {
      const lens = lensOf(draw)
      const view = {
        x: draw.between(0, 4000),
        y: draw.between(0, 4000),
        zoom: draw.between(0.5, 2),
      }
      const point = { x: draw.between(0, 4000), y: draw.between(0, 4000) }
      const back = screenToPaper(paperToScreen(point, view, lens), view, lens)
      expect(back.x).toBeCloseTo(point.x, 6)
      expect(back.y).toBeCloseTo(point.y, 6)
    })
    const screen = paperToScreen(
      { x: 150, y: 100 },
      { x: 100, y: 100, zoom: 2 },
      { width: 800, height: 600, sizeFactor: 1.25 },
    )
    expect(screen).toEqual({ x: 525, y: 300 })
  })
})
