import { useEffect, useRef } from 'react'

import { cn } from '../lib/utils.ts'
import { type FigureBody } from './body.ts'
import { InkCanvas, OWN_PAPER, REACH } from './ink-canvas.ts'

export function FigureInk({
  body,
  size,
  className,
}: {
  readonly body: FigureBody
  readonly size: number
  readonly className?: string
}): React.JSX.Element {
  const paper = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = paper.current
    if (canvas === null) return undefined
    const ink = new InkCanvas(canvas, size, OWN_PAPER)
    const unsubscribe = body.subscribe(frame => {
      ink.draw(frame)
    })
    return () => {
      unsubscribe()
      ink.dispose()
    }
  }, [body, size])

  const side = size * REACH
  const inset = (size - side) / 2
  return (
    <span
      className={cn('omne-figure-ink', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-figure-ink=""
    >
      <canvas
        ref={paper}
        className="omne-figure-paper"
        style={{ left: inset, top: inset, width: side, height: side }}
      />
    </span>
  )
}
