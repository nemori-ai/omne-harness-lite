// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIGURE_SIZE,
  FigureSeat,
  FigureStage,
  RedrawProvider,
  type FigureControl,
  type FigureHand,
  type Redraw,
} from '../src/index.ts'
import { WRITE } from '../src/ink/body.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { type PointerAt } from '../src/ink/hand.ts'
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

const at = ([x, y]: Point): string =>
  `translate(${(x - FIGURE_SIZE / 2).toFixed(2)}px, ${(y - FIGURE_SIZE / 2).toFixed(2)}px)`

type StageProps = Omit<ComponentProps<typeof FigureStage>, 'label' | 'children'>

function Page({
  onSeat,
  ...stage
}: StageProps & { readonly onSeat?: () => void }): React.JSX.Element {
  return (
    <FigureStage label="形在想" awayLabel="叫形回来" {...stage}>
      <button type="button" onClick={onSeat}>
        <FigureSeat name="home" />
      </button>
    </FigureStage>
  )
}

const ink = (): Element | null => document.querySelector('[data-figure-ink]')
const empty = (): HTMLElement | null => screen.queryByRole('button', { name: '叫形回来' })

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

describe('away from the page (FE-I64)', () => {
  it('draws no figure and asks for no frame, while the seat is still worked out', () => {
    const time = frameClock()
    placeSeats()
    seats.set('home', HOME)
    const control = createRef<FigureControl>()
    const view = render(<Page away doing="thinking" waiting={2} control={control} />)
    time.wait(20)
    const asked = time.requested()
    time.wait(6000)
    expect(ink()).toBeNull()
    expect(document.querySelector('.omne-figure-remnant')).toBeNull()
    expect(time.requested()).toBe(asked)
    view.rerender(<Page away doing="writing" waiting={3} control={control} />)
    time.wait(6000)
    expect(time.requested()).toBe(asked)
    seats.set('home', [640, 320])
    act(() => window.dispatchEvent(new Event('resize')))
    expect(control.current?.seatPoint()).toEqual({ x: 640, y: 320 })
    expect(empty()?.style.transform).toBe(at([640, 320]))
  })

  it('a figure drawn by another hand is not drawn either', () => {
    const time = frameClock()
    placeSeats()
    seats.set('home', HOME)
    const redraw: Redraw = (_kind, key, _subject, builtIn) =>
      key === 'figure' ? <b data-mascot="" /> : builtIn()
    render(
      <RedrawProvider value={redraw}>
        <Page away />
      </RedrawProvider>,
    )
    time.wait(20)
    expect(document.querySelector('[data-mascot]')).toBeNull()
  })

  it('leaves an empty seat as large as the figure on its seat, named by awayLabel; pressing it only recalls', () => {
    const time = frameClock()
    placeSeats()
    seats.set('home', HOME)
    const recall = vi.fn()
    const seat = vi.fn()
    const pressed = vi.fn()
    render(<Page away onRecall={recall} onSeat={seat} onPress={pressed} />)
    time.wait(20)
    const spot = empty()
    expect(spot).not.toBeNull()
    expect(spot?.style.transform).toBe(at(HOME))
    expect(spot?.style.width).toBe(`${FIGURE_SIZE}px`)
    expect(spot?.style.height).toBe(`${FIGURE_SIZE}px`)
    act(() => spot?.click())
    expect(recall).toHaveBeenCalledTimes(1)
    expect(seat).not.toHaveBeenCalled()
    expect(pressed).not.toHaveBeenCalled()
  })

  it('leaves no empty seat when no seat is to be seen, and one once a seat shows', () => {
    const time = frameClock()
    placeSeats()
    render(<Page away />)
    time.wait(20)
    expect(empty()).toBeNull()
    seats.set('home', HOME)
    act(() => window.dispatchEvent(new Event('resize')))
    expect(empty()?.style.transform).toBe(at(HOME))
    seats.delete('home')
    act(() => window.dispatchEvent(new Event('resize')))
    expect(empty()).toBeNull()
  })

  it('without away there is no empty seat and the figure is drawn as before', () => {
    const time = frameClock()
    placeSeats()
    seats.set('home', HOME)
    render(<Page />)
    time.wait(20)
    expect(empty()).toBeNull()
    expect(ink()).not.toBeNull()
  })

  it('back from away, the figure is written anew on its seat and the empty seat is gone', () => {
    const time = frameClock()
    placeSeats()
    seats.set('home', HOME)
    const view = render(<Page away />)
    time.wait(200)
    const asked = time.requested()
    view.rerender(<Page away={false} />)
    expect(empty()).toBeNull()
    expect(ink()).not.toBeNull()
    const carried = document.querySelector<HTMLElement>('.omne-figure-carried')!
    expect(carried.dataset['phase']).toBe('seated')
    expect(carried.style.transform).toBe(at(HOME))
    time.wait(20)
    expect(time.requested()).toBeGreaterThan(asked)
  })
})

