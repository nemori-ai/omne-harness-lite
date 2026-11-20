import { useLayoutEffect, useRef, useState } from 'react'

import { InkBubble, useUnfold } from './ink-bubble.tsx'
import { figureBox, useFigureWhere } from './figure-stage.tsx'
import { type Placement } from './travel.ts'

export interface Told {
  readonly id: string
  readonly text: string
}

export const TOLD_LINES = 3

export const toldLines = (needed: number): number =>
  needed <= TOLD_LINES + 1 ? TOLD_LINES + 1 : TOLD_LINES

export function ToldNote({
  said,
  onOpen,
}: {
  readonly said: Told | null
  readonly onOpen?: ((told: Told) => void) | undefined
}): React.JSX.Element | null {
  const where = useFigureWhere()
  const here = where.present ? where.point : null
  const live = said !== null && where.phase === 'seated' && here !== null ? said : null
  const unfold = useUnfold(live)
  const [sat, setSat] = useState<Placement | null>(here)
  if (live !== null && here !== null && (sat === null || sat.x !== here.x || sat.y !== here.y))
    setSat(here)
  const at = live !== null ? here : sat
  const telling = unfold.shown
  const words = useRef<HTMLSpanElement | null>(null)
  const [lines, setLines] = useState(TOLD_LINES)
  useLayoutEffect(() => {
    const element = words.current
    if (element === null) return undefined
    const measure = (): void => {
      const line = Number.parseFloat(getComputedStyle(element).lineHeight)
      if (line > 0) setLines(toldLines(Math.round(element.scrollHeight / line)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [telling?.id])
  if (telling === null || at === null) return null
  const open = (): void => onOpen?.(telling)
  return (
    <InkBubble
      key={telling.id}
      as="figure"
      className="omne-told-note"
      figure={figureBox(at, where.size)}
      side="right"
      closing={unfold.closing}
      onGone={unfold.gone}
      inert={unfold.closing}
      style={{ '--omne-told-lines': lines } as React.CSSProperties}
    >
      <span
        ref={words}
        role="button"
        tabIndex={0}
        className="omne-told-note-words"
        data-control="told-note"
        onClick={open}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          open()
        }}
      >
        {telling.text}
      </span>
    </InkBubble>
  )
}
