// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { createElement, createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIGURE_SIZE,
  FigureSeat,
  FigureStage,
  type FigureControl,
  type FigureHand,
} from '../src/index.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { FOLLOW, follow, LIFT_DISTANCE, type PointerAt } from '../src/ink/hand.ts'
import { FigureStore } from '../src/ink/store.ts'
import { type Remnant } from '../src/ink/travel.ts'

type Point = readonly [number, number]

const HOME: Point = [100, 80]
const seats = new Map<string, Point>()

interface Clock {
  readonly wait: (ms: number) => void
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

function placeSeats(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const at = seats.get(this.dataset['figureSeat'] ?? '')
    if (at === undefined) return boxed(0, 0, 0, 0)
    return boxed(at[0] - 12, at[1] - 12, 24, 24)
  })
}

function reducedMotion(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

function seatElement(name: string): HTMLElement {
  const element = document.createElement('span')
  element.dataset['figureSeat'] = name
  document.body.append(element)
  return element
}

const pointer = (x: number, y: number, more: Partial<PointerAt> = {}): PointerAt => ({
  id: 1,
  buttons: 1,
  client: { x, y },
  screen: { x: x + 1000, y: y + 500 },
  meta: false,
  shift: false,
  ...more,
})

const up = (x: number, y: number, more: Partial<PointerAt> = {}): PointerAt =>
  pointer(x, y, { buttons: 0, ...more })

interface Stage {
  readonly store: FigureStore
  readonly hands: FigureHand[]
  readonly presses: () => number
  readonly take: (taken: boolean) => void
  readonly remnants: () => readonly Remnant[]
}

function stage({ liftable = true }: { readonly liftable?: boolean } = {}): Stage {
  seats.set('home', HOME)
  const store = new FigureStore()
  store.liftable = liftable
  const hands: FigureHand[] = []
  let taken = false
  let pressed = 0
  store.onHand = hand => {
    hands.push(hand)
    return taken
  }
  store.onPress = () => {
    pressed += 1
  }
  store.seatAt('home', { element: seatElement('home'), priority: 1, beside: () => undefined })
  let remnants: readonly Remnant[] = []
  store.journeys.subscribe(next => {
    remnants = [...next]
  })
  return {
    store,
    hands,
    presses: () => pressed,
    take: next => {
      taken = next
    },
    remnants: () => remnants,
  }
}

const where = (store: FigureStore): Point => {
  const { x, y } = store.centre()
  return [x, y]
}

function lift({ store }: Stage, to: Point = [300, 200]): void {
  store.pointerDown(pointer(...HOME))
  store.pointerMove(pointer(...to))
}

const kinds = (hands: readonly FigureHand[]): string[] => hands.map(hand => hand.kind)

afterEach(() => {
  seats.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  cleanup()
  document.body.innerHTML = ''
  casual.use(null)
  casual.setStill(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('a press that does not travel stays a press (FE-I63)', () => {
  it('pressed and let go after a jitter inside LIFT_DISTANCE, it presses the seat and is never lifted', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    figure.store.pointerDown(pointer(...HOME))
    figure.store.pointerMove(pointer(HOME[0] + 2, HOME[1] + 3))
    figure.store.pointerUp(up(HOME[0] + 2, HOME[1] + 3))
    expect(figure.presses()).toBe(1)
    expect(figure.hands).toEqual([])
    expect(figure.store.getSnapshot().phase).toBe('seated')
    expect(where(figure.store)).toEqual(HOME)
    figure.store.dispose()
  })

  it(`counts as lifted only once it has travelled past ${LIFT_DISTANCE}px`, () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    figure.store.pointerDown(pointer(...HOME))
    figure.store.pointerMove(pointer(HOME[0] + LIFT_DISTANCE, HOME[1]))
    expect(figure.store.getSnapshot().phase).toBe('seated')
    expect(figure.hands).toEqual([])
    figure.store.pointerMove(pointer(HOME[0] + LIFT_DISTANCE + 0.5, HOME[1], { meta: true }))
    expect(figure.store.getSnapshot().phase).toBe('held')
    expect(figure.hands).toEqual([
      {
        kind: 'lift',
        client: { x: HOME[0] + LIFT_DISTANCE + 0.5, y: HOME[1] },
        screen: { x: HOME[0] + LIFT_DISTANCE + 0.5 + 1000, y: HOME[1] + 500 },
        meta: true,
        shift: false,
      },
    ])
    figure.store.dispose()
  })

  it('without liftable a long drag is the press it was before', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage({ liftable: false })
    time.wait(700)
    figure.store.pointerDown(pointer(...HOME))
    figure.store.pointerMove(pointer(400, 300))
    time.wait(50)
    figure.store.pointerUp(up(400, 300))
    expect(figure.presses()).toBe(1)
    expect(figure.hands).toEqual([])
    expect(where(figure.store)).toEqual(HOME)
  })

  it('a pointer cancelled before it travelled ends the press with no press and no hand', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    figure.store.pointerDown(pointer(...HOME))
    figure.store.cancel(1)
    figure.store.pointerUp(up(...HOME))
    expect(figure.presses()).toBe(0)
    expect(figure.hands).toEqual([])
  })

  it('a move that finds the button already up, before it travelled, ends the press without pressing', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    figure.store.pointerDown(pointer(...HOME))
    figure.store.pointerMove(up(HOME[0] + 30, HOME[1]))
    figure.store.pointerMove(pointer(HOME[0] + 60, HOME[1]))
    expect(figure.presses()).toBe(0)
    expect(figure.hands).toEqual([])
    expect(figure.store.getSnapshot().phase).toBe('seated')
  })

  it('Escape before it travelled is not the figure’s to take', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    figure.store.pointerDown(pointer(...HOME))
    expect(figure.store.escape(false, false)).toBe(false)
    figure.store.pointerUp(up(...HOME))
    expect(figure.presses()).toBe(1)
  })
})

