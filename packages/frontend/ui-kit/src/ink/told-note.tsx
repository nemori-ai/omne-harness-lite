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

const sameSpot = (was: Placement | null, here: Placement): boolean =>
  was !== null && was.x === here.x && was.y === here.y

function useToldSpot(said: Told | null): {
  readonly unfold: ReturnType<typeof useUnfold<Told>>
  readonly size: number
  readonly at: Placement | null
} {
  const where = useFigureWhere()
  const here = where.present ? where.point : null
  const live = said !== null && where.phase === 'seated' && here !== null ? said : null
  const unfold = useUnfold(live)
  const [sat, setSat] = useState<Placement | null>(here)
  if (live !== null && here !== null && !sameSpot(sat, here)) setSat(here)
  return { unfold, size: where.size, at: live !== null ? here : sat }
}

function useToldLines(id: string | undefined): {
  readonly words: React.RefObject<HTMLSpanElement | null>
  readonly lines: number
} {
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
  }, [id])
  return { words, lines }
}

export function ToldNote({
  said,
  onOpen,
  maxLines,
}: {
  readonly said: Told | null
  readonly onOpen?: ((told: Told) => void) | undefined
  readonly maxLines?: number | undefined
}): React.JSX.Element | null {
  const { unfold, size, at } = useToldSpot(said)
  const telling = unfold.shown
  const { words, lines: own } = useToldLines(telling?.id)
  const lines = maxLines === undefined ? own : Math.min(own, maxLines)
  if (telling === null || at === null) return null
  const open = (): void => onOpen?.(telling)
  return (
    <InkBubble
      key={telling.id}
      as="figure"
      className="omne-told-note"
      figure={figureBox(at, size)}
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
