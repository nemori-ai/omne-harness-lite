import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
import { IconButton } from '../patterns/icon-button.tsx'
import { useRedrawn } from '../redraw/redraw.ts'
import {
  hasPictures,
  isSending,
  REPLY_HEIGHT,
  sayLine,
  shownPhrases,
  shownReply,
  type SayAct,
  type SayLine,
  type SayNote,
  type SayPhrase,
  type SayPicture,
  type SayReply,
  type SayWords,
} from './say.ts'

export type PhraseSide = 'right' | 'left'

export const composing = (event: React.KeyboardEvent): boolean =>
  event.nativeEvent.isComposing || event.keyCode === 229

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
  text,
  label,
  readOnly,
  onText,
  onSend,
}: {
  readonly text: string
  readonly label: string
  readonly readOnly: boolean
  readonly onText: (text: string) => void
  readonly onSend: () => void
}): React.JSX.Element {
  return (
    <Textarea
      className="omne-say-field"
      rows={1}
      value={text}
      readOnly={readOnly}
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
  readonly onDrop: (index: number) => void
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
            onClick={() => onDrop(index)}
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
  readonly onSettings: () => void
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
      <Button variant="ghost" size="compact" onClick={onSettings}>
        {words.settings}
      </Button>
    </div>
  )
}

const atEnd = (element: HTMLElement): boolean =>
  element.scrollTop + element.clientHeight >= element.scrollHeight - 1

function SayReplyBlock({
  reply,
  words,
}: {
  readonly reply: SayReply
  readonly words: SayWords
}): React.JSX.Element {
  const own = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  useLayoutEffect(() => {
    const element = own.current
    if (element !== null && stuck.current) element.scrollTop = element.scrollHeight
  })
  return (
    <div
      ref={own}
      className="omne-say-reply"
      role="log"
      aria-busy={reply.state === 'coming'}
      data-state={reply.state}
      style={{ maxHeight: REPLY_HEIGHT }}
      onScroll={event => {
        stuck.current = atEnd(event.currentTarget)
      }}
    >
      {reply.text !== '' && <p className="omne-say-reply-text">{reply.text}</p>}
      {reply.state === 'unknown' && <p className="omne-say-reply-told">{words.replyUnknown}</p>}
      {reply.more === true && <p className="omne-say-reply-told">{words.replyMore}</p>}
    </div>
  )
}

function SayRow({
  note,
  words,
  sayable,
  act,
}: {
  readonly note: SayNote
  readonly words: SayWords
  readonly sayable: boolean
  readonly act: SayAct
}): React.JSX.Element {
  return (
    <div className="omne-say-row">
      {note.fate?.kind === 'accepted' && (
        <IconButton label={words.open} size="icon-compact" onClick={act.open}>
          <ConversationIcon />
        </IconButton>
      )}
      <Button variant="ghost" size="compact" onClick={act.close}>
        {words.close}
      </Button>
      <Button size="compact" disabled={!sayable} onClick={act.send}>
        {words.send}
      </Button>
    </div>
  )
}

function SayPhrases({
  phrases,
  side,
  stopped,
  onPhrase,
}: {
  readonly phrases: readonly SayPhrase[]
  readonly side: PhraseSide
  readonly stopped: boolean
  readonly onPhrase: (key: string) => void
}): React.JSX.Element {
  return (
    <div className="omne-say-phrases" data-side={side}>
      {phrases.map(phrase => (
        <Button
          key={phrase.key}
          variant="outline"
          size="compact"
          disabled={stopped}
          onClick={() => onPhrase(phrase.key)}
        >
          {phrase.label}
        </Button>
      ))}
    </div>
  )
}

export function SayInsideOf({
  note,
  act,
  words,
  sayable,
  choosing,
  side,
}: {
  readonly note: SayNote
  readonly act: SayAct
  readonly words: SayWords
  readonly sayable: boolean
  readonly choosing: React.RefObject<boolean>
  readonly side: PhraseSide
}): React.JSX.Element {
  const subject = {
    note: {
      targets: note.targets,
      target: note.target,
      text: note.text,
      pictures: note.pictures,
      told: note.told,
      fate: note.fate,
      reply: note.reply,
      phrases: note.phrases,
    },
    act,
  }
  const reply = shownReply(note)
  const phrases = shownPhrases(note)
  return useRedrawn('piece', 'note', subject, () => (
    <>
      {hasPictures(note) && (
        <SayPictures pictures={note.pictures ?? []} words={words} onDrop={act.drop} />
      )}
      <SayTo note={note} label={words.to} onTarget={act.choose} choosing={choosing} />
      <SayField
        text={note.text}
        label={words.field}
        readOnly={isSending(note)}
        onText={act.write}
        onSend={act.send}
      />
      <FateLine line={sayLine(note, words)} words={words} onSettings={act.settings} />
      {reply !== null && <SayReplyBlock reply={reply} words={words} />}
      <SayRow note={note} words={words} sayable={sayable} act={act} />
      {phrases.length > 0 && (
        <SayPhrases phrases={phrases} side={side} stopped={isSending(note)} onPhrase={act.phrase} />
      )}
    </>
  ))
}