describe('in the hand', () => {
  it('leaves nothing on the seat: the ink on the way dries at once and the figure goes under the pointer', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    seats.set('head', [500, 400])
    figure.store.seatAt('head', {
      element: seatElement('head'),
      priority: 2,
      beside: () => undefined,
    })
    time.wait(1300)
    expect(where(figure.store)).toEqual([500, 400])
    expect(figure.remnants().length).toBeGreaterThan(0)
    figure.store.pointerDown(pointer(500, 400))
    figure.store.pointerMove(pointer(520, 400))
    expect(figure.remnants()).toEqual([])
    expect(figure.store.getSnapshot()).toMatchObject({ phase: 'held', point: null })
    figure.store.pointerMove(pointer(300, 200))
    time.wait(400)
    expect(where(figure.store)).toEqual([300, 200])
    seats.set('head', [700, 100])
    figure.store.hostChanged()
    time.wait(400)
    expect(where(figure.store)).toEqual([300, 200])
    expect(figure.remnants()).toEqual([])
  })

  it(`follows with a critically damped spring of stiffness ${FOLLOW}: it never passes the pointer`, () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    lift(figure, [400, 80])
    const xs: number[] = []
    for (let i = 0; i < 500; i += 1) {
      time.wait(1)
      xs.push(where(figure.store)[0])
    }
    expect(xs.every((x, i) => x >= (xs[i - 1] ?? HOME[0]) && x <= 400)).toBe(true)
    expect(xs[99]).toBeGreaterThan(HOME[0] + 0.8 * (400 - HOME[0]))
    expect(xs.at(-1)).toBe(400)
  })

  it('the spring answers the closed form of a critically damped follow', () => {
    const omega = Math.sqrt(FOLLOW)
    const t = 0.02
    const next = follow({ x: 0, y: 10, vx: 0, vy: 0 }, { x: 100, y: 10 }, t)
    expect(next.x).toBeCloseTo(100 - 100 * (1 + omega * t) * Math.exp(-omega * t), 6)
    expect(next.y).toBe(10)
    expect(next.vx).toBeCloseTo(100 * omega * omega * t * Math.exp(-omega * t), 6)
  })

  it('tells a move at most once a frame, with the latest point', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    lift(figure)
    figure.store.pointerMove(pointer(310, 200))
    figure.store.pointerMove(pointer(320, 210, { shift: true }))
    expect(kinds(figure.hands)).toEqual(['lift'])
    time.wait(1)
    expect(kinds(figure.hands)).toEqual(['lift', 'move'])
    expect(figure.hands[1]).toEqual({
      kind: 'move',
      client: { x: 320, y: 210 },
      screen: { x: 1320, y: 710 },
      meta: false,
      shift: true,
    })
    time.wait(300)
    expect(kinds(figure.hands)).toEqual(['lift', 'move'])
  })

  it('another pointer does not move it or let it go', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    lift(figure)
    time.wait(400)
    figure.store.pointerMove(pointer(600, 600, { id: 2 }))
    figure.store.pointerUp(up(600, 600, { id: 2 }))
    time.wait(400)
    expect(figure.store.getSnapshot().phase).toBe('held')
    expect(where(figure.store)).toEqual([300, 200])
    expect(kinds(figure.hands)).toEqual(['lift'])
  })
})

