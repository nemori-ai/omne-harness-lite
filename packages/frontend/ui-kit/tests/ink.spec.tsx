// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIGURE_SIZE, FigureSeat, FigureStage, InkBubble } from '../src/index.ts'
import { FigureBody, WRITE, type Doing, type FigureMoment } from '../src/ink/body.ts'
import { lay } from '../src/ink/bristle.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { THINK_CASUAL } from '../src/ink/doing-ink.ts'
import { DoingPolicy, DWELL, LAG, SETTLE } from '../src/ink/doing.ts'
import { CENTRE, DEFAULT_HAND } from '../src/ink/ink.ts'
import { REACH } from '../src/ink/ink-canvas.ts'
import {
  BUBBLE_STRENGTH,
  bubbleLines,
  bubbleStrokes,
  type BubbleShape,
} from '../src/ink/note-ink.ts'
import { FigureStore } from '../src/ink/store.ts'
import { Journeys } from '../src/ink/travel.ts'

const STYLES = readFileSync(join(import.meta.dirname, '../src/ink/ink.css'), 'utf8')
const TAIL_CLEAR = 0.9

type Point = readonly [number, number]

interface Seat {
  readonly name: string
  readonly priority: number
  readonly at: Point
}

const DOOR: Seat = { name: 'door', priority: 1, at: [720, 280] }
const HOME: Seat = { name: 'home', priority: 1, at: [33, 80] }
const HEAD: Seat = { name: 'head', priority: 2, at: [840, 68] }
const SEATS = [DOOR, HOME, HEAD]
const BUBBLE = { left: 190, top: 70, width: 220, height: 60 }

interface Clock {
  readonly wait: (ms: number) => void
  readonly pending: () => number
  readonly requested: () => number
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
    requested: () => next,
  }
}

function boxed(left: number, top: number, width: number, height: number): DOMRect {
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

const moved = new Map<string, Point>()
const folded = new Set<string>()

function placeSeats(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('omne-ink-bubble'))
      return boxed(BUBBLE.left, BUBBLE.top, BUBBLE.width, BUBBLE.height)
    const seat = SEATS.find(candidate => candidate.name === this.dataset['figureSeat'])
    if (seat === undefined || folded.has(seat.name)) return boxed(0, 0, 0, 0)
    const [x, y] = moved.get(seat.name) ?? seat.at
    return boxed(x - 12, y - 12, 24, 24)
  })
  for (const key of ['offsetWidth', 'offsetHeight'] as const)
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('omne-ink-bubble')) return 0
      return key === 'offsetWidth' ? BUBBLE.width : BUBBLE.height
    })
}

function sizeFactor(factor: number): void {
  document.documentElement.style.setProperty('--omne-size', String(factor))
}

function reducedMotion(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

type StageProps = Omit<ComponentProps<typeof FigureStage>, 'label' | 'children'>

function Page({
  seats,
  ...stage
}: { readonly seats: readonly Seat[] } & StageProps): React.JSX.Element {
  return (
    <FigureStage label="形在想" {...stage}>
      {seats.map(seat => (
        <FigureSeat key={seat.name} name={seat.name} priority={seat.priority} />
      ))}
    </FigureStage>
  )
}

function carried(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.omne-figure-carried')
  if (element === null) throw new Error('no figure is drawn')
  return element
}

const translateTo = ([x, y]: Point, side: number): string =>
  `translate(${(x - side / 2).toFixed(2)}px, ${(y - side / 2).toFixed(2)}px)`

function expectSide(side: number): void {
  const figure = carried()
  expect(figure.style.width).toBe(`${side}px`)
  expect(figure.style.height).toBe(`${side}px`)
  const paper = figure.querySelector<HTMLElement>('canvas.omne-figure-paper')
  expect(paper?.style.width).toBe(`${side * REACH}px`)
}

function seatElement(seat: Seat): HTMLElement {
  const element = document.createElement('span')
  element.dataset['figureSeat'] = seat.name
  document.body.append(element)
  return element
}

function centreOf(line: readonly Point[]): Point {
  const sum = line.reduce<[number, number]>((at, [x, y]) => [at[0] + x, at[1] + y], [0, 0])
  return [sum[0] / line.length, sum[1] / line.length]
}

function cssRule(selector: string): string {
  const start = STYLES.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`ink.css has no rule ${selector}`)
  return STYLES.slice(start, STYLES.indexOf('}', start))
}

