import type { FloatCorner, PartDrawer } from '@omne-harness/shell-contract'
import {
  ConversationIcon,
  focusSurface,
  IconButton,
  InkBubble,
  InlineNotice,
  LoadingIndicator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SendIcon,
  Textarea,
  type Box,
} from '@omne-harness/ui-kit'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { SayAnswer, SayTarget } from '../model/say.ts'
import { sessionCompanionPanel, type CompanionPanelDrawing, type CompanionPort } from '../parts.ts'
import { AGENT_NAME } from './side-frame.tsx'
import { boxOf, useUnfold } from './side-panel.tsx'

export const PANEL_LABEL = '对 Agent 说一句话'
export const SENT_TEXT = '已发出。'
export const UNKNOWN_TEXT = '结果不知道。到对话页看这句话，可以在那里再确认。'
export const SHOW_LABEL = '去对话页看'
const NEW = 'new'
const FOLLOW = 'follow'
const NEW_NAME = '新会话'
const OPEN_NAME = '打开着的会话'

/** Whom the words go to: what a person picked, or while nothing is picked the open session, or a new one. */
export function sayTargetOf(picked: string, current: string | null): SayTarget {
  const to = picked === FOLLOW ? (current ?? NEW) : picked
  return to === NEW ? { kind: 'new' } : { kind: 'session', session: to }
}

/** Where the figure the panel is written out of sits in the window, measured while the panel is there. */
function useFigureBox(figure: RefObject<HTMLElement | null>, on: boolean, corner: FloatCorner) {
  const [box, setBox] = useState<Box | null>(null)
  useLayoutEffect(() => {
    const element = figure.current
    if (!on || element === null) return undefined
    const look = (): void => setBox(boxOf(element.getBoundingClientRect()))
    look()
    window.addEventListener('resize', look)
    return () => window.removeEventListener('resize', look)
  }, [figure, on, corner.x, corner.y])
  return box
}

type Said = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'saying' }> | SayAnswer

function Outcome({ said, show }: { readonly said: Said; readonly show: () => void }) {
  if (said.kind === 'failed')
    return (
      <InlineNotice tone="danger" still>
        {said.reason}
      </InlineNotice>
    )
  if (said.kind !== 'sent' && said.kind !== 'unknown') return null
  return (
    <p className="omne-companion-receipt" role="status">
      <span>{said.kind === 'sent' ? SENT_TEXT : UNKNOWN_TEXT}</span>
      <IconButton label={SHOW_LABEL} size="icon-compact" onClick={show}>
        <ConversationIcon aria-hidden="true" />
      </IconButton>
    </p>
  )
}

type WhomProps = Readonly<{
  sessions: NonNullable<CompanionPort['sessions']>
  to: SayTarget
  onPick: (picked: string) => void
}>

/** Whom the words go to: a new session, the open one even while the list has not named it, or one of the list. */
function Whom({ sessions, to, onPick }: WhomProps) {
  const value = to.kind === 'new' ? NEW : to.session
  const named = sessions.find(item => item.session === value)?.name
  const unlisted = to.kind === 'session' && named === undefined
  return (
    <Select value={value} onValueChange={onPick}>
      <SelectTrigger aria-label="说给谁" size="sm">
        <SelectValue>{to.kind === 'new' ? NEW_NAME : (named ?? OPEN_NAME)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NEW}>{NEW_NAME}</SelectItem>
        {unlisted ? <SelectItem value={value}>{OPEN_NAME}</SelectItem> : null}
        {sessions.map(item => (
          <SelectItem key={item.session} value={item.session}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The panel as it ships: one field, whom the words go to, send, and one line for how they ended. */
function SayForm({ sessions, current, say, show, close }: CompanionPanelDrawing) {
  const [words, setWords] = useState('')
  const [picked, setPicked] = useState(FOLLOW)
  const [said, setSaid] = useState<Said>({ kind: 'idle' })
  const to = sayTargetOf(picked, current)
  const saying = said.kind === 'saying'
  const submit = (): void => {
    if (saying || words.trim() === '') return
    setSaid({ kind: 'saying' })
    void say(to, words).then(answer => {
      setSaid(answer)
      if (answer.kind === 'sent') setWords('')
    })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }
  return (
    <form
      className="omne-companion-form"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        aria-label={`说给${AGENT_NAME}的话`}
        placeholder={`说给${AGENT_NAME}`}
        rows={2}
        value={words}
        onChange={event => {
          setWords(event.target.value)
          if (!saying) setSaid({ kind: 'idle' })
        }}
        onKeyDown={onKeyDown}
      />
      <div className="omne-companion-actions">
        <Whom sessions={sessions ?? []} to={to} onPick={setPicked} />
        <IconButton
          type="submit"
          label="发送"
          size="icon-compact"
          disabled={saying || words.trim() === ''}
        >
          {saying ? <LoadingIndicator size="sm" /> : <SendIcon aria-hidden="true" />}
        </IconButton>
      </div>
      <Outcome
        said={said}
        show={() => {
          show()
          close()
        }}
      />
    </form>
  )
}

export type CompanionPanelProps = Readonly<{
  shell: PartDrawer
  port: CompanionPort
  figure: RefObject<HTMLElement | null>
  corner: FloatCorner
  unfolded: boolean
  close: (refocus: boolean) => void
}>

/** The panel in the ink bubble written out of the figure: it folds on Escape and on a press elsewhere. */
export function CompanionPanel({
  shell,
  port,
  figure,
  corner,
  unfolded,
  close,
}: CompanionPanelProps) {
  const unfold = useUnfold(unfolded)
  const bubble = useRef<HTMLElement>(null)
  const box = useFigureBox(figure, unfold.kept, corner)
  const there = unfold.kept && box !== null
  useEffect(() => {
    if (!unfolded || !there) return undefined
    const frame = requestAnimationFrame(() => {
      if (bubble.current !== null) focusSurface(bubble.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [unfolded, there])
  useEffect(() => {
    if (!unfolded) return undefined
    const pressed = (event: PointerEvent): void => {
      const path = event.composedPath()
      if (path.some(node => node === figure.current || node === bubble.current)) return
      if (
        path.some(
          node => node instanceof Element && node.hasAttribute('data-radix-popper-content-wrapper'),
        )
      )
        return
      close(false)
    }
    document.addEventListener('pointerdown', pressed, true)
    return () => document.removeEventListener('pointerdown', pressed, true)
  }, [unfolded, close, figure])
  if (!there) return null
  const given: CompanionPanelDrawing = { ...port, close: () => close(true) }
  return (
    <InkBubble
      key={unfold.serial}
      ref={bubble}
      as="section"
      className="omne-companion-panel"
      {...sessionCompanionPanel.props}
      role="dialog"
      aria-label={PANEL_LABEL}
      inert={unfold.closing}
      side={corner.y === 'end' ? 'above' : 'below'}
      figure={box}
      closing={unfold.closing}
      onGone={unfold.gone}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        close(true)
      }}
    >
      {sessionCompanionPanel.draw(
        shell,
        () => (
          <SayForm {...given} />
        ),
        given,
      )}
    </InkBubble>
  )
}
