// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { brushTime } from '../src/ink/body.ts'
import { inkClock } from '../src/ink/clock.ts'
import { CANVAS } from '../src/ink/ink.ts'
import { brushedOf } from '../src/ink/ink-canvas.ts'
import { Journeys, type Remnant } from '../src/ink/travel.ts'

const SIZE = 56
let now = 0
let frames: FrameRequestCallback[] = []

beforeEach(() => {
  now = 0
  frames = []
  inkClock.use(() => now)
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => frames.push(run))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  inkClock.use(null)
  vi.unstubAllGlobals()
})

function at(time: number): void {
  now = time
  const due = frames
  frames = []
  for (const run of due) run(time)
}

/** Where the brush's head is on the screen (px) for how far the stroke is written. */
function head(remnant: Remnant): number {
  const mark = remnant.frame.marks[0]!
  const brushed = brushedOf(mark.stroke)
  const k = Math.min(
    brushed.x.length - 1,
    brushed.zero + Math.floor((remnant.written * brushed.length) / brushed.spacing),
  )
  return (brushed.x[k]! * SIZE) / CANVAS
}

describe('the brush that carries the edge of a face', () => {
  it('keeps its head at the fold on the one clock, then takes hold at the far edge without coming down', () => {
    const journeys = new Journeys(SIZE)
    let remnants: readonly Remnant[] = []
    journeys.subscribe(next => (remnants = next))
    const reached = vi.fn()
    const landed = vi.fn()
    const [from, to, start, ms] = [6, 1194, 100, 600]
    journeys.go({
      left: null,
      at: { x: from, y: 300 },
      from: { point: { x: from, y: 300 }, heading: [1, 0] },
      to: { point: { x: to, y: 300 }, heading: [1, 0] },
      weight: 1,
      seed: 7,
      land: landed,
      duration: ms,
      start,
      reached,
      along: { from, to },
    })
    at(start)
    const carried = remnants.at(-1)!
    const spacing = (brushedOf(carried.frame.marks[0]!.stroke).spacing * SIZE) / CANVAS
    for (const time of [130, 250, 400, 520, 640]) {
      at(time)
      const fold = from + (to - from) * brushTime((time - start) / ms)
      expect(Math.abs(head(carried) - fold), `at ${time}`).toBeLessThanOrEqual(spacing)
    }
    expect(reached).not.toHaveBeenCalled()
    at(start + ms)
    expect(reached).toHaveBeenCalledTimes(1)
    expect(landed).not.toHaveBeenCalled()
    expect(journeys.travelling).toBe(true)
    at(start + ms + 500)
    expect(journeys.travelling, 'held until taken on or ended').toBe(true)
    journeys.end(false)
    expect(landed).toHaveBeenCalledWith(false)
    expect(journeys.travelling).toBe(false)
  })
})
