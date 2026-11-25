import type { KeyPress, Reader } from '@omne-harness/shell-contract'
import { Button, GlideMenu, Textarea } from '@omne-harness/ui-kit'
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  NO_ASSIST,
  type Assist,
  type AssistAnswer,
  type AssistKey,
  type ComposerAssistant,
  type ComposerHelper,
} from '../model/composer-assistant.ts'
import { stopFace } from '../model/composer.ts'
import type { ComposerDraftStore } from '../model/composer-drafts.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import type { Open } from '../model/session-machine.ts'
import { sessionComposer, sessionComposerInput } from '../parts.ts'
import type { ComposerHandles, SendWay } from '../model/composer-handles.ts'
import { ComposerActionSlot } from './composer-action-slot.tsx'
import { PartDrawContext } from './part-draw.ts'
import { SendWays } from './send-ways.tsx'
import { AGENT_NAME } from './side-frame.tsx'

const KEYS: Readonly<Record<string, AssistKey>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  Tab: 'tab',
  Enter: 'enter',
  Escape: 'escape',
}
const NOBODY: Reader<ComposerAssistant> = { get: () => undefined, subscribe: () => () => {} }
const IDLE = { subscribe: () => () => {}, read: () => NO_ASSIST }

const placeholderOf = (waiting: number, busy: boolean): string =>
  waiting > 0
    ? `发消息给${AGENT_NAME}，会排队，不算回答`
    : busy
      ? '写好下一句，现在即可排队'
      : `发消息给${AGENT_NAME}`

/** The helper of this composer while there is an assistant and a tenant; none otherwise. */
function useHelper(
  reader: Reader<ComposerAssistant>,
  scope: string | undefined,
  session: string,
): ComposerHelper | null {
  const assistant = useSyncExternalStore(reader.subscribe, reader.get)
  const [helper, setHelper] = useState<ComposerHelper | null>(null)
  useEffect(() => {
    if (assistant === undefined || scope === undefined) {
      setHelper(null)
      return undefined
    }
    const opened = assistant.open(scope, session)
    setHelper(opened)
    return () => opened.close()
  }, [assistant, scope, session])
  return helper
}

/** Tells the helper once of each input the server refused for a reason. */
function useRefusals(state: Open, helper: ComposerHelper | null): void {
  const told = useRef(new Set<string>())
  useEffect(() => {
    for (const input of state.inputs) {
      const reason = input.status === 'refused' ? input.notice?.reason : undefined
      if (reason === undefined || told.current.has(input.acceptId)) continue
      told.current.add(input.acceptId)
      helper?.refused(reason)
    }
  }, [state.inputs, helper])
}

function Marks({ text, assist }: { readonly text: string; readonly assist: Assist }) {
  const parts: ReactNode[] = []
  let at = 0
  for (const mark of assist.marks) {
    if (mark.from < at) continue
    parts.push(text.slice(at, mark.from))
    parts.push(
      <mark key={mark.from} data-tone={mark.tone} title={mark.label}>
        {text.slice(mark.from, mark.to)}
      </mark>,
    )
    at = mark.to
  }
  parts.push(text.slice(at))
  return (
    <>
      {parts.map((part, n) => (
        <Fragment key={n}>{part}</Fragment>
      ))}
      {assist.ghost === '' ? null : <span data-ghost="">{assist.ghost}</span>}
      {'​'}
    </>
  )
}

function Menu({
  assist,
  id,
  onTake,
}: {
  readonly assist: Assist
  readonly id: string
  readonly onTake: (at: number) => void
}) {
  const menu = assist.menu
  if (menu === null) return null
  return (
    <div className="omne-composer-menu">
      <GlideMenu activeId={menu.items.length === 0 ? undefined : `${id}-${String(menu.selected)}`}>
        <ul id={id} role="listbox" aria-label="能点名的">
          {menu.items.map((item, n) => (
            <li
              key={item.id}
              id={`${id}-${String(n)}`}
              role="option"
              aria-selected={n === menu.selected}
              aria-disabled={item.unavailable !== null}
              data-glide-row=""
              data-selected={n === menu.selected}
              onMouseDown={event => {
                event.preventDefault()
                onTake(n)
              }}
            >
              <code>{item.label}</code>
              <span>{item.title}</span>
              <span data-kind="">{item.kind}</span>
              {item.unavailable === null ? null : <span data-why="">{item.unavailable}</span>}
            </li>
          ))}
        </ul>
      </GlideMenu>
      <p>{menu.note}</p>
    </div>
  )
}

export type ComposerProps = Readonly<{
  state: Open
  driver: SessionDriver
  scope: string | undefined
  status: ReactNode
  waiting: number
  drafts: ComposerDraftStore
  attachments: (session: string, draft: string) => ReactNode
  assistant?: Reader<ComposerAssistant>
}>

/** The module's side of the composer's keys: where it shows itself, and which way a key sends now. */
export type ComposerKeys = Readonly<{
  handles: ComposerHandles
  wayOf: (press: KeyPress) => SendWay | null
}>

/** Without it plain Enter sends and no action reaches the composer. */
export const ComposerKeysContext = createContext<ComposerKeys | null>(null)

type Latest = Readonly<{
  sendAs: (way: SendWay) => true | string
  write: (next: string, caret: number) => void
  say: (words: string) => void
  text: string
}>

/** Puts the caret where a write asked once that write is drawn, in the same task, so no keystroke comes between. */
function useCaret(field: RefObject<HTMLTextAreaElement | null>) {
  const pending = useRef<Readonly<{ text: string; caret: number }> | null>(null)
  useLayoutEffect(() => {
    const want = pending.current
    pending.current = null
    if (want !== null && field.current?.value === want.text)
      field.current.setSelectionRange(want.caret, want.caret)
  })
  return (text: string, caret: number): void => {
    if (field.current?.value !== text) pending.current = { text, caret }
    else field.current.setSelectionRange(caret, caret)
  }
}

