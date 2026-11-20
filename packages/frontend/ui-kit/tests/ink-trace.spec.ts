// @vitest-environment happy-dom
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FigureBody } from '../src/ink/body.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock, inkNow } from '../src/ink/clock.ts'
import { DoingPolicy } from '../src/ink/doing.ts'
import { FigureInk } from '../src/ink/figure-ink.tsx'
import { FigureJourneys } from '../src/ink/figure-journeys.tsx'
import { InkBubble } from '../src/ink/ink-bubble.tsx'
import { InkCanvas, type InkFrame } from '../src/ink/ink-canvas.ts'
import { Journeys, type Remnant } from '../src/ink/travel.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures/ink-trace')
const SEEDING = process.env['INK_TRACE_SEED'] === '1'

type Sample = readonly [number, number]

interface Series {
  readonly samples: Sample[]
}

interface MarkTrace {
  readonly canvas: number
  readonly key: number
  readonly tone: string
  readonly weight: number
  readonly ink: number
  readonly points: readonly (readonly [number, number])[]
  readonly written: Series
  readonly opacity: Series
  readonly tail: Series
}

interface RemnantTrace {
  readonly order: number
  readonly origin: readonly [number, number]
  readonly area: readonly [number, number, number, number]
  readonly size: number
  readonly written: Series
  readonly opacity: Series
}

