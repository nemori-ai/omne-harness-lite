import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { type DataAttributes } from '../patterns/ai/data-attributes.ts'
import { dataApart } from './data-apart.ts'
import { InkBubble, useUnfold } from './ink-bubble.tsx'
import { composing, SayInsideOf, type PhraseSide } from './say-inside.tsx'
import {
  besideSpot,
  canSay,
  hasPictures,
  hasWords,
  isSending,
  NOTE_WIDTH,
  SAY_WORDS,
  type SayAct,
  type SayNote,
  type SayWords,
  type Spot,
} from './say.ts'
import { type Box } from './travel.ts'

export interface SaySaid {
  readonly text: string
  readonly target: string
}

export interface SayControl {
  reach(): Box | null
}

export interface SayBubbleProps extends DataAttributes {
  readonly note: SayNote | null
  readonly figure: Box
  readonly bounds: Box
  readonly onTarget: (target: string) => void
  readonly onText: (text: string) => void
  readonly onSend: (said: SaySaid) => void
  readonly onClose: () => void
  readonly onOpen: () => void
  readonly onDropPicture?: ((index: number) => void) | undefined
  readonly onSettings?: (() => void) | undefined
  readonly onPhrase?: ((key: string) => void) | undefined
  readonly words?: Partial<SayWords> | undefined
  readonly reduced?: boolean | undefined
  readonly ref?: React.Ref<HTMLElement> | undefined
  readonly control?: React.Ref<SayControl> | undefined
}

function useSpot(
  element: React.RefObject<HTMLElement | null>,
  open: number | null,
  figure: Box,
  bounds: Box,
): Spot | null {
  const [spot, setSpot] = useState<(Spot & { readonly open: number }) | null>(null)
  useLayoutEffect(() => {
    const own = element.current
    if (open === null || own === null || spot?.open === open) return
    const size = { width: NOTE_WIDTH, height: own.offsetHeight }
    setSpot({ open, ...besideSpot(figure, size, bounds) })
  })
  return spot !== null && spot.open === open ? spot : null
}

function useAttach(
  own: React.RefObject<HTMLElement | null>,
  ref: React.Ref<HTMLElement> | undefined,
): (element: HTMLElement | null) => void {
  return useCallback(
    (element: HTMLElement | null) => {
      own.current = element
      if (typeof ref === 'function') ref(element)
      else if (ref) (ref as React.RefObject<HTMLElement | null>).current = element
    },
    [own, ref],
  )
}

function closers(
  keep: () => boolean,
  onClose: () => void,
): Pick<React.HTMLAttributes<HTMLElement>, 'onKeyDown' | 'onBlur'> {
  return {
    onKeyDown: event => {
      if (event.key !== 'Escape' || composing(event) || event.defaultPrevented) return
      if (!event.currentTarget.contains(event.target as Node)) return
      event.preventDefault()
      onClose()
    },
    onBlur: event => {
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) return
      if (!keep()) onClose()
    },
  }
}

const placed = (spot: Spot | null): React.CSSProperties =>
  spot === null
    ? { width: NOTE_WIDTH, visibility: 'hidden' }
    : { width: NOTE_WIDTH, left: spot.left, top: spot.top }

const FRAME_PARTS = ['omne-ink-bubble-paper', 'omne-ink-bubble-edge', 'omne-ink-bubble-wet']

function reachOf(element: HTMLElement | null): Box | null {
  if (element === null) return null
  const inside = [...element.children].filter(
    child => !FRAME_PARTS.some(part => child.classList.contains(part)),
  )
  const boxes = [element, ...inside]
    .map(each => each.getBoundingClientRect())
    .filter(box => box.width > 0 && box.height > 0)
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map(box => box.left))
  const y = Math.min(...boxes.map(box => box.top))
  const right = Math.max(...boxes.map(box => box.right))
  const bottom = Math.max(...boxes.map(box => box.bottom))
  return { x, y, width: right - x, height: bottom - y }
}

const sideOf = (spot: Spot | null, figure: Box): PhraseSide =>
  spot === null || spot.left >= figure.x + figure.width / 2 ? 'right' : 'left'

export function SayBubble({
  note,
  figure,
  bounds,
  onTarget,
  onText,
  onSend,
  onClose,
  onOpen,
  onDropPicture,
  onSettings,
  onPhrase,
  words: given,
  reduced,
  ref,
  control,
  ...rest
}: SayBubbleProps): React.JSX.Element | null {
  const words: SayWords = { ...SAY_WORDS, ...given }
  const unfold = useUnfold(note)
  const shown = unfold.shown
  const own = useRef<HTMLElement | null>(null)
  const choosing = useRef(false)
  const spot = useSpot(own, shown === null ? null : unfold.serial, figure, bounds)
  const attach = useAttach(own, ref)
  useImperativeHandle(control, () => ({ reach: () => reachOf(own.current) }), [])
  useLayoutEffect(() => {
    if (spot !== null) own.current?.querySelector<HTMLElement>('textarea, input')?.focus()
  }, [spot])

  if (shown === null) return null
  const sayable = canSay(shown)
  const stopped = isSending(shown)
  const act: SayAct = {
    write: text => {
      if (!stopped) onText(text)
    },
    choose: onTarget,
    send: () => {
      if (sayable && shown.target !== undefined) onSend({ text: shown.text, target: shown.target })
    },
    phrase: key => {
      if (!stopped) onPhrase?.(key)
    },
    drop: index => onDropPicture?.(index),
    open: onOpen,
    close: onClose,
    settings: () => onSettings?.(),
  }
  const keep = (): boolean =>
    choosing.current || unfold.closing || hasWords(shown.text) || hasPictures(shown)
  return (
    <InkBubble
      key={unfold.serial}
      {...dataApart(rest)[0]}
      ref={attach}
      className="omne-say-bubble"
      ink="light"
      figure={figure}
      origin={spot === null ? null : [spot.left, spot.top]}
      closing={unfold.closing}
      onGone={unfold.gone}
      inert={unfold.closing}
      {...(reduced !== undefined && { reduced })}
      style={placed(spot)}
      {...closers(keep, onClose)}
    >
      <SayInsideOf
        note={shown}
        act={act}
        words={words}
        sayable={sayable}
        choosing={choosing}
        side={sideOf(spot, figure)}
      />
    </InkBubble>
  )
}
