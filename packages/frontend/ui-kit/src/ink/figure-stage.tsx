import {
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { useReducedMotion } from '../motion/motion.ts'
import { useRedrawn } from '../redraw/redraw.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import { type Doing, type FigureMoment } from './body.ts'
import { StageContext } from './seat.tsx'
import { FigureInk } from './figure-ink.tsx'
import { FigureJourneys } from './figure-journeys.tsx'
import { type FigureHand, type PointerAt } from './hand.ts'
import { FIGURE_SIZE, FigureStore, type FigureSnapshot } from './store.ts'
import { type Box, type Placement } from './travel.ts'

let pageFigure: object | null = null
let saidTwice = false

export interface FigureControl {
  goHome(): void
  seatPoint(): Placement | null
}

const translate = ({ x, y }: Placement, size: number): string =>
  `translate(${(x - size / 2).toFixed(2)}px, ${(y - size / 2).toFixed(2)}px)`

export function placeAt(element: HTMLElement, at: Placement, size: number): void {
  element.style.transform = translate(at, size)
}

const pointerAt = (event: React.PointerEvent): PointerAt => ({
  id: event.pointerId,
  buttons: event.buttons,
  client: { x: event.clientX, y: event.clientY },
  screen: { x: event.screenX, y: event.screenY },
  meta: event.metaKey,
  shift: event.shiftKey,
})

function capture(element: HTMLElement, pointer: number): void {
  if (typeof element.setPointerCapture === 'function') element.setPointerCapture(pointer)
}

function letGo(element: HTMLElement, pointer: number): void {
  if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(pointer))
    element.releasePointerCapture(pointer)
}

interface Reachable {
  pointerDown(at: PointerAt): void
  pointerMove(at: PointerAt): void
  pointerUp(at: PointerAt): void
  cancel(pointer: number): void
}

export function FigureReach({ store }: { readonly store: Reachable }): React.JSX.Element {
  return (
    <span
      className="omne-figure-reach"
      data-control="figure"
      onPointerDown={event => {
        if (event.button !== 0) return
        capture(event.currentTarget, event.pointerId)
        store.pointerDown(pointerAt(event))
      }}
      onPointerMove={event => store.pointerMove(pointerAt(event))}
      onPointerUp={event => {
        letGo(event.currentTarget, event.pointerId)
        store.pointerUp(pointerAt(event))
      }}
      onPointerCancel={event => store.cancel(event.pointerId)}
    />
  )
}

function useLayout(store: FigureStore, owns: boolean): void {
  useEffect(() => {
    if (!owns) return undefined
    const again = store.hostChanged
    window.addEventListener('resize', again)
    document.addEventListener('scroll', again, { capture: true, passive: true })
    const resized = new ResizeObserver(again)
    resized.observe(document.body)
    const put = new MutationObserver(again)
    put.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['inert'] })
    return () => {
      window.removeEventListener('resize', again)
      document.removeEventListener('scroll', again, { capture: true })
      resized.disconnect()
      put.disconnect()
    }
  }, [store, owns])
}

function usePointer(store: FigureStore, owns: boolean): void {
  useEffect(() => {
    if (!owns) return undefined
    const move = (event: MouseEvent): void =>
      store.pointerOver({ x: event.clientX, y: event.clientY })
    const leave = (event: MouseEvent): void => {
      if (event.relatedTarget === null) store.pointerOver(null)
    }
    window.addEventListener('mousemove', move, true)
    document.addEventListener('mouseout', leave)
    return () => {
      window.removeEventListener('mousemove', move, true)
      document.removeEventListener('mouseout', leave)
    }
  }, [store, owns])
}