const pointer = (x: number, y: number, more: Partial<PointerAt> = {}): PointerAt => ({
  id: 1,
  buttons: 1,
  client: { x, y },
  screen: { x: x + 1000, y: y + 500 },
  meta: false,
  shift: false,
  ...more,
})

function seatElement(name: string): HTMLElement {
  const element = document.createElement('span')
  element.dataset['figureSeat'] = name
  document.body.append(element)
  return element
}

function store(): {
  readonly figure: FigureStore
  readonly hands: FigureHand[]
  readonly remnants: () => readonly Remnant[]
} {
  seats.set('home', HOME)
  const figure = new FigureStore()
  figure.liftable = true
  const hands: FigureHand[] = []
  figure.onHand = hand => {
    hands.push(hand)
    return true
  }
  figure.seatAt('home', { element: seatElement('home'), priority: 1, beside: () => undefined })
  let remnants: readonly Remnant[] = []
  figure.journeys.subscribe(next => {
    remnants = [...next]
  })
  return { figure, hands, remnants: () => remnants }
}

describe('away and the store', () => {
  it('back from away writes the circle anew on the seat', () => {
    const time = frameClock()
    placeSeats()
    const { figure } = store()
    time.wait(WRITE.circle + 50)
    figure.setAway(true)
    expect(figure.getSnapshot()).toMatchObject({ present: false, away: true })
    expect(figure.body.frame().marks).toEqual([])
    figure.setAway(false)
    expect(figure.getSnapshot()).toMatchObject({ phase: 'seated', present: true, away: false })
    expect(figure.centre()).toEqual({ x: HOME[0], y: HOME[1] })
    expect(figure.body.frame().marks.map(mark => mark.written)).toEqual([0])
    time.wait(WRITE.circle + 50)
    expect(figure.body.frame().marks.map(mark => mark.written)).toEqual([1])
  })

  it('going away mid-journey drops the journey', () => {
    const time = frameClock()
    placeSeats()
    const { figure, remnants } = store()
    time.wait(WRITE.circle + 50)
    seats.set('head', [600, 400])
    figure.seatAt('head', { element: seatElement('head'), priority: 2, beside: () => undefined })
    time.wait(50)
    expect(figure.getSnapshot().phase).toBe('flying')
    figure.setAway(true)
    expect(remnants()).toEqual([])
    const asked = figure.getSnapshot()
    time.wait(3000)
    expect(figure.getSnapshot()).toBe(asked)
    expect(figure.body.frame().marks).toEqual([])
  })

  it('a hand that goes away keeps telling where it is and lets go, drawing nothing', () => {
    const time = frameClock()
    placeSeats()
    const { figure, hands } = store()
    time.wait(WRITE.circle + 50)
    figure.pointerDown(pointer(...HOME))
    figure.pointerMove(pointer(300, 200))
    figure.setAway(true)
    expect(figure.getSnapshot()).toMatchObject({ phase: 'held', present: false })
    figure.pointerMove(pointer(900, -40))
    time.wait(1)
    figure.pointerUp(pointer(950, -60, { buttons: 0 }))
    expect(hands.map(hand => [hand.kind, hand.client.x])).toEqual([
      ['lift', 300],
      ['move', 900],
      ['drop', 950],
    ])
    expect(figure.body.frame().marks).toEqual([])
  })

  it('back from away while still in the hand, it is written under the hand', () => {
    const time = frameClock()
    placeSeats()
    const { figure, hands } = store()
    time.wait(WRITE.circle + 50)
    figure.pointerDown(pointer(...HOME))
    figure.pointerMove(pointer(300, 200))
    figure.setAway(true)
    figure.pointerMove(pointer(420, 260))
    time.wait(1)
    figure.setAway(false)
    expect(figure.getSnapshot()).toMatchObject({ phase: 'held', present: true })
    expect(figure.centre()).toEqual({ x: 420, y: 260 })
    expect(figure.body.frame().marks).toHaveLength(1)
    expect(hands.map(hand => hand.kind)).toEqual(['lift', 'move'])
  })

  it('a figure the host took and then sent away is on its seat when it comes back', () => {
    const time = frameClock()
    placeSeats()
    const { figure } = store()
    time.wait(WRITE.circle + 50)
    figure.pointerDown(pointer(...HOME))
    figure.pointerMove(pointer(300, 200))
    figure.pointerUp(pointer(300, 200, { buttons: 0 }))
    expect(figure.getSnapshot().phase).toBe('dropped')
    figure.setAway(true)
    figure.goHome()
    figure.setAway(false)
    expect(figure.getSnapshot()).toMatchObject({ phase: 'seated', present: true })
    expect(figure.centre()).toEqual({ x: HOME[0], y: HOME[1] })
  })
})