const round = (value: number, places: number): number => {
  const scale = 10 ** places
  const rounded = Math.round(value * scale) / scale
  return Object.is(rounded, -0) ? 0 : rounded
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sign = (value: number): number => (value > 0 ? 1 : value < 0 ? -1 : 0)

function bends(samples: readonly Sample[]): Sample[] {
  const run = (i: number): number => sign(samples[i]![1] - samples[i - 1]![1])
  const kept: Sample[] = []
  for (let i = 0; i < samples.length; i += 1) {
    const last = samples.length - 1
    const ends = i === 0 || i === last
    const opens = i >= 2 && run(i) !== run(i - 1)
    const closes = i >= 1 && i < last && run(i) !== run(i + 1)
    if (ends || opens || closes) kept.push([samples[i]![0], round(samples[i]![1], 4)])
  }
  return kept
}

const push = (series: Series, at: number, value: number): void => {
  const last = series.samples[series.samples.length - 1]
  if (last !== undefined && last[0] === at) series.samples[series.samples.length - 1] = [at, value]
  else series.samples.push([at, value])
}

function recordingContext(calls: Map<string, number>): CanvasRenderingContext2D {
  const count = (name: string) => (): undefined => {
    calls.set(name, (calls.get(name) ?? 0) + 1)
    return undefined
  }
  const gradient = { addColorStop: count('addColorStop') }
  const making = (name: string) => (): typeof gradient => {
    count(name)()
    return gradient
  }
  const target: Record<string, unknown> = {
    createRadialGradient: making('createRadialGradient'),
    createLinearGradient: making('createLinearGradient'),
  }
  return new Proxy(target, {
    get(object, name) {
      if (typeof name !== 'string') return undefined
      if (name in object) return object[name]
      const method = count(name)
      object[name] = method
      return method
    },
    set(object, name, value) {
      if (typeof name === 'string' && !(name in object && typeof object[name] === 'function'))
        object[name] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

interface Trace {
  readonly marks: MarkTrace[]
  readonly wash: Sample[]
  readonly remnants: RemnantTrace[]
  readonly paper: { readonly ink: string; readonly samples: Sample[] }[]
  readonly calls: Record<string, number>
}

class Recorder {
  public readonly marks = new Map<string, MarkTrace>()
  public readonly wash: Series = { samples: [] }
  public readonly remnants = new Map<number, RemnantTrace>()
  public readonly calls = new Map<string, number>()
  private readonly canvases = new WeakMap<InkCanvas, number>()
  private canvasCount = 0
  private bodyCanvas: number | null = null

  public draw(canvas: InkCanvas, frame: InkFrame, at: number, body: boolean): void {
    let order = this.canvases.get(canvas)
    if (order === undefined) {
      this.canvasCount += 1
      order = this.canvasCount
      this.canvases.set(canvas, order)
      if (body && this.bodyCanvas === null) this.bodyCanvas = order
    }
    if (order === this.bodyCanvas) push(this.wash, at, frame.wash)
    for (const mark of frame.marks) {
      const id = `${order}:${mark.key}`
      let trace = this.marks.get(id)
      if (trace === undefined) {
        trace = {
          canvas: order,
          key: mark.key,
          tone: mark.tone,
          weight: round(mark.stroke.weight, 3),
          ink: round(mark.stroke.ink, 3),
          points: mark.stroke.line.map(([x, y]) => [round(x, 2), round(y, 2)] as const),
          written: { samples: [] },
          opacity: { samples: [] },
          tail: { samples: [] },
        }
        this.marks.set(id, trace)
      }
      push(trace.written, at, mark.written)
      push(trace.opacity, at, mark.opacity)
      if (mark.tail !== undefined) push(trace.tail, at, mark.tail.to)
    }
  }

  public remnant(remnants: readonly Remnant[], at: number, orders: Map<number, number>): void {
    for (const remnant of remnants) {
      let order = orders.get(remnant.id)
      if (order === undefined) {
        order = orders.size + 1
        orders.set(remnant.id, order)
      }
      let trace = this.remnants.get(order)
      if (trace === undefined) {
        trace = {
          order,
          origin: [round(remnant.origin.x, 2), round(remnant.origin.y, 2)],
          area: [
            round(remnant.area.x, 2),
            round(remnant.area.y, 2),
            round(remnant.area.width, 2),
            round(remnant.area.height, 2),
          ],
          size: round(remnant.size, 2),
          written: { samples: [] },
          opacity: { samples: [] },
        }
        this.remnants.set(order, trace)
      }
      push(trace.written, at, remnant.written)
      push(trace.opacity, at, remnant.opacity)
    }
  }

  public trace(paper: Trace['paper']): Trace {
    const series = (s: Series): Sample[] => bends(s.samples)
    return {
      marks: [...this.marks.values()].map(mark => ({
        ...mark,
        written: { samples: series(mark.written) },
        opacity: { samples: series(mark.opacity) },
        tail: { samples: series(mark.tail) },
      })),
      wash: series(this.wash),
      remnants: [...this.remnants.values()].map(remnant => ({
        ...remnant,
        written: { samples: series(remnant.written) },
        opacity: { samples: series(remnant.opacity) },
      })),
      paper: paper.map(({ ink, samples }) => ({ ink, samples: bends(samples) })),
      calls: Object.fromEntries([...this.calls].toSorted(([a], [b]) => a.localeCompare(b))),
    }
  }
}

function boxOf(element: Element): DOMRect {
  const bubble = element.classList.contains('omne-ink-bubble')
  const [left, top, width, height] = bubble ? [190, 70, 220, 60] : [0, 0, 0, 0]
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }
}

function run(still: boolean): Trace {
  const recorder = new Recorder()
  let frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame += 1
    frames.set(nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  vi.stubGlobal('OffscreenCanvas', undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => recordingContext(recorder.calls) as never,
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxOf(this)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxOf(this).width
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxOf(this).height
  })
  vi.spyOn(Math, 'random').mockImplementation(seeded(0x5eed))
  casual.use(seeded(0x1a2b3c))
  casual.setStill(still)
  inkClock.use(() => Date.now())

  const body = new FigureBody()
  body.random = () => casual.random()
  const journeys = new Journeys(56)
  const policy = new DoingPolicy(body)
  const bodyCanvases = new WeakSet<InkCanvas>()
  const original = InkCanvas.prototype.draw
  let drawingBody = false
  vi.spyOn(InkCanvas.prototype, 'draw').mockImplementation(function (
    this: InkCanvas,
    frame: InkFrame,
  ) {
    if (drawingBody) bodyCanvases.add(this)
    recorder.draw(this, frame, inkNow(), bodyCanvases.has(this))
    original.call(this, frame)
  })
  const remnantOrder = new Map<number, number>()
  journeys.subscribe(remnants => recorder.remnant(remnants, inkNow(), remnantOrder))

  const wait = (ms: number): void => {
    act(() => {
      for (let i = 0; i < ms; i += 1) {
        vi.advanceTimersByTime(1)
        const due = frames
        frames = new Map()
        for (const callback of due.values()) callback(Date.now())
      }
    })
  }
  const step = (change: () => void, ms: number): void => {
    act(change)
    wait(ms)
  }

  drawingBody = true
  const view = render(
    createElement(
      'div',
      null,
      createElement(FigureInk, { body, size: 56 }),
      createElement(FigureJourneys, { journeys }),
    ),
  )
  drawingBody = false

  step(() => body.writeAnew(), 1000)
  step(() => policy.follow('thinking', null), 3700)
  step(() => policy.follow('looking', { kind: 'received', serial: 1 }), 3000)
  step(() => policy.follow('writing', null), 4200)
  step(() => policy.follow('background', null), 3600)
  step(() => policy.follow(null, { kind: 'landed', serial: 2 }), 1600)
  step(() => policy.follow(null, { kind: 'could-not', serial: 3 }), 2000)
  step(() => body.setWaiting(3), 1200)
  step(() => body.setWaiting(0), 1200)
  step(() => body.setPressed(true), 300)
  step(() => body.setPressed(false), 900)
  step(() => journeys.travel(body, { x: 100, y: 300 }, { x: 900, y: 300 }, () => undefined), 5200)

  const paper: { ink: string; samples: Sample[] }[] = []
  for (const ink of ['full', 'light'] as const) {
    const samples: Sample[] = []
    let gone = false
    const bubble = (closing: boolean): ReactElement =>
      createElement(
        InkBubble,
        {
          figure: { x: 100, y: 72, width: 56, height: 56 },
          origin: [190, 70],
          ink,
          closing,
          reduced: false,
          onGone: () => {
            gone = true
          },
        },
        'words',
      )
    const shown = render(bubble(false))
    const host = shown.container.querySelector<HTMLElement>('.omne-ink-bubble')!
    const sample = (ms: number): void => {
      for (let i = 0; i < ms; i += 10) {
        wait(10)
        const value = Number.parseFloat(host.style.getPropertyValue('--omne-ink-bubble-paper'))
        if (Number.isFinite(value)) samples.push([inkNow(), value])
      }
    }
    sample(1800)
    act(() => shown.rerender(bubble(true)))
    sample(1400)
    expect(gone, `the ${ink} bubble folds away`).toBe(true)
    shown.unmount()
    paper.push({ ink, samples })
  }

  policy.dispose()
  body.dispose()
  journeys.dispose()
  view.unmount()
  return recorder.trace(paper)
}

afterEach(() => {
  cleanup()
  casual.use(null)
  casual.setStill(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stored(name: string, trace: Trace): Trace {
  const path = join(FIXTURES, `${name}.json`)
  if (SEEDING) {
    mkdirSync(FIXTURES, { recursive: true })
    writeFileSync(path, `${JSON.stringify(trace)}\n`)
  }
  expect(existsSync(path), `${path} is missing: write it once with INK_TRACE_SEED=1`).toBe(true)
  return JSON.parse(readFileSync(path, 'utf8')) as Trace
}

describe('ink trace', () => {
  it('writes the same strokes twice from the same input, and the stored ones', () => {
    const first = run(false)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    const second = run(false)
    expect(second).toEqual(first)
    expect(first.marks.length).toBeGreaterThan(0)
    expect(first).toEqual(stored('trace', first))
  })

  it('writes the casual values at their designed size when casual is still', () => {
    const trace = run(true)
    expect(trace).toEqual(stored('still', trace))
  })
})
