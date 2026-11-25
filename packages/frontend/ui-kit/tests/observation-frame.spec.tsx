// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ObservationFrame } from '../src/index.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { bareSides, FRAME, frameLines, frameWriteTime, type Side } from '../src/ink/observation.ts'
import { type Box } from '../src/ink/travel.ts'

const STYLES = readFileSync(join(import.meta.dirname, '../src/ink/ink.css'), 'utf8')
const RECT: Box = { x: 100, y: 100, width: 400, height: 300 }
const FIGURE: Box = { x: 72, y: 222, width: 56, height: 56 }

type Point = readonly [number, number]

const lineOf = (side: Side): { at: number; from: number; to: number } =>
  side === 'top'
    ? { at: 100, from: 100, to: 500 }
    : side === 'bottom'
      ? { at: 400, from: 100, to: 500 }
      : side === 'left'
        ? { at: 100, from: 100, to: 400 }
        : { at: 500, from: 100, to: 400 }

const across = (side: Side, from: number, to: number, depth = 20): Box => {
  const { at } = lineOf(side)
  return side === 'top' || side === 'bottom'
    ? { x: from, y: at - depth, width: to - from, height: depth * 2 }
    : { x: at - depth, y: from, width: depth * 2, height: to - from }
}

describe('which stretches of each side are bare (FE-I67)', () => {
  const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

  it.each(SIDES)('%s, not covered: the whole side', side => {
    const { from, to } = lineOf(side)
    expect(bareSides(RECT, [], 0)[side]).toEqual([{ from, to }])
  })

  it.each(SIDES)('%s, covered in the middle: the two ends', side => {
    const { from, to } = lineOf(side)
    expect(bareSides(RECT, [across(side, 200, 260)], 0)[side]).toEqual([
      { from, to: 200 },
      { from: 260, to },
    ])
  })

  it.each(SIDES)('%s, covered at one end: the rest', side => {
    const { from, to } = lineOf(side)
    expect(bareSides(RECT, [across(side, 0, 160)], 0)[side]).toEqual([{ from: 160, to }])
    expect(bareSides(RECT, [across(side, 340, 900)], 0)[side]).toEqual([{ from, to: 340 }])
  })

  it.each(SIDES)('%s, covered whole: nothing', side => {
    expect(bareSides(RECT, [across(side, 0, 900)], 0)[side]).toEqual([])
  })

  it.each(SIDES)('%s, two boxes over two stretches: three stretches', side => {
    const { from, to } = lineOf(side)
    expect(bareSides(RECT, [across(side, 300, 350), across(side, 150, 200)], 0)[side]).toEqual([
      { from, to: 150 },
      { from: 200, to: 300 },
      { from: 350, to },
    ])
  })

  it('a box that covers one side leaves the others whole', () => {
    const bare = bareSides(RECT, [across('top', 200, 260)], 0)
    expect(bare.bottom).toEqual([{ from: 100, to: 500 }])
    expect(bare.left).toEqual([{ from: 100, to: 400 }])
    expect(bare.right).toEqual([{ from: 100, to: 400 }])
  })

  it('a box just outside the side covers the outer edge of the stroke: within the reach it hides it, beyond it it does not', () => {
    const above = (gap: number): Box => ({ x: 200, y: 100 - gap - 50, width: 60, height: 50 })
    expect(bareSides(RECT, [above(2)], 3).top).toEqual([
      { from: 100, to: 197 },
      { from: 263, to: 500 },
    ])
    expect(bareSides(RECT, [above(4)], 3).top).toEqual([{ from: 100, to: 500 }])
  })
})

const EPSILON = 1e-6

const inside = ([x, y]: Point, box: Box): boolean =>
  x > box.x + EPSILON &&
  x < box.x + box.width - EPSILON &&
  y > box.y + EPSILON &&
  y < box.y + box.height - EPSILON