interface Watching {
  readonly callback: IntersectionObserverCallback
  readonly margin: readonly number[]
  readonly thresholds: readonly number[]
  readonly targets: Map<Element, number>
}

const clipped = new Map<string, DOMRect>()

function intersectionOf(
  target: Element,
  [top = 0, right = 0, bottom = 0, left = 0]: readonly number[],
): { readonly ratio: number; readonly intersecting: boolean } {
  const box = target.getBoundingClientRect()
  const root = document.documentElement
  const clip = clipped.get((target as HTMLElement).dataset['figureSeat'] ?? '')
  const width =
    Math.min(box.right, root.clientWidth + right, clip?.right ?? Infinity) -
    Math.max(box.left, -left, clip?.left ?? -Infinity)
  const height =
    Math.min(box.bottom, root.clientHeight + bottom, clip?.bottom ?? Infinity) -
    Math.max(box.top, -top, clip?.top ?? -Infinity)
  if (width < 0 || height < 0) return { ratio: 0, intersecting: false }
  return { ratio: (width * height) / (box.width * box.height), intersecting: true }
}

function resizes(): () => number {
  const live = new Map<ResizeObserverCallback, Map<Element, string>>()
  class Observer {
    readonly #callback: ResizeObserverCallback
    public constructor(callback: ResizeObserverCallback) {
      this.#callback = callback
      live.set(callback, new Map())
    }
    public observe(target: Element): void {
      live.get(this.#callback)?.set(target, '')
    }
    public unobserve(target: Element): void {
      live.get(this.#callback)?.delete(target)
    }
    public disconnect(): void {
      live.delete(this.#callback)
    }
  }
  vi.stubGlobal('ResizeObserver', Observer)
  return () => {
    let told = 0
    const watched = [...live]
    for (const [callback, targets] of watched)
      for (const [target, before] of targets) {
        const box = target.getBoundingClientRect()
        const size = `${box.width} ${box.height}`
        if (size === before || !live.has(callback)) continue
        targets.set(target, size)
        told += 1
        callback([{ target } as ResizeObserverEntry], {} as ResizeObserver)
      }
    return told
  }
}

function pageLayout(): { readonly frame: () => number } {
  const sized = resizes()
  const live = new Set<Watching>()
  class Observer {
    readonly #watching: Watching
    public constructor(
      callback: IntersectionObserverCallback,
      options: IntersectionObserverInit = {},
    ) {
      const threshold = options.threshold ?? 0
      this.#watching = {
        callback,
        margin: (options.rootMargin ?? '0px').split(/\s+/).map(Number.parseFloat),
        thresholds: Array.isArray(threshold) ? threshold : [threshold],
        targets: new Map(),
      }
      live.add(this.#watching)
    }
    public observe(target: Element): void {
      this.#watching.targets.set(target, -1)
    }
    public unobserve(target: Element): void {
      this.#watching.targets.delete(target)
    }
    public disconnect(): void {
      live.delete(this.#watching)
    }
    public takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  return {
    frame() {
      let told = 0
      act(() => {
        told += sized()
        const watched = [...live]
        for (const watching of watched)
          for (const [target, before] of watching.targets) {
            const { ratio, intersecting } = intersectionOf(target, watching.margin)
            const index = intersecting
              ? watching.thresholds.filter(threshold => ratio >= threshold).length
              : 0
            if (index === before || !live.has(watching)) continue
            watching.targets.set(target, index)
            told += 1
            const entry = { target, intersectionRatio: ratio, isIntersecting: intersecting }
            watching.callback([entry as IntersectionObserverEntry], {} as IntersectionObserver)
          }
      })
      return told
    },
  }
}

afterEach(() => {
  moved.clear()
  folded.clear()
  clipped.clear()
  cleanup()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('style')
  casual.use(null)
  casual.setStill(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('one figure, one size (FE-I18)', () => {
  it('draws only the first of two stages on a page and says so once', () => {
    const time = frameClock()
    placeSeats()
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <>
        <Page seats={[HOME]} />
        <Page seats={[HEAD]} doing="thinking" />
      </>,
    )
    time.wait(50)
    view.rerender(
      <>
        <Page seats={[HOME]} waiting={2} />
        <Page seats={[HEAD]} doing="writing" />
      </>,
    )
    time.wait(50)
    expect(document.querySelectorAll('.omne-figure-layer')).toHaveLength(1)
    expect(document.querySelectorAll('.omne-figure-carried')).toHaveLength(1)
    expect(document.querySelectorAll('[data-figure-ink]')).toHaveLength(1)
    expect(said).toHaveBeenCalledTimes(1)
    expect(carried().style.transform).toBe(translateTo(HOME.at, FIGURE_SIZE))
    time.wait(3000)
    const asked = time.requested()
    time.wait(4000)
    expect(time.requested(), 'the second stage writes nothing, even unseen').toBe(asked)
  })

  it.each([0.75, 1, 1.25, 1.5])(
    'at size factor %s it is 56 × the factor on each of three seats and on the road',
    factor => {
      sizeFactor(factor)
      const time = frameClock()
      placeSeats()
      const side = FIGURE_SIZE * factor
      const view = render(<Page seats={[DOOR]} />)
      time.wait(20)
      expect(carried().dataset['phase']).toBe('seated')
      expectSide(side)
      for (const seats of [[HOME], [HOME, HEAD]]) {
        view.rerender(<Page seats={seats} />)
        time.wait(200)
        expect(carried().dataset['phase']).toBe('flying')
        expectSide(side)
        const papers = [...document.querySelectorAll<HTMLElement>('.omne-figure-remnant')]
        const left = papers.map(paper => Number.parseFloat(paper.style.width))
        expect(left.some(width => Math.abs(width - side * REACH) < 0.06)).toBe(true)
        time.wait(3000)
        expect(carried().dataset['phase']).toBe('seated')
        expectSide(side)
        expect(carried().style.transform).toBe(translateTo(seats.at(-1)!.at, side))
      }
    },
  )

  it.each([0.75, 1, 1.25, 1.5])(
    'at size factor %s everything a journey leaves on the way is at the same size',
    factor => {
      const time = frameClock()
      placeSeats()
      const store = new FigureStore()
      store.setAppSize(factor)
      const sizes = new Set<number>()
      store.journeys.subscribe(remnants => {
        for (const remnant of remnants) sizes.add(remnant.size)
      })
      store.seatAt(HOME.name, { element: seatElement(HOME), priority: 1, beside: () => undefined })
      time.wait(800)
      store.seatAt(HEAD.name, { element: seatElement(HEAD), priority: 2, beside: () => undefined })
      time.wait(3000)
      expect(store.getSnapshot()).toMatchObject({ seat: HEAD.name, phase: 'seated' })
      expect(sizes).toEqual(new Set([FIGURE_SIZE * factor]))
      store.dispose()
    },
  )
})

describe('the ink bubble', () => {
  const unit = FIGURE_SIZE / 64
  const shape = (width: number, height: number, anchor: Point): BubbleShape => ({
    width,
    height,
    radius: 12,
    anchor,
    unit,
    seed: 4242,
  })
  const edge = (lines: ReturnType<typeof bubbleLines>): readonly Point[] => [
    ...lines.first,
    ...lines.second,
  ]
  const nearest = (points: readonly Point[], [x, y]: Point): number =>
    Math.min(...points.map(p => Math.hypot(p[0] - x, p[1] - y)))

  it('writes its edge for its own size: a larger box is not the smaller one scaled', () => {
    const small = edge(bubbleLines(shape(220, 60, [-62, 30])))
    const large = edge(bubbleLines(shape(440, 120, [-62, 60])))
    expect(large.length).toBeGreaterThan(small.length * 1.6)
    const cornerSmall = nearest(small, [220, 60])
    const cornerLarge = nearest(large, [440, 120])
    expect(Math.abs(cornerLarge - cornerSmall)).toBeLessThan(1.5)
    expect(cornerLarge).toBeLessThan(cornerSmall * 1.5)
  })

  it.each([
    { side: 'right', width: 220, height: 60, anchor: [-62, 30] },
    { side: 'right, tall', width: 300, height: 200, anchor: [-40, 28] },
    { side: 'left', width: 220, height: 60, anchor: [282, 30] },
    { side: 'below', width: 600, height: 400, anchor: [300, -40] },
    { side: 'below, near a corner', width: 600, height: 400, anchor: [40, -40] },
    { side: 'above', width: 300, height: 100, anchor: [150, 140] },
  ] as const)('leads out of the gap round the circle, never through it ($side)', placed => {
    const rim = DEFAULT_HAND.radius * unit * TAIL_CLEAR
    for (const seed of [1, 7, 4242]) {
      const { tail } = bubbleLines({ ...shape(placed.width, placed.height, placed.anchor), seed })
      expect(tail.length).toBeGreaterThan(1)
      for (const [x, y] of tail)
        expect(Math.hypot(x - placed.anchor[0], y - placed.anchor[1])).toBeGreaterThanOrEqual(rim)
    }
  })

  it('writes full and light ink with one brush: the same line and hairs, less press and ink', () => {
    const full = bubbleStrokes({ ...shape(220, 60, [-62, 30]), ink: 'full' })
    const light = bubbleStrokes({ ...shape(220, 60, [-62, 30]), ink: 'light' })
    expect(light).toHaveLength(full.length)
    full.forEach((stroke, i) => {
      const other = light[i]!.ink
      expect(other.line).toEqual(stroke.ink.line)
      expect(other.seed).toBe(stroke.ink.seed)
      expect(other.ending).toBe(stroke.ink.ending)
      expect(other.weight / stroke.ink.weight).toBeCloseTo(
        BUBBLE_STRENGTH.light.outline / BUBBLE_STRENGTH.full.outline,
      )
      expect(other.ink / stroke.ink.ink).toBeCloseTo(BUBBLE_STRENGTH.light.ink)
      for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(other.press(t)).toBe(stroke.ink.press(t))
      const [hairsFull, hairsLight] = [lay(stroke.ink).hairs, lay(other).hairs]
      expect(hairsLight.map(hair => hair.u)).toEqual(hairsFull.map(hair => hair.u))
    })
  })
})

describe('it moves only by the brush', () => {
  const MOVES = /\b(?:rotate|scale|skew|matrix)\w*\s*\(/

  it('draws its layer and its bubble with nothing but a translation, and no animation', () => {
    const time = frameClock()
    placeSeats()
    const animate = vi.spyOn(Element.prototype, 'animate')
    const view = render(
      <>
        <Page seats={[HOME]} />
        <InkBubble figure={{ x: 100, y: 72, width: 56, height: 56 }} origin={[190, 70]}>
          words
        </InkBubble>
      </>,
    )
    const look = (): void => {
      const drawn = document.querySelectorAll<HTMLElement>(
        '.omne-figure-layer, .omne-figure-layer *, .omne-ink-bubble, .omne-ink-bubble *',
      )
      expect(drawn.length).toBeGreaterThan(4)
      for (const element of drawn) {
        const { transform, animation, animationName, rotate, scale } = element.style
        expect(transform.replaceAll(/translate\([^)]*\)/g, '').trim()).toBe('')
        expect(transform).not.toMatch(MOVES)
        expect([animation, animationName, rotate, scale].join('')).toBe('')
      }
    }
    for (const step of [20, 300, 900]) {
      time.wait(step)
      look()
    }
    view.rerender(
      <>
        <Page seats={[HOME, HEAD]} doing="thinking" waiting={3} />
        <InkBubble figure={{ x: 100, y: 72, width: 56, height: 56 }} origin={[190, 70]} closing>
          words
        </InkBubble>
      </>,
    )
    for (const step of [100, 600, 2500]) {
      time.wait(step)
      look()
    }
    expect(animate).not.toHaveBeenCalled()
  })

  it('keeps animations, keyframes and every transform but position out of its styles', () => {
    expect(STYLES).not.toMatch(/@keyframes|\banimation\b|\btransform\s*:/)
    expect(STYLES).not.toMatch(MOVES)
    const figureRules = STYLES.split('}').filter(rule => rule.includes('.omne-figure'))
    expect(figureRules.length).toBeGreaterThan(4)
    for (const rule of figureRules) expect(rule).not.toMatch(/\btransition\b/)
  })
})

describe('reduced motion', () => {
  it('writes and dries at once and leaves one still mark for each state', () => {
    const time = frameClock()
    const body = new FigureBody(true)
    const frame = (): ReturnType<FigureBody['frame']> => body.frame()
    body.writeAnew()
    expect(frame().marks).toHaveLength(1)
    expect(frame().marks[0]).toMatchObject({ written: 1, opacity: 1 })
    const circle = frame().marks[0]!.key
    body.perform('thinking')
    expect(frame().marks.find(mark => mark.key === circle)?.opacity).toBe(THINK_CASUAL.still)
    body.perform('looking')
    const looked = frame().marks.filter(mark => mark.key !== circle)
    expect(looked).toHaveLength(1)
    expect(looked[0]!.written).toBe(1)
    const eye = centreOf(looked[0]!.stroke.line)
    expect(Math.hypot(eye[0] - CENTRE[0], eye[1] - CENTRE[1])).toBeLessThan(0.6)
    expect(frame().marks.find(mark => mark.key === circle)?.opacity).toBe(1)
    body.perform('writing')
    const page = frame().marks.filter(mark => mark.key !== circle)
    expect(page.length).toBeGreaterThanOrEqual(2)
    expect(page.every(mark => mark.written === 1 && mark.opacity === 1)).toBe(true)
    expect(frame().marks.find(mark => mark.key === circle)?.opacity).toBe(1)
    time.wait(6000)
    expect(frame().marks.filter(mark => mark.key !== circle)).toEqual(page)
    body.perform(null)
    expect(frame().marks.map(mark => mark.key)).toEqual([circle])
    expect(time.requested()).toBe(0)
    body.dispose()
  })

  it('goes to a new seat without a journey: it is there at once', async () => {
    reducedMotion()
    const time = frameClock()
    placeSeats()
    const view = render(<Page seats={[HOME]} />)
    time.wait(20)
    expect(carried().style.transform).toBe(translateTo(HOME.at, FIGURE_SIZE))
    await act(async () => {
      view.rerender(<Page seats={[HOME, HEAD]} />)
      await Promise.resolve()
    })
    expect(carried().dataset['phase']).toBe('seated')
    expect(carried().style.transform).toBe(translateTo(HEAD.at, FIGURE_SIZE))
    for (const step of [1, 200, 2000]) {
      time.wait(step)
      expect(document.querySelectorAll('.omne-figure-remnant')).toHaveLength(0)
    }
  })
})

describe('its frame loop rests when nothing happens', () => {
  it('asks for no frame once the circle is written and the ink is dry', () => {
    const time = frameClock()
    const body = new FigureBody()
    body.writeAnew()
    time.wait(WRITE.circle + 50)
    expect(time.pending()).toBe(0)
    let asked = time.requested()
    time.wait(3000)
    expect(time.requested()).toBe(asked)
    body.perform('thinking')
    time.wait(4000)
    body.perform(null)
    body.setWaiting(2)
    time.wait(3000)
    body.setWaiting(0)
    time.wait(1000)
    expect(time.pending()).toBe(0)
    asked = time.requested()
    time.wait(3000)
    expect(time.requested()).toBe(asked)
    body.dispose()
  })

  it('asks for no frame once a journey has come down and what it left has dried', () => {
    const time = frameClock()
    const body = new FigureBody()
    const journeys = new Journeys(FIGURE_SIZE)
    body.writeAnew()
    time.wait(WRITE.circle + 50)
    let landed = false
    journeys.travel(body, { x: 33, y: 80 }, { x: 840, y: 68 }, arrived => {
      landed = arrived
    })
    time.wait(6000)
    expect(landed).toBe(true)
    expect(journeys.travelling).toBe(false)
    expect(time.pending()).toBe(0)
    const asked = time.requested()
    time.wait(3000)
    expect(time.requested()).toBe(asked)
    journeys.dispose()
    body.dispose()
  })
})

describe('what it does stays long enough to be seen (doing.ts)', () => {
  interface Shown {
    readonly at: number
    readonly doing: Doing | null
  }

  function following(strokeEnd: () => number = () => 0): {
    readonly policy: DoingPolicy
    readonly shown: Shown[]
    readonly moments: FigureMoment['kind'][]
    readonly at: (time: number, act: () => void) => void
  } {
    frameClock()
    const shown: Shown[] = []
    const moments: FigureMoment['kind'][] = []
    const policy = new DoingPolicy({
      perform: doing => shown.push({ at: Date.now(), doing }),
      moment: kind => moments.push(kind),
      strokeLeft: () => Math.max(0, strokeEnd() - Date.now()),
    })
    return {
      policy,
      shown,
      moments,
      at(time, act) {
        vi.advanceTimersByTime(time - Date.now())
        act()
      },
    }
  }

  it(`holds an act it showed for DWELL (${DWELL} ms) before it gives way`, () => {
    const { policy, shown, at } = following()
    at(0, () => policy.follow('looking', null))
    at(100, () => policy.follow(null, null))
    at(DWELL - 1, () => undefined)
    expect(shown).toEqual([{ at: 0, doing: 'looking' }])
    at(DWELL + 500, () => undefined)
    expect(shown).toEqual([
      { at: 0, doing: 'looking' },
      { at: DWELL, doing: null },
    ])
  })

  it(`thinks only once thinking has been said for SETTLE (${SETTLE} ms)`, () => {
    const { policy, shown, at } = following()
    at(0, () => policy.follow('thinking', null))
    at(SETTLE - 1, () => undefined)
    expect(shown).toEqual([])
    at(1000, () => undefined)
    expect(shown).toEqual([{ at: SETTLE, doing: 'thinking' }])
    const blink = following()
    blink.at(0, () => blink.policy.follow('thinking', null))
    blink.at(SETTLE - 50, () => blink.policy.follow(null, null))
    blink.at(2000, () => undefined)
    expect(blink.shown).toEqual([])
  })

  it('owes an act too brief to catch and shows it once what is shown allows', () => {
    const { policy, shown, at } = following()
    at(0, () => policy.follow('looking', null))
    at(100, () => policy.follow('writing', null))
    at(200, () => policy.follow('thinking', null))
    at(4000, () => undefined)
    expect(shown).toEqual([
      { at: 0, doing: 'looking' },
      { at: DWELL, doing: 'writing' },
      { at: DWELL * 2, doing: 'thinking' },
    ])
  })

  it(`waits for the stroke being written, and lets go of an act it cannot show within LAG (${LAG} ms)`, () => {
    let end = 600
    const waiting = following(() => end)
    waiting.at(0, () => waiting.policy.follow('thinking', null))
    waiting.at(400, () => waiting.policy.follow('looking', null))
    waiting.at(2000, () => undefined)
    expect(waiting.shown).toEqual([
      { at: SETTLE, doing: 'thinking' },
      { at: 600, doing: 'looking' },
    ])
    end = 0
    const late = following(() => end)
    late.at(0, () => late.policy.follow('looking', null))
    late.at(100, () => late.policy.follow('writing', null))
    late.at(150, () => late.policy.follow('thinking', null))
    end = 1900
    late.at(5000, () => undefined)
    expect(late.shown).toEqual([
      { at: 0, doing: 'looking' },
      { at: 1900, doing: 'thinking' },
    ])
  })

  it('shows each one-off fact once, when its serial is new', () => {
    const { policy, moments, at } = following()
    at(0, () => policy.follow(null, { kind: 'received', serial: 1 }))
    at(10, () => policy.follow('thinking', { kind: 'received', serial: 1 }))
    at(20, () => policy.follow(null, { kind: 'landed', serial: 2 }))
    at(30, () => policy.follow(null, { kind: 'landed', serial: 2 }))
    expect(moments).toEqual(['received', 'landed'])
  })
})

describe('a seat that only moves (R4 slice 06)', () => {
  it('has the figure back on it by the next frame, the seat and the page keeping their size, with no frame asked for', () => {
    const time = frameClock()
    placeSeats()
    const page = pageLayout()
    render(<Page seats={[HOME, HEAD]} />)
    time.wait(3000)
    page.frame()
    page.frame()
    expect(carried().style.transform).toBe(translateTo(HEAD.at, FIGURE_SIZE))
    const asked = time.requested()
    for (const at of [
      [840, 86],
      [736, 86],
      [736.4, 86.4],
      [840, 68],
    ] satisfies Point[]) {
      moved.set(HEAD.name, at)
      page.frame()
      expect(carried().style.transform).toBe(translateTo(at, FIGURE_SIZE))
      page.frame()
      expect(page.frame(), 'still, it hears of nothing more').toBe(0)
    }
    moved.set(HEAD.name, [736.4, 86.4])
    page.frame()
    moved.set(HEAD.name, [736.1, 86.1])
    page.frame()
    expect(carried().style.transform, 'moved within a pixel before its watch first answered').toBe(
      translateTo([736.1, 86.1], FIGURE_SIZE),
    )
    page.frame()
    expect(page.frame()).toBe(0)
    expect(carried().dataset['phase']).toBe('seated')
    expect(time.requested(), 'it follows the seat with no frame loop').toBe(asked)
  })

  const settle = (page: { readonly frame: () => number }): void => {
    for (let frame = 0; frame < 4; frame += 1) page.frame()
    expect(page.frame(), 'still, it hears of nothing more').toBe(0)
  }

  it('rests on a seat half hidden by what holds it, and follows it when it moves', () => {
    const time = frameClock()
    placeSeats()
    const page = pageLayout()
    clipped.set(HEAD.name, boxed(828, 0, 12, 200))
    render(<Page seats={[HOME, HEAD]} />)
    time.wait(3000)
    settle(page)
    moved.set(HEAD.name, [840, 76])
    settle(page)
    expect(carried().style.transform).toBe(translateTo([840, 76], FIGURE_SIZE))
  })

  it('rests on a seat wholly hidden by what holds it, and goes where it is once it shows', () => {
    const time = frameClock()
    placeSeats()
    const page = pageLayout()
    clipped.set(HEAD.name, boxed(0, 0, 10, 10))
    render(<Page seats={[HOME, HEAD]} />)
    time.wait(3000)
    settle(page)
    moved.set(HEAD.name, [840, 76])
    clipped.delete(HEAD.name)
    settle(page)
    expect(carried().style.transform).toBe(translateTo([840, 76], FIGURE_SIZE))
  })

  it('follows a seat that had no size when it came, once it has one and moves', () => {
    const time = frameClock()
    placeSeats()
    const page = pageLayout()
    folded.add(HEAD.name)
    render(<Page seats={[HOME, HEAD]} />)
    time.wait(3000)
    settle(page)
    expect(carried().style.transform).toBe(translateTo(HOME.at, FIGURE_SIZE))
    folded.delete(HEAD.name)
    settle(page)
    time.wait(3000)
    expect(carried().dataset['phase']).toBe('seated')
    moved.set(HEAD.name, [840, 86])
    settle(page)
    expect(carried().style.transform).toBe(translateTo([840, 86], FIGURE_SIZE))
  })
})

describe('the pointer on the figure', () => {
  const over = (x: number, y: number): void => {
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }),
      )
    })
  }

  it('is over it inside the circle of 0.4 × its size, not in the corners of its square', () => {
    const time = frameClock()
    placeSeats()
    render(<Page seats={[DOOR]} />)
    time.wait(20)
    const [x, y] = DOOR.at
    const hovered = (): boolean => carried().hasAttribute('data-hover')
    over(x + 15, y + 15)
    expect(hovered()).toBe(true)
    over(x + 26, y - 26)
    expect(hovered()).toBe(false)
    over(x - 22, y)
    expect(hovered()).toBe(true)
    over(x - 26, y + 25)
    expect(hovered()).toBe(false)
    over(x, y + 23)
    expect(hovered()).toBe(false)
  })

  it('takes a press only in that circle, and answers hover with a dot and press with a wash', () => {
    const reach = cssRule('.omne-figure-reach')
    expect(reach).toMatch(/inset:\s*10%;/)
    expect(reach).toMatch(/border-radius:\s*var\(--omne-radius-pill\);/)
    const time = frameClock()
    placeSeats()
    const store = new FigureStore()
    store.seatAt(HOME.name, { element: seatElement(HOME), priority: 1, beside: () => undefined })
    time.wait(WRITE.circle + 50)
    const [x, y] = HOME.at
    store.pointerOver({ x: x + 5, y: y - 5 })
    time.wait(WRITE.mark + 20)
    const dots = store.body.frame().marks.slice(1)
    expect(dots).toHaveLength(1)
    const dot = centreOf(dots[0]!.stroke.line)
    expect(Math.hypot(dot[0] - CENTRE[0], dot[1] - CENTRE[1])).toBeLessThan(0.6)
    store.pointerDown()
    time.wait(WRITE.wash + 20)
    expect(store.body.frame().wash).toBeCloseTo(0.4)
    store.pointerUp()
    store.pointerOver(null)
    time.wait(WRITE.dry + WRITE.wash + 40)
    expect(store.body.frame().marks).toHaveLength(1)
    expect(store.body.frame().wash).toBeCloseTo(0)
    store.dispose()
  })
})
