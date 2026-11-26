import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '../controls/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../controls/select.tsx'
import { Textarea } from '../controls/textarea.tsx'
import { CloseIcon, ConversationIcon } from '../icons/index.ts'
import { type DataAttributes } from '../patterns/ai/data-attributes.ts'
import { IconButton } from '../patterns/icon-button.tsx'
import { dataApart } from './data-apart.ts'
import { InkBubble, useUnfold } from './ink-bubble.tsx'
import {
  besideSpot,
  canSay,
  hasPictures,
  hasWords,
  NOTE_WIDTH,
  SAY_WORDS,
  sayLine,
  type SayLine,
  type SayNote,
  type SayPicture,
  type SayWords,
  type Spot,
} from './say.ts'
import { type Box } from './travel.ts'

export interface SaySaid {
  readonly text: string
  readonly target: string
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
  readonly words?: Partial<SayWords> | undefined
  readonly reduced?: boolean | undefined
  readonly ref?: React.Ref<HTMLElement> | undefined
}

const composing = (event: React.KeyboardEvent): boolean =>
  event.nativeEvent.isComposing || event.keyCode === 229

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

function SayTo({
  note,
  label,
  onTarget,
  choosing,
}: {
  readonly note: SayNote
  readonly label: string
  readonly onTarget: (target: string) => void
  readonly choosing: React.RefObject<boolean>
}): React.JSX.Element {
  return (
    <Select
      value={note.target ?? ''}
      onValueChange={onTarget}
      disabled={note.targets === undefined}
      onOpenChange={open => {
        choosing.current = open
      }}
    >
      <SelectTrigger size="sm" className="omne-say-to" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent position="popper">
        {(note.targets ?? []).map(target => (
          <SelectItem key={target.id} value={target.id}>
            {target.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SayField({
  field,
  text,
  label,
  onText,
  onSend,
}: {
  readonly field: React.RefObject<HTMLTextAreaElement | null>
  readonly text: string
  readonly label: string
  readonly onText: (text: string) => void
  readonly onSend: () => void
}): React.JSX.Element {
  return (
    <Textarea
      ref={field}
      className="omne-say-field"
      rows={1}
      value={text}
      aria-label={label}
      placeholder={label}
      onChange={event => onText(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter' || event.shiftKey || composing(event)) return
        event.preventDefault()
        onSend()
      }}
    />
  )
}

type Thumbnails = { readonly of: readonly SayPicture[]; readonly urls: readonly string[] }

function useThumbnails(pictures: readonly SayPicture[]): readonly string[] {
  const [made, setMade] = useState<Thumbnails | null>(null)
  useEffect(() => {
    const urls = pictures.map(picture =>
      URL.createObjectURL(new Blob([picture.bytes], { type: 'image/png' })),
    )
    setMade({ of: pictures, urls })
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [pictures])
  return made?.of === pictures ? made.urls : []
}

function SayPictures({
  pictures,
  words,
  onDrop,
}: {
  readonly pictures: readonly SayPicture[]
  readonly words: SayWords
  readonly onDrop: ((index: number) => void) | undefined
}): React.JSX.Element {
  const urls = useThumbnails(pictures)
  return (
    <ul className="omne-say-pictures">
      {pictures.map((picture, index) => (
        <li key={index} className="omne-say-picture">
          {urls[index] !== undefined && (
            <img className="omne-say-thumb" src={urls[index]} alt={picture.name} />
          )}
          <IconButton
            label={`${words.drop}${picture.name}`}
            size="icon-compact"
            onClick={() => onDrop?.(index)}
          >
            <CloseIcon />
          </IconButton>
        </li>
      ))}
    </ul>
  )
}

function FateLine({
  line,
  words,
  onSettings,
}: {
  readonly line: SayLine | null
  readonly words: SayWords
  readonly onSettings: (() => void) | undefined
}): React.JSX.Element {
  const said = (
    <p className="omne-say-line" role="status" data-tone={line?.tone}>
      {line?.words}
    </p>
  )
  if (line?.settings !== true) return said
  return (
    <div className="omne-say-told">
      {said}
      <Button variant="ghost" size="compact" onClick={() => onSettings?.()}>
        {words.settings}
      </Button>
    </div>
  )
}

function SayRow({
  note,
  words,
  sayable,
  onOpen,
  onClose,
  onSend,
}: {
  readonly note: SayNote
  readonly words: SayWords
  readonly sayable: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly onSend: () => void
}): React.JSX.Element {
  return (
    <div className="omne-say-row">
      {note.fate?.kind === 'accepted' && (
        <IconButton label={words.open} size="icon-compact" onClick={onOpen}>
          <ConversationIcon />
        </IconButton>
      )}
      <Button variant="ghost" size="compact" onClick={onClose}>
        {words.close}
      </Button>
      <Button size="compact" disabled={!sayable} onClick={onSend}>
        {words.send}
      </Button>
    </div>
  )
}

const placed = (spot: Spot | null): React.CSSProperties =>
  spot === null
    ? { width: NOTE_WIDTH, visibility: 'hidden' }
    : { width: NOTE_WIDTH, left: spot.left, top: spot.top }

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
  words: given,
  reduced,
  ref,
  ...rest
}: SayBubbleProps): React.JSX.Element | null {
  const words: SayWords = { ...SAY_WORDS, ...given }
  const unfold = useUnfold(note)
  const shown = unfold.shown
  const own = useRef<HTMLElement | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const choosing = useRef(false)
  const spot = useSpot(own, shown === null ? null : unfold.serial, figure, bounds)
  const attach = useAttach(own, ref)
  useLayoutEffect(() => {
    if (spot !== null) field.current?.focus()
  }, [spot])

  if (shown === null) return null
  const sayable = canSay(shown)
  const send = (): void => {
    if (sayable && shown.target !== undefined) onSend({ text: shown.text, target: shown.target })
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
      {shown.pictures !== undefined && shown.pictures.length > 0 && (
        <SayPictures pictures={shown.pictures} words={words} onDrop={onDropPicture} />
      )}
      <SayTo note={shown} label={words.to} onTarget={onTarget} choosing={choosing} />
      <SayField field={field} text={shown.text} label={words.field} onText={onText} onSend={send} />
      <FateLine line={sayLine(shown, words)} words={words} onSettings={onSettings} />
      <SayRow
        note={shown}
        words={words}
        sayable={sayable}
        onOpen={onOpen}
        onClose={onClose}
        onSend={send}
      />
    </InkBubble>
  )
}
