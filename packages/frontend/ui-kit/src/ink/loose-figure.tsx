import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { useReducedMotion } from '../motion/motion.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import { type Doing, type FigureMoment } from './body.ts'
import { capture, letGo, placeAt, pointerAt, useOnlyFigure } from './figure-stage.tsx'
import { FigureInk } from './figure-ink.tsx'
import { FigureJourneys } from './figure-journeys.tsx'
import { LooseStore, type LooseHands, type LooseMode, type LooseWhere } from './loose.ts'
import { FIGURE_SIZE } from './store.ts'
import { type Box } from './travel.ts'

export interface LooseControl {
  reach(): Box | null
}

export type LooseFigureProps = LooseWhere &
  LooseHands & {
    readonly doing?: Doing | undefined
    readonly moment?: FigureMoment | undefined
    readonly waiting?: number
    readonly size?: number | undefined
    readonly reduced?: boolean | undefined
    readonly control?: React.Ref<LooseControl> | undefined
  }

function Carried({
  store,
  size,
  mode,
}: {
  readonly store: LooseStore
  readonly size: number
  readonly mode: LooseMode
}): React.JSX.Element {
  const carried = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = carried.current
    if (element === null) return undefined
    return store.onPlaced(at => placeAt(element, at, size))
  }, [store, size])
  return (
    <div
      ref={carried}
      className="omne-figure-carried"
      data-mode={mode}
      style={{ width: size, height: size }}
    >
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
      <FigureInk body={store.body} size={size} />
    </div>
  )
}

export function LooseFigure(props: LooseFigureProps): React.JSX.Element | null {
  const { doing, moment, waiting = 0, control } = props
  const [store] = useState(() => new LooseStore(moment?.serial ?? null))
  const owns = useOnlyFigure(store, 'LooseFigure')
  const factor = useSizeFactor()
  const system = useReducedMotion()
  const size = props.size ?? FIGURE_SIZE * factor
  const reduced = props.reduced ?? system
  const mode = props.mode
  const x = props.mode === 'none' ? null : props.at.x
  const y = props.mode === 'none' ? null : props.at.y
  const kind = moment?.kind
  const serial = moment?.serial

  useLayoutEffect(() => {
    store.hands = props
  })
  useLayoutEffect(() => store.setSize(size), [store, size])
  useLayoutEffect(() => store.setReduced(reduced), [store, reduced])
  useLayoutEffect(() => {
    if (!owns) return
    store.show(
      mode === 'none' || x === null || y === null ? { mode: 'none' } : { mode, at: { x, y } },
    )
  }, [store, owns, mode, x, y])
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
  useImperativeHandle(control, () => ({ reach: () => store.reach() }), [store])

  if (!owns || mode === 'none') return null
  return (
    <div className="omne-figure-layer omne-loose-figure">
      <FigureJourneys journeys={store.journeys} />
      <Carried store={store} size={size} mode={mode} />
    </div>
  )
}