interface WayOut {
  readonly name: string
  readonly kind: FigureHand['kind']
  readonly at: Point
  readonly end: (store: FigureStore) => void
}

const WAYS_OUT: readonly WayOut[] = [
  { name: 'let go', kind: 'drop', at: [300, 200], end: store => store.pointerUp(up(300, 200)) },
  {
    name: 'Escape',
    kind: 'escape',
    at: [300, 200],
    end: store => {
      expect(store.escape(true, false)).toBe(true)
    },
  },
  { name: 'a cancelled pointer', kind: 'escape', at: [300, 200], end: store => store.cancel(1) },
  {
    name: 'a move that finds the button already up',
    kind: 'drop',
    at: [340, 260],
    end: store => store.pointerMove(up(340, 260)),
  },
]

describe('each way out of the hand has one end (FE-I63)', () => {
  for (const way of WAYS_OUT) {
    it(`${way.name}, with nobody taking it: one ${way.kind}, then one stroke from under the hand back to the seat`, () => {
      const time = frameClock()
      placeSeats()
      const figure = stage()
      time.wait(700)
      lift(figure)
      time.wait(400)
      way.end(figure.store)
      expect(kinds(figure.hands)).toEqual(['lift', way.kind])
      expect(figure.hands[1]?.client).toEqual({ x: way.at[0], y: way.at[1] })
      expect(figure.store.getSnapshot().phase).toBe('flying')
      time.wait(1)
      expect(figure.remnants().length).toBeGreaterThan(0)
      time.wait(3000)
      expect(figure.store.getSnapshot()).toMatchObject({ phase: 'seated', present: true })
      expect(where(figure.store)).toEqual(HOME)
      figure.store.pointerMove(pointer(500, 500))
      figure.store.pointerUp(up(500, 500))
      time.wait(50)
      expect(kinds(figure.hands)).toEqual(['lift', way.kind])
      expect(figure.presses()).toBe(0)
    })

    it(`${way.name}, taken by the host: it stays where it was let go until goHome`, () => {
      const time = frameClock()
      placeSeats()
      const figure = stage()
      time.wait(700)
      lift(figure)
      time.wait(400)
      figure.take(true)
      way.end(figure.store)
      expect(kinds(figure.hands)).toEqual(['lift', way.kind])
      expect(figure.store.getSnapshot().phase).toBe('dropped')
      time.wait(3000)
      expect(where(figure.store)).toEqual(way.at)
      expect(figure.store.getSnapshot().phase).toBe('dropped')
      figure.store.goHome()
      expect(figure.store.getSnapshot().phase).toBe('flying')
      time.wait(3000)
      expect(where(figure.store)).toEqual(HOME)
      expect(figure.store.getSnapshot().phase).toBe('seated')
      expect(figure.presses()).toBe(0)
    })
  }

  it('let go with no seat to be seen, nobody taking it: its ink dries where it is', () => {
    const time = frameClock()
    placeSeats()
    const figure = stage()
    time.wait(700)
    lift(figure)
    time.wait(400)
    seats.delete('home')
    figure.store.hostChanged()
    time.wait(1000)
    figure.store.pointerUp(up(300, 200))
    expect(figure.store.getSnapshot()).toMatchObject({ phase: 'seated', present: false })
    expect(figure.remnants()).toEqual([])
  })
})