describe('the stroke round the rectangle', () => {
  const centre: Point = [FIGURE.x + 28, FIGURE.y + 28]
  const perimeter = 2 * (400 - 20 + 300 - 20) + Math.PI * 20

  it('is one stroke from the mouth round to the mouth; the mouth is the gap on the side nearest the figure', () => {
    const lines = frameLines({ rect: RECT, covered: [], figure: centre })
    expect(lines.runs).toHaveLength(1)
    expect(lines.length).toBeCloseTo(perimeter - FRAME.mouth, 6)
    const run = lines.runs[0]!
    const [start, end] = [run.points[0]!, run.points.at(-1)!]
    expect(start[0]).toBeCloseTo(100, 6)
    expect(end[0]).toBeCloseTo(100, 6)
    expect(Math.abs(start[1] - end[1])).toBeCloseTo(FRAME.mouth, 0)
    expect((start[1] + end[1]) / 2).toBeCloseTo(250, 0)
    expect(lines.mouth).toHaveLength(1)
    expect(lines.mouth[0]!.points.every(([x]) => Math.abs(x - 100) < 1e-6)).toBe(true)
  })

  it('a box over the middle of the far side splits it into two stretches, none of them under the box', () => {
    const box = across('right', 200, 260)
    const lines = frameLines({ rect: RECT, covered: [box], figure: centre, reach: 0 })
    expect(lines.runs).toHaveLength(2)
    expect(lines.runs.flatMap(run => run.points).some(point => inside(point, box))).toBe(false)
  })

  it.each(['top', 'bottom', 'left'] as const)(
    'a box over a stretch of the %s side: no point of the stroke under it',
    side => {
      const box = across(side, side === 'left' ? 120 : 300, side === 'left' ? 160 : 360)
      const lines = frameLines({ rect: RECT, covered: [box], figure: centre, reach: 0 })
      expect(lines.runs).toHaveLength(2)
      expect(lines.runs.flatMap(run => run.points).some(point => inside(point, box))).toBe(false)
      const drawn = lines.runs.reduce((sum, run) => sum + run.along.at(-1)! - run.along[0]!, 0)
      expect(drawn).toBeCloseTo(lines.length - (side === 'left' ? 40 : 60), 6)
    },
  )

  it('a box over the corner hides the corner with both sides near it', () => {
    const corner: Box = { x: 450, y: 50, width: 100, height: 100 }
    const lines = frameLines({ rect: RECT, covered: [corner], figure: centre, reach: 0 })
    expect(lines.runs).toHaveLength(2)
    expect(lines.runs.flatMap(run => run.points).some(point => inside(point, corner))).toBe(false)
  })

  it('a box over the whole rectangle leaves nothing to draw', () => {
    const lines = frameLines({
      rect: RECT,
      covered: [{ x: 0, y: 0, width: 1000, height: 1000 }],
      figure: centre,
    })
    expect(lines.runs).toEqual([])
    expect(lines.mouth).toEqual([])
  })

  it('takes 260 + 0.11 × the perimeter, held to 520 and 1200, give or take a tenth', () => {
    const spread: number[] = []
    const exact = (value: number, by: number): number => {
      spread.push(by)
      return value
    }
    expect(frameWriteTime({ x: 0, y: 0, width: 100, height: 100 }, exact)).toBe(520)
    expect(frameWriteTime({ x: 0, y: 0, width: 1000, height: 600 }, exact)).toBeCloseTo(612, 6)
    expect(frameWriteTime({ x: 0, y: 0, width: 3000, height: 2000 }, exact)).toBe(1200)
    expect(spread).toEqual([0.1, 0.1, 0.1])
  })
})

interface Clock {
  readonly wait: (ms: number) => void
  readonly pending: () => number
}

function frameClock(): Clock {
  let frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next += 1
    frames.set(next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  inkClock.use(() => Date.now())
  casual.use(() => 0.5)
  return {
    wait(ms) {
      act(() => {
        for (let i = 0; i < ms; i += 1) {
          vi.advanceTimersByTime(1)
          const due = frames
          frames = new Map()
          for (const callback of due.values()) callback(Date.now())
        }
      })
    },
    pending: () => frames.size,
  }
}

afterEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  cleanup()
  document.body.innerHTML = ''
  casual.use(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

type Props = ComponentProps<typeof ObservationFrame>

const frames = (): SVGSVGElement[] => [
  ...document.querySelectorAll<SVGSVGElement>('.omne-observation-frame'),
]
const parts = (frame: Element, part: 'edge' | 'mouth'): SVGPathElement[] => [
  ...frame.querySelectorAll<SVGPathElement>(`path[data-part='${part}']`),
]

function pointsOf(path: SVGPathElement): Point[] {
  const numbers = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const points: Point[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i]!, numbers[i + 1]!])
  return points
}

const WRITTEN = 1200 + FRAME.settle.duration + 50

function show(props: Partial<Props> = {}): (next: Partial<Props>) => void {
  const base: Props = { rect: RECT, covered: [], figure: FIGURE, ...props }
  const view = render(<ObservationFrame {...base} />)
  return next => view.rerender(<ObservationFrame {...base} {...next} />)
}

