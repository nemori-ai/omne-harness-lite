import {
  useContext,
  useEffect,
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
import { FIGURE_SIZE, FigureStore, type FigureSnapshot } from './store.ts'
import { type Box, type Placement } from './travel.ts'

let pageStage: FigureStore | null = null
let saidTwice = false

function placeAt(element: HTMLElement, { x, y }: Placement, size: number): void {
  element.style.transform = `translate(${(x - size / 2).toFixed(2)}px, ${(y - size / 2).toFixed(2)}px)`
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

function useOwnPage(store: FigureStore): boolean {
  const [owns, setOwns] = useState(false)
  useLayoutEffect(() => {
    if (pageStage !== null && pageStage !== store) {
      if (!saidTwice) console.error('FigureStage: a page holds one figure; this one draws nothing.')
      saidTwice = true
      return undefined
    }
    pageStage = store
    setOwns(true)
    return () => {
      if (pageStage === store) pageStage = null
      setOwns(false)
    }
  }, [store])
  return owns
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
  const { size, phase, hover } = snapshot
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
      data-phase={snapshot.present ? snapshot.phase : 'away'}
      data-hover={snapshot.hover ? '' : undefined}
      style={{ width: snapshot.size, height: snapshot.size }}
    >
      <span
        className="omne-figure-reach"
        data-control="figure"
        onPointerDown={event => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          store.pointerDown()
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
          store.pointerUp()
        }}
        onPointerCancel={() => store.cancel()}
      />
      {body}
    </div>
  )
}

export function FigureStage({
  doing,
  moment,
  waiting = 0,
  onPress,
  label,
  children,
}: {
  readonly doing?: Doing | undefined
  readonly moment?: FigureMoment | undefined
  readonly waiting?: number
  readonly onPress?: (() => void) | undefined
  readonly label: string
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const [store] = useState(() => new FigureStore(moment?.serial ?? null))
  const owns = useOwnPage(store)
  const factor = useSizeFactor()
  const reduced = useReducedMotion()
  const kind = moment?.kind
  const serial = moment?.serial

  useLayoutEffect(() => store.setAppSize(factor), [store, factor])
  useLayoutEffect(() => store.setReduced(reduced), [store, reduced])
  useEffect(() => {
    store.onPress = onPress ?? null
  }, [store, onPress])
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
  useLayout(store, owns)
  usePointer(store, owns)

  return (
    <StageContext.Provider value={owns ? store : null}>
      {children}
      {owns && (
        <div className="omne-figure-layer" data-figure-own="">
          <FigureJourneys journeys={store.journeys} />
          <Figure store={store} doing={doing} waiting={waiting} />
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