describe('goHome and seatPoint, through control', () => {
  function mount(): {
    readonly control: React.RefObject<FigureControl | null>
    readonly hands: FigureHand[]
  } {
    seats.set('home', HOME)
    const control = createRef<FigureControl>()
    const hands: FigureHand[] = []
    render(
      createElement(
        FigureStage,
        {
          label: '形',
          liftable: true,
          control,
          onHand: hand => {
            hands.push(hand)
            return true
          },
        },
        createElement(FigureSeat, { name: 'home' }),
      ),
    )
    return { control, hands }
  }

  const reach = (): HTMLElement => document.querySelector<HTMLElement>('[data-control="figure"]')!
  const carried = (): HTMLElement => document.querySelector<HTMLElement>('.omne-figure-carried')!
  const at = ([x, y]: Point): string =>
    `translate(${(x - FIGURE_SIZE / 2).toFixed(2)}px, ${(y - FIGURE_SIZE / 2).toFixed(2)}px)`

  function fire(type: string, x: number, y: number, buttons: number): void {
    act(() => {
      reach().dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          button: 0,
          buttons,
          clientX: x,
          clientY: y,
          screenX: x + 1000,
          screenY: y + 500,
        }),
      )
    })
  }

  it('seatPoint answers where the seat is, and null once no seat is to be seen', () => {
    const time = frameClock()
    placeSeats()
    const { control } = mount()
    time.wait(20)
    expect(control.current?.seatPoint()).toEqual({ x: HOME[0], y: HOME[1] })
    seats.set('home', [640, 320])
    expect(control.current?.seatPoint()).toEqual({ x: 640, y: 320 })
    seats.delete('home')
    expect(control.current?.seatPoint()).toBeNull()
  })

  it('the figure is lifted from the page by its pointer, holds that pointer, and goHome writes it back from where it was let go', () => {
    const time = frameClock()
    placeSeats()
    const captured = vi.spyOn(HTMLElement.prototype, 'setPointerCapture')
    const { control, hands } = mount()
    time.wait(700)
    fire('pointerdown', ...HOME, 1)
    fire('pointermove', 260, 180, 1)
    expect(captured).toHaveBeenCalledWith(7)
    expect(carried().dataset['phase']).toBe('held')
    time.wait(400)
    expect(carried().style.transform).toBe(at([260, 180]))
    fire('pointerup', 260, 180, 0)
    expect(kinds(hands)).toEqual(['lift', 'drop'])
    expect(carried().dataset['phase']).toBe('dropped')
    act(() => control.current?.goHome())
    expect(carried().dataset['phase']).toBe('flying')
    time.wait(3000)
    expect(carried().dataset['phase']).toBe('seated')
    expect(carried().style.transform).toBe(at(HOME))
  })

  it('goHome while the figure is in the hand ends the hand: it writes back and hears nothing more from that pointer', () => {
    const time = frameClock()
    placeSeats()
    const { control, hands } = mount()
    time.wait(700)
    fire('pointerdown', ...HOME, 1)
    fire('pointermove', 260, 180, 1)
    act(() => control.current?.goHome())
    fire('pointermove', 300, 300, 1)
    fire('pointerup', 300, 300, 0)
    time.wait(3000)
    expect(kinds(hands)).toEqual(['lift'])
    expect(carried().style.transform).toBe(at(HOME))
  })

  it('goHome on a seated figure changes nothing', () => {
    const time = frameClock()
    placeSeats()
    const { control } = mount()
    time.wait(700)
    const asked = time.requested()
    act(() => control.current?.goHome())
    time.wait(200)
    expect(carried().dataset['phase']).toBe('seated')
    expect(time.requested()).toBe(asked)
  })

  it('Escape on the page lets go of the figure in the hand and is not passed on', () => {
    const time = frameClock()
    placeSeats()
    const { hands } = mount()
    time.wait(700)
    fire('pointerdown', ...HOME, 1)
    fire('pointermove', 260, 180, 1)
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => {
      document.body.dispatchEvent(escape)
    })
    expect(kinds(hands)).toEqual(['lift', 'escape'])
    expect(escape.defaultPrevented).toBe(true)
    expect(outer).not.toHaveBeenCalled()
    window.removeEventListener('keydown', outer)
  })

  it('a page with no pointer capture still lifts the figure', () => {
    const time = frameClock()
    placeSeats()
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: undefined,
    })
    try {
      const { hands } = mount()
      time.wait(700)
      fire('pointerdown', ...HOME, 1)
      fire('pointermove', 260, 180, 1)
      expect(kinds(hands)).toEqual(['lift'])
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
    }
  })
})

describe('reduced motion (spec 17)', () => {
  it('in the hand it is under the pointer at once, and let go it is on its seat at once', () => {
    reducedMotion()
    const time = frameClock()
    placeSeats()
    const figure = stage()
    figure.store.setReduced(true)
    time.wait(20)
    lift(figure)
    expect(where(figure.store)).toEqual([300, 200])
    figure.store.pointerUp(up(300, 200))
    expect(figure.store.getSnapshot().phase).toBe('seated')
    expect(where(figure.store)).toEqual(HOME)
    expect(figure.remnants()).toEqual([])
  })

  it('taken and then sent home, it is on its seat at once', () => {
    reducedMotion()
    const time = frameClock()
    placeSeats()
    const figure = stage()
    figure.store.setReduced(true)
    time.wait(20)
    lift(figure)
    figure.take(true)
    figure.store.pointerUp(up(300, 200))
    expect(where(figure.store)).toEqual([300, 200])
    figure.store.goHome()
    expect(figure.store.getSnapshot().phase).toBe('seated')
    expect(where(figure.store)).toEqual(HOME)
    expect(figure.remnants()).toEqual([])
  })
})