describe('the frame on the screen (FE-I67)', () => {
  it('is written along the rectangle, settles to 0.86 and then asks for no frame', () => {
    const time = frameClock()
    show()
    const [frame] = frames()
    expect(frame?.dataset['state']).toBe('writing')
    time.wait(WRITTEN)
    expect(frame?.dataset['state']).toBe('open')
    expect(frame?.style.opacity).toBe(String(FRAME.settle.to))
    expect(parts(frame!, 'edge')).toHaveLength(1)
    expect(parts(frame!, 'edge')[0]!.getAttribute('d')).not.toBe('')
    expect(time.pending()).toBe(0)
  })

  it('draws nothing on the stretches the covering boxes hide', () => {
    const time = frameClock()
    const box = across('right', 200, 260)
    show({ covered: [box] })
    time.wait(WRITTEN)
    const edges = parts(frames()[0]!, 'edge')
    expect(edges).toHaveLength(2)
    const hidden: Box = { x: box.x, y: box.y + 4, width: box.width, height: box.height - 8 }
    expect(edges.flatMap(pointsOf).some(point => inside(point, hidden))).toBe(false)
  })

  it('a covering box that moves takes its stretch with it, on the same frame', () => {
    const time = frameClock()
    const again = show({ covered: [across('right', 200, 260)] })
    time.wait(WRITTEN)
    const [frame] = frames()
    again({ covered: [] })
    expect(frames()).toEqual([frame])
    expect(parts(frame!, 'edge')).toHaveLength(1)
  })

  it('closed writes the mouth shut; open again it is gone', () => {
    const time = frameClock()
    const again = show()
    time.wait(WRITTEN)
    const [frame] = frames()
    expect(frame?.dataset['closed']).toBe('false')
    expect(parts(frame!, 'mouth')).toHaveLength(0)
    again({ closed: true })
    time.wait(FRAME.close + 50)
    expect(frame?.dataset['closed']).toBe('true')
    expect(parts(frame!, 'mouth')).toHaveLength(1)
    expect(parts(frame!, 'mouth')[0]!.getAttribute('d')).not.toBe('')
    again({ closed: false })
    expect(parts(frame!, 'mouth')).toHaveLength(0)
  })

  it('a new rectangle: the old frame stays where it was and dries, a new one is written; nothing slides', () => {
    const time = frameClock()
    const again = show()
    time.wait(WRITTEN)
    const [old] = frames()
    const left = old!.style.left
    const moved: Box = { x: 600, y: 120, width: 300, height: 200 }
    again({ rect: moved })
    const [still, fresh] = frames()
    expect(still).toBe(old)
    expect(still?.style.left).toBe(left)
    expect(still?.dataset['state']).toBe('drying')
    expect(fresh?.dataset['state']).toBe('writing')
    expect(fresh?.style.left).not.toBe(left)
    time.wait(FRAME.dry + 20)
    expect(frames()).toEqual([fresh])
  })

  it('the same rectangle given again is the same frame', () => {
    const time = frameClock()
    const again = show()
    time.wait(100)
    const [frame] = frames()
    again({ rect: { ...RECT } })
    expect(frames()).toEqual([frame])
    expect(frame?.dataset['state']).toBe('writing')
  })

  it('no rectangle: the frame dries and is gone', () => {
    const time = frameClock()
    const again = show()
    time.wait(WRITTEN)
    again({ rect: null })
    expect(frames()[0]?.dataset['state']).toBe('drying')
    time.wait(FRAME.dry + 20)
    expect(frames()).toEqual([])
    expect(time.pending()).toBe(0)
  })

  it('under reduced motion it is there at once, and a new rectangle replaces it at once', () => {
    const time = frameClock()
    const again = show({ reduced: true })
    const [frame] = frames()
    expect(frame?.dataset['state']).toBe('open')
    expect(frame?.style.opacity).toBe(String(FRAME.settle.to))
    expect(parts(frame!, 'edge')[0]!.getAttribute('d')).not.toBe('')
    again({ rect: { x: 600, y: 120, width: 300, height: 200 }, closed: true })
    const after = frames()
    expect(after).toHaveLength(1)
    expect(after[0]).not.toBe(frame)
    expect(after[0]?.dataset['state']).toBe('open')
    expect(parts(after[0]!, 'mouth')[0]!.getAttribute('d')).not.toBe('')
    expect(time.pending()).toBe(0)
  })

  it('lays a wash inside the rectangle, masked where the covering boxes are; it is stronger when closed', () => {
    const hidden: Box = { x: RECT.x + 40, y: RECT.y + 30, width: 120, height: 90 }
    const again = show({ covered: [hidden] })
    const wash = frames()[0]!.querySelector<SVGRectElement>("rect[data-part='wash']")!
    expect(Number(wash.getAttribute('x'))).toBe(RECT.x + 4)
    expect(Number(wash.getAttribute('width'))).toBe(RECT.width - 8)
    const id = /url\(#(.+)\)/.exec(wash.getAttribute('mask') ?? '')?.[1]
    const holes = [...document.getElementById(id!)!.querySelectorAll("rect[fill='black']")]
    expect(holes.map(each => Number(each.getAttribute('x')))).toEqual([hidden.x])
    expect(holes.map(each => Number(each.getAttribute('width')))).toEqual([hidden.width])
    again({ covered: [] })
    expect(document.getElementById(id!)!.querySelectorAll("rect[fill='black']")).toHaveLength(0)
    const rules = STYLES.split('}')
    const plain = rules.find(text => /^\s*\.omne-observation-frame-wash\s*\{/.test(text))
    const shut = rules.find(text =>
      text.includes("[data-closed='true'] .omne-observation-frame-wash"),
    )
    expect(plain).toMatch(/--omne-info-fill\) 55%/)
    expect(shut).toMatch(/--omne-info-fill\) 90%/)
  })

  it('takes no pointer and keeps the paper breath round its ink', () => {
    show()
    const rule = STYLES.split('}').find(text => /\.omne-observation-frame\s*\{/.test(text))
    expect(rule).toMatch(/pointer-events:\s*none/)
    expect(rule).toMatch(/filter:\s*drop-shadow/)
  })
})