function useComposerHandle(
  keys: ComposerKeys | null,
  session: string,
  field: RefObject<HTMLTextAreaElement | null>,
  now: Latest,
): void {
  const latest = useRef(now)
  latest.current = now
  useEffect(
    () =>
      keys?.handles.show({
        session,
        focus: () => field.current?.focus(),
        insert: words => {
          const { text, write } = latest.current
          const at = field.current?.selectionStart ?? text.length
          write(text.slice(0, at) + words + text.slice(at), at + words.length)
        },
        send: way => latest.current.sendAs(way),
        write: words => {
          const { text, write } = latest.current
          const next = `${words}${text.trimStart()}`
          field.current?.focus()
          write(next, next.length)
        },
        say: words => latest.current.say(words),
      }),
    [keys, session, field],
  )
}

export function Composer({
  state,
  driver,
  scope,
  status,
  waiting,
  drafts,
  attachments,
  assistant = NOBODY,
}: ComposerProps) {
  const keys = useContext(ComposerKeysContext)
  const drawer = useContext(PartDrawContext)
  const { session } = state
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const place = useCaret(field)
  const layer = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const draft = useSyncExternalStore(drafts.subscribe, () => drafts.read(session))
  useEffect(() => () => drafts.drop(session), [drafts, session])
  const helper = useHelper(assistant, scope, session)
  const held = helper ?? IDLE
  const assist = useSyncExternalStore(held.subscribe, held.read)
  useRefusals(state, helper)
  const canSend =
    draft.ready &&
    assist.blocked === null &&
    (text.trim().length > 0 || draft.attachments.length > 0)
  const write = (next: string, caret: number) => {
    setText(next)
    helper?.input(next, caret)
    place(next, caret)
  }
  const send = (words: string, seen = assist.seen, how?: SendWay) => {
    const way = how === 'send' ? undefined : how
    void driver.send(words, drafts.take(session), seen ?? undefined, way)
    setText('')
    helper?.input('', 0)
  }
  const sendAs = (way: SendWay): true | string => {
    if (!canSend) return assist.blocked ?? '没有要发的内容'
    send(text, assist.seen, way)
    return true
  }
  const submit = () => void sendAs('send')
  const say = (words: string) => void driver.send(words, [], undefined)
  useComposerHandle(keys, session, field, { sendAs, write, say, text })
  const follow = (answer: AssistAnswer) => {
    if (answer.kind === 'edit') write(answer.text, answer.caret)
    if (answer.kind === 'send') submit()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    const key = KEYS[event.key]
    const plainEnter = event.key === 'Enter' && !event.shiftKey
    if (key !== undefined && helper !== null && (event.key !== 'Enter' || plainEnter)) {
      const answer = helper.key(key)
      if (answer.kind !== 'pass') {
        event.preventDefault()
        follow(answer)
        return
      }
    }
    const way = keys === null ? (plainEnter ? 'send' : null) : keys.wayOf(event.nativeEvent)
    if (way === null) return
    event.preventDefault()
    void sendAs(way)
  }
  const caretOf = () => field.current?.selectionStart ?? text.length
  const builtIn = () => (
    <form
      className="omne-composer"
      {...sessionComposer.props}
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <Menu assist={assist} id={menuId} onTake={at => helper !== null && follow(helper.take(at))} />
      <div className="omne-composer-field">
        <div className="omne-composer-marks" aria-hidden="true">
          <div ref={layer}>
            <Marks text={text} assist={assist} />
          </div>
        </div>
        <Textarea
          {...sessionComposerInput.props}
          ref={field}
          aria-label="输入消息"
          aria-controls={assist.menu === null ? undefined : menuId}
          aria-expanded={assist.menu !== null}
          placeholder={placeholderOf(waiting, state.run.kind !== 'idle')}
          rows={1}
          value={text}
          onChange={event => {
            setText(event.target.value)
            helper?.input(event.target.value, event.target.selectionStart)
          }}
          onSelect={() => helper?.input(text, caretOf())}
          onScroll={event => {
            const top = event.currentTarget.scrollTop
            if (layer.current !== null)
              layer.current.style.transform = `translateY(${String(-top)}px)`
          }}
          onCompositionStart={() => helper?.composing(true)}
          onCompositionEnd={event => {
            helper?.input(event.currentTarget.value, event.currentTarget.selectionStart)
            helper?.composing(false)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {assist.blocked === null || assist.menu !== null ? null : (
        <p className="omne-composer-blocked" role="status">
          {assist.blocked}
          <Button
            type="button"
            variant="link"
            size="compact"
            onClick={() => send(helper?.literal(text) ?? text, null)}
          >
            按原样发送
          </Button>
        </p>
      )}
      <div>{attachments(session, draft.draft)}</div>
      <div className="omne-composer-actions">
        <div className="omne-session-status">{status}</div>
        {state.run.kind === 'idle' ? null : (
          <SendWays
            canSend={canSend}
            onSend={way => void sendAs(way)}
            onForceStop={() => driver.cancel('force')}
          />
        )}
        <ComposerActionSlot
          face={stopFace(state.run)}
          canSend={canSend}
          onStop={() => driver.cancel()}
        />
      </div>
    </form>
  )
  if (drawer === null) return builtIn()
  return sessionComposer.draw(drawer, builtIn, {
    running: state.run.kind !== 'idle',
    empty: text.trim().length === 0,
  })
}
