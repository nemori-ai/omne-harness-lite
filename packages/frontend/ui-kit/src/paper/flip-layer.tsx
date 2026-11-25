import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { casual } from '../ink/casual.ts'
import { inkNow } from '../ink/clock.ts'
import { StageContext } from '../ink/seat.tsx'
import { type FigureStore } from '../ink/store.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import {
  FaceFlip,
  type FlipPlan,
  flipPlan,
  type FlipState,
  type FlipToward,
  foldAt,
} from './flip.ts'

const SHADE_DEPTH = 0.9

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function follow(flip: FaceFlip, figure: FigureStore): () => void {
  let was: FlipState = flip.current()
  return flip.subscribe(() => {
    const now = flip.current()
    if (now.phase === 'approach' && was.phase !== 'approach') {
      const { take, give, approach, carry, settle } = now.plan
      figure.turn({
        legs: [
          { to: take, ms: approach, hold: true },
          { to: give, ms: carry, carry: true },
        ],
        settle,
      })
    }
    if (now.phase === 'carry' && was.phase !== 'carry' && now.carried !== null)
      figure.turnGo(now.carried)
    if (now.phase === 'idle' && was.phase !== 'idle' && now.cut) figure.endTurn()
    was = now
  })
}

export function useFaceFlip(): FaceFlip {
  const figure = useContext(StageContext)
  const factor = useSizeFactor()
  const held = useRef({ figure, factor })
  held.current = { figure, factor }
  const [flip] = useState(
    () =>
      new FaceFlip({
        now: inkNow,
        later: (run, ms) => {
          const timer = setTimeout(run, ms)
          return () => clearTimeout(timer)
        },
        frame: run => {
          const frame = requestAnimationFrame(() => run())
          return () => cancelAnimationFrame(frame)
        },
        reduced: reducedMotion,
        plan: (toward: FlipToward): FlipPlan => {
          const { figure: stage, factor: size } = held.current
          const at = stage?.getSnapshot().present === true ? stage.centre() : null
          return flipPlan(
            { width: window.innerWidth, height: window.innerHeight, size: size > 0 ? size : 1 },
            toward,
            at,
            () => casual.random(),
          )
        },
      }),
  )
  useEffect(() => (figure === null ? undefined : follow(flip, figure)), [flip, figure])
  useEffect(() => () => flip.stop(), [flip])
  return flip
}

function paint(
  flip: FaceFlip,
  toward: FlipToward,
  sheet: HTMLElement,
  shade: HTMLElement | null,
): void {
  const width = window.innerWidth
  const fold = foldAt(flip.current(), inkNow())
  const x = fold?.x ?? (toward === 'left' ? width : 0)
  const kept = width > 0 ? (toward === 'left' ? x / width : (width - x) / width) : 1
  sheet.style.transform = `scaleX(${Math.max(0.0001, kept).toFixed(5)})`
  if (shade === null) return
  shade.style.transform = `translateX(${(x - shade.offsetWidth / 2).toFixed(1)}px)`
  shade.style.opacity = (fold === null ? 0 : Math.sin(Math.PI * fold.share) * SHADE_DEPTH).toFixed(
    3,
  )
}

function useSqueeze(
  flip: FaceFlip,
  plan: FlipPlan | null,
  leaving: () => HTMLElement | null,
  shade: React.RefObject<HTMLDivElement | null>,
): void {
  const leavingNow = useRef(leaving)
  leavingNow.current = leaving
  useLayoutEffect(() => {
    if (plan === null) return undefined
    const sheet = leavingNow.current()
    if (sheet === null) return undefined
    sheet.style.transformOrigin = plan.toward === 'left' ? 'left center' : 'right center'
    let frame = 0
    const tick = (): void => {
      paint(flip, plan.toward, sheet, shade.current)
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(frame)
      sheet.style.removeProperty('transform')
      sheet.style.removeProperty('transform-origin')
    }
  }, [flip, plan, shade])
}

export function FlipLayer({
  flip,
  leaving,
}: {
  readonly flip: FaceFlip
  readonly leaving: () => HTMLElement | null
}): React.JSX.Element | null {
  const state = useSyncExternalStore(flip.subscribe, flip.current, flip.current)
  const plan = state.phase === 'idle' ? null : state.plan
  const shade = useRef<HTMLDivElement>(null)
  const [catching, setCatching] = useState(false)
  useSqueeze(flip, plan, leaving, shade)
  if (plan === null && !catching) return null
  const swallow = (event: React.SyntheticEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <div
      className="omne-flip"
      data-control="flip"
      data-phase={state.phase}
      data-toward={plan?.toward}
      aria-hidden="true"
      onPointerDown={event => {
        swallow(event)
        setCatching(true)
        flip.stop()
      }}
      onPointerUp={event => {
        swallow(event)
        setTimeout(() => setCatching(false), 0)
      }}
      onPointerCancel={() => setCatching(false)}
      onClick={event => {
        swallow(event)
        setCatching(false)
      }}
      onContextMenu={event => {
        swallow(event)
        setCatching(false)
      }}
    >
      <div ref={shade} className="omne-flip-shade" />
    </div>
  )
}
