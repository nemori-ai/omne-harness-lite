import { useLayoutEffect, useRef, useState } from 'react'

import { type DataAttributes } from '../patterns/ai/data-attributes.ts'
import { dataApart } from './data-apart.ts'
import { besideSpot, type Spot } from './say.ts'
import { type Box } from './travel.ts'

export interface FigureLabelLine {
  readonly text: string
  readonly tone?: 'plain' | 'hint' | undefined
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5

export function FigureLabel({
  figure,
  bounds,
  lines,
  ...rest
}: DataAttributes & {
  readonly figure: Box
  readonly bounds: Box
  readonly lines: readonly FigureLabelLine[]
}): React.JSX.Element {
  const own = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  useLayoutEffect(() => {
    const element = own.current
    if (element === null) return
    const next = besideSpot(
      figure,
      { width: element.offsetWidth, height: element.offsetHeight },
      bounds,
    )
    if (spot === null || !near(spot.left, next.left) || !near(spot.top, next.top)) setSpot(next)
  })
  return (
    <div
      {...dataApart(rest)[0]}
      ref={own}
      className="omne-figure-label"
      style={spot === null ? { visibility: 'hidden' } : { left: spot.left, top: spot.top }}
    >
      {lines.map((line, index) => (
        <span key={index} className="omne-figure-label-line" data-tone={line.tone ?? 'plain'}>
          {line.text}
        </span>
      ))}
    </div>
  )
}
