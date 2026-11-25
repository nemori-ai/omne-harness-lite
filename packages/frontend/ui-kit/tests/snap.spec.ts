import { describe, expect, it } from 'vitest'

import {
  clampView,
  clampZoom,
  type Lens,
  type Magnet,
  moveBox,
  PAPER_NAME_LINE,
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
  spreadShift,
  type PaperRect,
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

function pageLimitsOf(draw: Draw, sheet: PaperSheet): SizeLimits {
  const limits = limitsOf(draw, sheet)
  return {
    ...limits,
    minHeight: limits.minHeight + PAPER_NAME_LINE,
    maxHeight: limits.maxHeight + PAPER_NAME_LINE,
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
      const limits = pageLimitsOf(draw, sheet)
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
        for (const value of [resized.x, resized.y, resized.width, resized.height - PAPER_NAME_LINE])
          expect(onGrid(value, sheet.step)).toBe(true)
    })
  })

  function pageOf(draw: Draw, sheet: PaperSheet, limits: SizeLimits): PaperBox {
    const width =
      sheet.step * draw.whole(limits.minWidth / sheet.step, limits.maxWidth / sheet.step)
    const content =
      sheet.step *
      draw.whole(
        (limits.minHeight - PAPER_NAME_LINE) / sheet.step,
        (limits.maxHeight - PAPER_NAME_LINE) / sheet.step,
      )
    const height = content + PAPER_NAME_LINE
    return {
      x: sheet.step * draw.whole(0, Math.max(0, Math.floor((sheet.width - width) / sheet.step))),
      y: sheet.step * draw.whole(0, Math.max(0, Math.floor((sheet.height - height) / sheet.step))),
      width,
      height,
    }
  }

  it('changes only the width when only the width is pulled, the magnet on or off', () => {
    cases(9, draw => {
      const sheet = { ...sheetOf(draw), width: 8000, height: 8000 }
      const limits = pageLimitsOf(draw, sheet)
      const start = pageOf(draw, sheet, limits)
      const by = { x: draw.pick([-1, 1]) * draw.pick([1, sheet.step, draw.between(0, 300)]), y: 0 }
      const resized = resizeBox(start, draw.pick(['se', 'ne'] as const), by, sheet, limits, {
        on: draw.pick([true, false]),
        step: sheet.step,
      })
      expect([resized.y, resized.height]).toEqual([start.y, start.height])
    })
  })

  it('changes only the height when only the height is pulled, the magnet on or off', () => {
    cases(10, draw => {
      const sheet = { ...sheetOf(draw), width: 8000, height: 8000 }
      const limits = pageLimitsOf(draw, sheet)
      const start = pageOf(draw, sheet, limits)
      const by = { x: 0, y: draw.pick([-1, 1]) * draw.pick([1, sheet.step, draw.between(0, 300)]) }
      const resized = resizeBox(start, draw.pick(['se', 'sw'] as const), by, sheet, limits, {
        on: draw.pick([true, false]),
        step: sheet.step,
      })
      expect([resized.x, resized.width]).toEqual([start.x, start.width])
    })
  })

  it('with the magnet on, puts the content of a page on the grid, the name line under it left out', () => {
    cases(11, draw => {
      const sheet = sheetOf(draw)
      const limits = pageLimitsOf(draw, sheet)
      const start = boxOf(draw, sheet)
      const resized = resizeBox(start, draw.pick(CORNERS), deltaOf(draw), sheet, limits, {
        on: true,
        step: sheet.step,
      })
      expect(onGrid(resized.width, sheet.step)).toBe(true)
      expect(onGrid(resized.height - PAPER_NAME_LINE, sheet.step)).toBe(true)
      expect(onGrid(resized.y, sheet.step)).toBe(true)
    })
    const page = { x: 80, y: 80, width: 160, height: 120 + PAPER_NAME_LINE }
    const sheet = { width: 1000, height: 800, step: 8 }
    const limits = { minWidth: 40, minHeight: 40, maxWidth: 600, maxHeight: 600 }
    expect(resizeBox(page, 'se', { x: 8, y: 0 }, sheet, limits, { on: true, step: 8 })).toEqual({
      ...page,
      width: 168,
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

describe('the spread of an open pile', () => {
  const inside = (rect: PaperRect, view: PaperRect): boolean =>
    rect.left >= view.left - 1e-9 &&
    rect.top >= view.top - 1e-9 &&
    rect.left + rect.width <= view.left + view.width + 1e-9 &&
    rect.top + rect.height <= view.top + view.height + 1e-9
  const moved = (rect: PaperRect, by: { x: number; y: number }): PaperRect => ({
    ...rect,
    left: rect.left + by.x,
    top: rect.top + by.y,
  })

  it('stays where it is drawn when it fits; else lies inside the view whenever it fits there', () => {
    cases(12, draw => {
      const view = {
        left: 0,
        top: 0,
        width: draw.between(400, 2000),
        height: draw.between(300, 1200),
      }
      const anchor = {
        left: draw.between(-100, view.width + 100),
        top: draw.between(-100, view.height + 100),
        width: draw.between(40, 300),
        height: 22,
      }
      const gap = 4
      const spread = {
        left: anchor.left,
        top: anchor.top + anchor.height + gap,
        width: draw.between(50, view.width),
        height: draw.between(50, view.height),
      }
      const by = spreadShift(anchor, spread, view)
      if (inside(spread, view)) expect(by).toEqual({ x: 0, y: 0 })
      expect(inside(moved(spread, by), view)).toBe(true)
    })
  })

  it('opens leftward from the right edge of the pile near the right of the view, and upward near the bottom', () => {
    const view = { left: 0, top: 0, width: 1000, height: 800 }
    const anchor = { left: 800, top: 700, width: 160, height: 22 }
    const spread = { left: 800, top: 726, width: 600, height: 300 }
    expect(moved(spread, spreadShift(anchor, spread, view))).toEqual({
      ...spread,
      left: 360,
      top: 700 - 4 - 300,
    })
  })
})
