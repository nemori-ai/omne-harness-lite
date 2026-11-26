import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { handPressure, type Point } from '../icons/brush.ts'
import { useReducedMotion } from '../motion/motion.ts'
import { brushTime, ms } from './body.ts'
import { widthPx } from './brush-weight.ts'
import { casual } from './casual.ts'
import { inkNow } from './clock.ts'
import { FRAME, frameLines, frameWriteTime, inkPath, type FrameLines } from './observation.ts'
import { type Box } from './travel.ts'

export interface ObservationFrameProps {
  readonly rect: Box | null
  readonly covered: readonly Box[]
  readonly figure: Box
  readonly closed?: boolean | undefined
  readonly reduced?: boolean | undefined
}

interface Held {
  readonly key: number
  readonly rect: Box
  readonly centre: Point
  readonly drying: boolean
}

interface Clock {
  readonly begun: number
  readonly write: number
  closedAt: number | null
  dryAt: number | null
  frame: number
}

const PAD = 8
const WASH_INSET = 4
const clamp = (value: number): number => Math.min(1, Math.max(0, value))
const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height)
const centreOf = (box: Box): Point => [box.x + box.width / 2, box.y + box.height / 2]
const width = (from: number, span: number) => (along: number) =>
  widthPx(FRAME.weight) * handPressure(clamp((along - from) / Math.max(1, span)))

interface Progress {
  readonly written: number
  readonly settled: number
  readonly closing: number
  readonly dried: number
}

function progress(clock: Clock, now: number, reduced: boolean): Progress {
  const dried = clock.dryAt === null ? 0 : clamp((now - clock.dryAt) / ms(FRAME.dry))
  if (reduced) return { written: 1, settled: 1, closing: 1, dried }
  const done = clock.begun + clock.write
  const shut = clock.closedAt === null ? 0 : Math.max(clock.closedAt, done)
  return {
    written: brushTime((now - clock.begun) / clock.write),
    settled: clamp((now - done) / ms(FRAME.settle.duration)),
    closing: brushTime((now - shut) / ms(FRAME.close)),
    dried,
  }
}

function drawLines(svg: SVGSVGElement, lines: FrameLines, { written, closing }: Progress): void {
  const edges = svg.querySelectorAll<SVGPathElement>("path[data-part='edge']")
  lines.runs.forEach((run, i) => {
    edges[i]?.setAttribute('d', inkPath(run, written * lines.length, width(0, lines.length)))
  })
  const gap = lines.mouth.reduce((sum, run) => Math.max(sum, run.along.at(-1) ?? 0), 0)
  const span = gap - lines.length
  const mouths = svg.querySelectorAll<SVGPathElement>("path[data-part='mouth']")
  lines.mouth.forEach((run, i) => {
    mouths[i]?.setAttribute(
      'd',
      inkPath(run, lines.length + closing * span, width(lines.length, span)),
    )
  })
}

function stateOf(clock: Clock, now: number, reduced: boolean): string {
  if (clock.dryAt !== null) return 'drying'
  return reduced || now >= clock.begun + clock.write ? 'open' : 'writing'
}

function moving(clock: Clock, { settled, closing, dried }: Progress): boolean {
  if (clock.dryAt !== null) return dried < 1
  return settled < 1 || (clock.closedAt !== null && closing < 1)
}

function paint(
  svg: SVGSVGElement,
  lines: FrameLines,
  clock: Clock,
  now: number,
  reduced: boolean,
): boolean {
  const at = progress(clock, now, reduced)
  drawLines(svg, lines, at)
  const opacity = (1 - (1 - FRAME.settle.to) * at.settled) * (1 - at.dried)
  svg.style.opacity = String(Math.round(opacity * 1000) / 1000)
  svg.dataset['state'] = stateOf(clock, now, reduced)
  return moving(clock, at)
}

