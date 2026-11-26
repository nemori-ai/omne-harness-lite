import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { useReducedMotion } from '../motion/motion.ts'
import { type DataAttributes } from '../patterns/ai/data-attributes.ts'
import { useRedrawn } from '../redraw/redraw.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import { type Doing, type FigureMoment } from './body.ts'
import { dataApart } from './data-apart.ts'
import { FigureReach, placeAt, useFollowing, useOnlyFigure } from './figure-stage.tsx'
import { FigureInk } from './figure-ink.tsx'
import { FigureJourneys } from './figure-journeys.tsx'
import { LooseStore, type LooseHands, type LooseMode, type LooseWhere } from './loose.ts'
import { FIGURE_SIZE } from './store.ts'
import { type Box } from './travel.ts'

export interface LooseControl {
  reach(): Box | null
}

export type LooseFigureProps = LooseWhere &
  LooseHands &
  DataAttributes & {
    readonly doing?: Doing | undefined
    readonly moment?: FigureMoment | undefined
    readonly waiting?: number
    readonly size?: number | undefined
    readonly reduced?: boolean | undefined
    readonly rewriteFirst?: boolean | undefined
    readonly control?: React.Ref<LooseControl> | undefined
  }

const PHASE = { hand: 'held', rest: 'seated', home: 'flying' } as const

function Carried({
  store,
  size,
  mode,
  doing,
  waiting,
}: {
  readonly store: LooseStore
  readonly size: number
  readonly mode: Exclude<LooseMode, 'none'>
  readonly doing: Doing | undefined
  readonly waiting: number
}): React.JSX.Element {
  const body = useRedrawn(
    'piece',
    'figure',
    { size, phase: PHASE[mode], hover: false, doing: doing ?? 'idle', waiting },
    () => <FigureInk body={store.body} size={size} />,
  )
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
      <FigureReach store={store} />
      {body}
    </div>
  )
}

function useShown(store: LooseStore, owns: boolean, where: LooseWhere): void {
  const mode = where.mode
  const x = where.mode === 'none' ? null : where.at.x
  const y = where.mode === 'none' ? null : where.at.y
  useLayoutEffect(() => {
    if (!owns) return
    store.show(
      mode === 'none' || x === null || y === null ? { mode: 'none' } : { mode, at: { x, y } },
    )
  }, [store, owns, mode, x, y])
}

export function LooseFigure(props: LooseFigureProps): React.JSX.Element | null {
  const { doing, moment, waiting = 0, rewriteFirst = false, control } = props
  const [store] = useState(() => new LooseStore(moment?.serial ?? null))
  const owns = useOnlyFigure(store, 'LooseFigure')
  const factor = useSizeFactor()
  const system = useReducedMotion()
  const size = props.size ?? FIGURE_SIZE * factor
  const reduced = props.reduced ?? system

  useLayoutEffect(() => {
    store.hands = props
  })
  useLayoutEffect(() => store.setSize(size), [store, size])
  useLayoutEffect(() => store.setReduced(reduced), [store, reduced])
  useLayoutEffect(() => store.setRewriteFirst(rewriteFirst), [store, rewriteFirst])
  useShown(store, owns, props)
  useFollowing(store, owns, doing, moment, waiting)
  useImperativeHandle(control, () => ({ reach: () => store.reach() }), [store])

  if (!owns || props.mode === 'none') return null
  return (
    <div {...dataApart(props)[0]} className="omne-figure-layer">
      <FigureJourneys journeys={store.journeys} />
      <Carried store={store} size={size} mode={props.mode} doing={doing} waiting={waiting} />
    </div>
  )
}
