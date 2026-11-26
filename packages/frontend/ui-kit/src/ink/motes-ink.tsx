import { useEffect, useRef } from 'react'

import { cn } from '../lib/utils.ts'
import { useReducedMotion } from '../motion/motion.ts'
import { type DataAttributes } from '../patterns/ai/data-attributes.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import { dataApart } from './data-apart.ts'
import { InkCanvas, OWN_PAPER, REACH } from './ink-canvas.ts'
import { MotesBody, type MotesDoing } from './motes.ts'
import { FIGURE_SIZE } from './store.ts'

export type InkMotesDoing = 'idle' | 'thinking' | 'looking' | 'writing' | 'background'

const WORK: Readonly<Record<InkMotesDoing, MotesDoing>> = {
  idle: 'idle',
  thinking: 'working',
  looking: 'working',
  writing: 'working',
  background: 'background',
}

export function InkMotes({
  doing = 'idle',
  listening = false,
  carried = false,
  className,
  ...rest
}: DataAttributes & {
  readonly doing?: InkMotesDoing
  readonly listening?: boolean
  readonly carried?: boolean
  readonly className?: string
}): React.JSX.Element {
  const size = FIGURE_SIZE * useSizeFactor()
  const reduced = useReducedMotion()
  const paper = useRef<HTMLCanvasElement>(null)
  const body = useRef<MotesBody | null>(null)

  useEffect(() => {
    const canvas = paper.current
    if (canvas === null) return undefined
    const made = new MotesBody()
    const ink = new InkCanvas(canvas, size, OWN_PAPER)
    const unsubscribe = made.subscribe(frame => {
      ink.draw(frame)
    })
    body.current = made
    return () => {
      body.current = null
      unsubscribe()
      ink.dispose()
      made.dispose()
    }
  }, [size])
  useEffect(() => body.current?.setReduced(reduced), [reduced, size])
  useEffect(() => body.current?.setCarried(carried), [carried, size])
  useEffect(() => body.current?.setListening(listening), [listening, size])
  useEffect(() => body.current?.setDoing(WORK[doing]), [doing, size])

  const side = size * REACH
  const inset = (size - side) / 2
  return (
    <span
      {...dataApart(rest)[0]}
      className={cn('omne-figure-ink omne-motes', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-ink-motes=""
    >
      <canvas
        ref={paper}
        className="omne-figure-paper"
        style={{ left: inset, top: inset, width: side, height: side }}
      />
    </span>
  )
}