function FrameInk({
  id,
  rect,
  centre,
  covered,
  closed,
  drying,
  reduced,
  onGone,
}: {
  readonly id: number
  readonly rect: Box
  readonly centre: Point
  readonly covered: readonly Box[]
  readonly closed: boolean
  readonly drying: boolean
  readonly reduced: boolean
  readonly onGone: (id: number) => void
}): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const coveredKey = JSON.stringify(covered)
  const fresh = useMemo(
    () => frameLines({ rect, covered: JSON.parse(coveredKey) as Box[], figure: centre }),
    [rect, coveredKey, centre],
  )
  const kept = useRef({ lines: fresh, closed })
  if (!drying) kept.current = { lines: fresh, closed }
  const { lines, closed: shut } = kept.current
  const [clock] = useState<Clock>(() => ({
    begun: inkNow(),
    write: ms(frameWriteTime(rect, (value, spread) => casual.around(value, spread))),
    closedAt: null,
    dryAt: null,
    frame: 0,
  }))

  useLayoutEffect(() => {
    const element = svg.current
    if (element === null) return undefined
    const now = inkNow()
    if (!shut) clock.closedAt = null
    else clock.closedAt ??= now
    if (drying) clock.dryAt ??= now
    if (drying && reduced) {
      onGone(id)
      return undefined
    }
    const step = (at: number): void => {
      clock.frame = 0
      if (paint(element, lines, clock, at, reduced))
        clock.frame = requestAnimationFrame(() => step(inkNow()))
      else if (clock.dryAt !== null) onGone(id)
    }
    cancelAnimationFrame(clock.frame)
    step(now)
    return () => {
      cancelAnimationFrame(clock.frame)
      clock.frame = 0
    }
  }, [clock, lines, shut, drying, reduced, onGone, id])

  const mask = useId()
  const hidden = JSON.parse(coveredKey) as Box[]
  const box = {
    left: rect.x - PAD,
    top: rect.y - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  }
  return (
    <svg
      ref={svg}
      className="omne-observation-frame"
      aria-hidden="true"
      data-closed={shut ? 'true' : 'false'}
      style={box}
      viewBox={`${box.left} ${box.top} ${box.width} ${box.height}`}
    >
      <mask id={mask} maskUnits="userSpaceOnUse" {...rect}>
        <rect {...rect} fill="white" />
        {hidden.map((each, i) => (
          <rect key={i} {...each} fill="black" />
        ))}
      </mask>
      <rect
        className="omne-observation-frame-wash"
        data-part="wash"
        mask={`url(#${mask})`}
        x={rect.x + WASH_INSET}
        y={rect.y + WASH_INSET}
        width={Math.max(0, rect.width - WASH_INSET * 2)}
        height={Math.max(0, rect.height - WASH_INSET * 2)}
        rx={Math.max(0, FRAME.corner - WASH_INSET)}
      />
      {lines.runs.map((_, i) => (
        <path key={`edge-${i}`} className="omne-observation-frame-line" data-part="edge" d="" />
      ))}
      {shut &&
        lines.mouth.map((_, i) => (
          <path key={`mouth-${i}`} className="omne-observation-frame-line" data-part="mouth" d="" />
        ))}
    </svg>
  )
}

function useHeld(rect: Box | null, figure: Box): readonly [readonly Held[], (key: number) => void] {
  const [held, setHeld] = useState<readonly Held[]>(() =>
    rect === null ? [] : [{ key: 1, rect, centre: centreOf(figure), drying: false }],
  )
  let now = held
  const live = held.find(frame => !frame.drying) ?? null
  if (!sameBox(live?.rect ?? null, rect)) {
    const key = held.reduce((most, frame) => Math.max(most, frame.key), 0) + 1
    now = [
      ...held.map(frame => (frame.drying ? frame : { ...frame, drying: true })),
      ...(rect === null ? [] : [{ key, rect, centre: centreOf(figure), drying: false }]),
    ]
    setHeld(now)
  }
  const gone = useCallback((key: number) => {
    setHeld(was => was.filter(frame => frame.key !== key))
  }, [])
  return [now, gone]
}

export function ObservationFrame({
  rect,
  covered,
  figure,
  closed = false,
  reduced: told,
}: ObservationFrameProps): React.JSX.Element {
  const system = useReducedMotion()
  const reduced = told ?? system
  const [held, gone] = useHeld(rect, figure)
  return (
    <>
      {held.map(frame => (
        <FrameInk
          key={frame.key}
          id={frame.key}
          rect={frame.rect}
          centre={frame.centre}
          covered={covered}
          closed={closed}
          drying={frame.drying}
          reduced={reduced}
          onGone={gone}
        />
      ))}
    </>
  )
}