function useEscape(store: FigureStore, on: boolean): void {
  useEffect(() => {
    if (!on) return undefined
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (!store.escape(event.metaKey, event.shiftKey)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [store, on])
}

export function useOnlyFigure(owner: object, name: string): boolean {
  const [owns, setOwns] = useState(false)
  useLayoutEffect(() => {
    if (pageFigure !== null && pageFigure !== owner) {
      if (!saidTwice) console.error(`${name}: a page holds one figure; this one draws nothing.`)
      saidTwice = true
      return undefined
    }
    pageFigure = owner
    setOwns(true)
    return () => {
      if (pageFigure === owner) pageFigure = null
      setOwns(false)
    }
  }, [owner, name])
  return owns
}

interface Following {
  follow(doing: Doing | null, moment: FigureMoment | null): void
  setWaiting(count: number): void
  dispose(): void
}

export function useFollowing(
  store: Following,
  owns: boolean,
  doing: Doing | undefined,
  moment: FigureMoment | undefined,
  waiting: number,
): void {
  const kind = moment?.kind
  const serial = moment?.serial
  useEffect(() => {
    if (!owns) return
    store.follow(
      doing ?? null,
      kind === undefined || serial === undefined ? null : { kind, serial },
    )
  }, [store, owns, doing, kind, serial])
  useEffect(() => {
    if (owns) store.setWaiting(waiting)
  }, [store, owns, waiting])
  useEffect(() => () => store.dispose(), [store])
}

interface Lifting {
  readonly liftable: boolean
  readonly onHand: ((hand: FigureHand) => boolean | void) | undefined
  readonly away: boolean
  readonly control: React.Ref<FigureControl> | undefined
}

function useLifting(store: FigureStore, { liftable, onHand, away, control }: Lifting): void {
  useLayoutEffect(() => store.setAway(away), [store, away])
  useEffect(() => {
    store.liftable = liftable
    store.onHand = onHand ?? null
  }, [store, liftable, onHand])
  useImperativeHandle(
    control,
    () => ({ goHome: () => store.goHome(), seatPoint: () => store.seatPoint() }),
    [store],
  )
}

function Figure({
  store,
  doing,
  waiting,
}: {
  readonly store: FigureStore
  readonly doing: Doing | undefined
  readonly waiting: number
}): React.JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const { size, phase, hover, present, away } = snapshot
  const body = useRedrawn(
    'piece',
    'figure',
    { size, phase, hover, doing: doing ?? 'idle', waiting },
    () => <FigureInk body={store.body} size={size} />,
  )
  const carried = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = carried.current
    if (element === null) return undefined
    return store.onPlaced(placement => placeAt(element, placement, store.getSnapshot().size))
  }, [store, snapshot.size])
  return (
    <div
      ref={carried}
      className="omne-figure-carried"
      data-phase={present || phase === 'held' ? phase : 'away'}
      data-hover={hover ? '' : undefined}
      style={{ width: size, height: size }}
    >
      <FigureReach store={store} />
      {!away && body}
    </div>
  )
}

function EmptySeat({
  store,
  label,
  onRecall,
}: {
  readonly store: FigureStore
  readonly label: string
  readonly onRecall: (() => void) | undefined
}): React.JSX.Element | null {
  const { away, point, size } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  if (!away || point === null) return null
  return (
    <button
      type="button"
      className="omne-figure-vacant"
      data-control="figure"
      aria-label={label}
      style={{ width: size, height: size, transform: translate(point, size) }}
      onClick={() => onRecall?.()}
    />
  )
}

export function FigureStage({
  doing,
  moment,
  waiting = 0,
  onPress,
  liftable = false,
  onHand,
  away = false,
  awayLabel = '叫它回来',
  onRecall,
  control,
  label,
  children,
}: {
  readonly doing?: Doing | undefined
  readonly moment?: FigureMoment | undefined
  readonly waiting?: number
  readonly onPress?: (() => void) | undefined
  readonly liftable?: boolean
  readonly onHand?: ((hand: FigureHand) => boolean | void) | undefined
  readonly away?: boolean
  readonly awayLabel?: string
  readonly onRecall?: (() => void) | undefined
  readonly control?: React.Ref<FigureControl> | undefined
  readonly label: string
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const [store] = useState(() => new FigureStore(moment?.serial ?? null))
  const owns = useOnlyFigure(store, 'FigureStage')
  const factor = useSizeFactor()
  const reduced = useReducedMotion()

  useLayoutEffect(() => store.setAppSize(factor), [store, factor])
  useLayoutEffect(() => store.setReduced(reduced), [store, reduced])
  useEffect(() => {
    store.onPress = onPress ?? null
  }, [store, onPress])
  useLifting(store, { liftable, onHand, away, control })
  useFollowing(store, owns, doing, moment, waiting)
  useLayout(store, owns)
  usePointer(store, owns)
  useEscape(store, owns && liftable)

  return (
    <StageContext.Provider value={owns ? store : null}>
      {children}
      {owns && (
        <div className="omne-figure-layer" data-figure-own="">
          <FigureJourneys journeys={store.journeys} />
          <Figure store={store} doing={doing} waiting={waiting} />
          <EmptySeat store={store} label={awayLabel} onRecall={onRecall} />
          <span className="sr-only" role="status">
            {label}
          </span>
        </div>
      )}
    </StageContext.Provider>
  )
}

const NOWHERE: FigureSnapshot = {
  phase: 'seated',
  present: false,
  size: FIGURE_SIZE,
  seat: null,
  point: null,
  hover: false,
  away: false,
}

const never = (): (() => void) => () => undefined

export function useFigureWhere(): FigureSnapshot {
  const store = useContext(StageContext)
  return useSyncExternalStore(
    store === null ? never : store.subscribe,
    () => store?.getSnapshot() ?? NOWHERE,
    () => NOWHERE,
  )
}

export const figureBox = (point: Placement, size: number): Box => ({
  x: point.x - size / 2,
  y: point.y - size / 2,
  width: size,
  height: size,
})
