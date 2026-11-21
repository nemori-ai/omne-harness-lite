import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  MoreIcon,
  RetryIcon,
  Textarea,
  ValuePill,
} from '@omne-harness/ui-kit'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { stopFace } from '../model/composer.ts'
import { EMPTY_CONTENT, terminalOf, type HistoryEntry } from '../model/content.ts'
import { conversationItems, type Item } from '../model/conversation.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import { sessionName, shownBy, type SessionList } from '../model/session-list.ts'
import type { Open, PendingInput, State } from '../model/session-machine.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import type { Waiting } from '../model/waiting.ts'
import { ComposerActionSlot } from './composer-action-slot.tsx'
import { HeadingFoldContext, useHeadingFold, type HeadingFold } from './heading-fold.tsx'
import { NoticeLine } from './notice.tsx'
import { ItemView, speakerOf } from './parts.tsx'
import { useFollowBottom } from './scroll.ts'
import { FigureControl, SideFrameContext, useSideFrame } from './side-frame.tsx'
import { TranscriptRow, usePublication } from './transcript-arrivals.tsx'
import { useSession } from './use-session.ts'
import { WaitingNotice, waitingAnchor } from './waiting-notice.tsx'
import { useShownEntry } from './shown-entry.ts'

type WaitingCalls = Readonly<{
  subscribe: (tenant: string, session: string, listener: () => void) => () => void
  count: (tenant: string, session: string) => number
}>

export type ConversationPageProps = Readonly<{
  workspaces: SessionWorkspaces
  scope: string | undefined
  dock: (session: string) => ReactNode
  side: (session: string) => ReactNode
  status?: (session: string) => ReactNode
  /** The two everyday choices on the open session, at the right of its heading: the model and permissions. */
  heading?: (session: string) => ReactNode
  /** Verbs on the open session in its `⋯`, such as archiving it; each tells what came of it through `say`. */
  more?: (session: string, say: (text: string) => void) => ReactNode
  /** What the open session still holds, read again at each log position. */
  work?: (session: string, revision: string | null) => ReactNode
  /** While calls wait for a person, the composer says that what is sent now waits in line. */
  waitingCalls?: WaitingCalls
}>

export function ConversationPage({
  workspaces,
  scope,
  dock,
  side,
  status = () => null,
  heading = () => null,
  more = () => null,
  work = () => null,
  waitingCalls,
}: ConversationPageProps) {
  const handle = useSession(workspaces, scope)
  switch (handle.kind) {
    case 'waiting':
      return (
        <div className="omne-session-page">
          <SeatOnly />
        </div>
      )
    case 'unreadable':
      return (
        <div className="omne-session-page">
          <SeatOnly />
          <NoticeLine
            notice={{ kind: 'refused', text: '外壳给的租户读不懂，会话界面不能工作。' }}
          />
        </div>
      )
    case 'ready':
      return (
        <Page
          driver={handle.driver}
          scope={scope}
          dock={dock}
          side={side}
          status={status}
          heading={heading}
          more={more}
          work={work}
          waitingCalls={waitingCalls}
        />
      )
  }
}

type Parts = Readonly<{
  scope: string | undefined
  dock: (session: string) => ReactNode
  status: (session: string) => ReactNode
  work: (session: string, revision: string | null) => ReactNode
  waitingCalls: WaitingCalls | undefined
}>

/** Before there is a session to show, the header still holds the figure's seat. */
function SeatOnly() {
  return (
    <header className="omne-session-bar">
      <FigureControl frame={null} />
    </header>
  )
}

function Page({
  driver,
  side,
  heading,
  more,
  ...parts
}: Parts & {
  readonly driver: SessionDriver
  readonly side: (session: string) => ReactNode
  readonly heading: (session: string) => ReactNode
  readonly more: (session: string, say: (text: string) => void) => ReactNode
}) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  const page = useRef<HTMLDivElement>(null)
  const frame = useSideFrame(page)
  const title = titleOf(state, list)
  const fold = useHeadingFold(frame.header, title)
  const known = state.kind === 'open' || state.kind === 'unavailable' ? state.session : null
  const open = state.kind === 'open' ? state.session : null
  return (
    <SideFrameContext.Provider value={frame}>
      <div className="omne-session-page" ref={page}>
        <header className="omne-session-bar" ref={frame.header}>
          <h2 className="omne-session-title" ref={fold.title}>
            {title}
          </h2>
          <FigureControl frame={frame} />
          <div className="omne-session-bar-end" ref={fold.end}>
            <HeadingFoldContext.Provider value={fold.bar}>
              {open === null ? null : heading(open)}
            </HeadingFoldContext.Provider>
            {known === null ? null : (
              <SessionMore
                key={known}
                session={known}
                verbs={state.kind === 'open' ? more : null}
                folded={open !== null && fold.folded > 0 ? fold.folded : 0}
                choices={heading}
              />
            )}
          </div>
        </header>
        <div className="omne-session-body">
          <div className="omne-session-main">
            <ConnectionLine state={state} />
            <Body state={state} driver={driver} {...parts} />
          </div>
          {state.kind === 'open' ? side(state.session) : null}
        </div>
      </div>
    </SideFrameContext.Provider>
  )
}

function titleOf(state: State, list: SessionList): string {
  switch (state.kind) {
    case 'none':
      return '还没有会话'
    case 'creating':
      return '正在建会话'
    case 'open':
    case 'unavailable': {
      const listed = shownBy(list)?.sessions.find(item => item.session === state.session)
      return listed === undefined ? '新会话' : sessionName(listed)
    }
  }
}

const SHOWN_ID = 12

const shortened = (session: string): string =>
  session.length > SHOWN_ID ? `${session.slice(0, SHOWN_ID)}…` : session

function SessionMore({
  session,
  verbs,
  folded,
  choices,
}: {
  readonly session: string
  readonly verbs: ((session: string, say: (text: string) => void) => ReactNode) | null
  readonly folded: number
  readonly choices: (session: string) => ReactNode
}) {
  const [said, say] = useState<string | null>(null)
  const menu = useMemo<HeadingFold>(() => ({ place: 'menu', folded, say }), [folded])
  return (
    <>
      {said === null ? null : (
        <span className="omne-session-receipt" role="status">
          {said}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="更多" tooltipSide="bottom">
            <MoreIcon aria-hidden="true" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="omne-session-more">
          <DropdownMenuLabel className="omne-session-facts">
            <dl>
              <dt>会话标识</dt>
              <dd title={session}>
                <ValuePill mono>{shortened(session)}</ValuePill>
              </dd>
            </dl>
          </DropdownMenuLabel>
          <CopyItem value={session} />
          {folded === 0 ? null : (
            <>
              <DropdownMenuSeparator />
              <HeadingFoldContext.Provider value={menu}>
                {choices(session)}
              </HeadingFoldContext.Provider>
            </>
          )}
          {verbs === null ? null : (
            <>
              <DropdownMenuSeparator />
              {verbs(session, say)}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

const COPIED_SHOWN_MS = 1500
const COPY_LABEL = {
  idle: '复制会话标识',
  copied: '已复制会话标识',
  failed: '没有复制成功',
} as const

function CopyItem({ value }: { readonly value: string }) {
  const [outcome, setOutcome] = useState<keyof typeof COPY_LABEL>('idle')
  const revert = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(revert.current), [])
  const copy = async (): Promise<void> => {
    let copied = false
    try {
      await navigator.clipboard.writeText(value)
      copied = true
    } catch {
      copied = false
    }
    setOutcome(copied ? 'copied' : 'failed')
    clearTimeout(revert.current)
    revert.current = setTimeout(() => setOutcome('idle'), COPIED_SHOWN_MS)
  }
  return (
    <DropdownMenuItem
      onSelect={event => {
        event.preventDefault()
        void copy()
      }}
    >
      {COPY_LABEL[outcome]}
    </DropdownMenuItem>
  )
}

function ConnectionLine({ state }: { readonly state: State }) {
  if (state.kind !== 'open' || state.observation.kind !== 'reconnecting') return null
  return (
    <p className="omne-session-connection" role="status">
      更新断开了，正在第 {state.observation.attempt} 次重连
    </p>
  )
}

function Body({
  state,
  driver,
  ...parts
}: Parts & { readonly state: State; readonly driver: SessionDriver }) {
  switch (state.kind) {
    case 'none':
      return (
        <div className="omne-empty">
          {state.notice === null ? null : <NoticeLine notice={state.notice} />}
          <p>点「新建会话」开始一段对话。</p>
        </div>
      )
    case 'creating':
      return (
        <div className="omne-empty">
          {state.notice === null ? (
            <p>正在建会话……</p>
          ) : (
            <NoticeLine
              notice={state.notice}
              action={
                state.confirm === 'unknown'
                  ? { label: '再确认一次', onClick: () => driver.confirmCreate(), icon: RetryIcon }
                  : undefined
              }
            />
          )}
        </div>
      )
    case 'unavailable':
      return (
        <>
          <NoticeLine notice={state.notice} />
          <Conversation
            epoch={state.session}
            content={state.content}
            runActive={false}
            inputs={[]}
            waiting={null}
            driver={driver}
          />
        </>
      )
    case 'open':
      return <OpenSession key={state.session} state={state} driver={driver} {...parts} />
  }
}

function OpenSession({
  state,
  driver,
  scope,
  dock,
  status,
  work,
  waitingCalls,
}: Parts & { readonly state: Open; readonly driver: SessionDriver }) {
  const waiting = useWaitingCalls(waitingCalls, scope, state.session)
  return (
    <>
      {state.notice === null ? null : <NoticeLine notice={state.notice} />}
      {state.history.failure === null ? null : <NoticeLine notice={state.history.failure} />}
      <Conversation
        epoch={state.session}
        content={state.content}
        runActive={state.run.kind !== 'idle'}
        inputs={state.inputs}
        waiting={state.waiting}
        driver={driver}
      />
      {work(state.session, state.revision)}
      <div className="omne-session-dock">{dock(state.session)}</div>
      <Composer state={state} driver={driver} status={status(state.session)} waiting={waiting} />
    </>
  )
}

const NOTHING_TO_STOP = () => {}

function useWaitingCalls(
  calls: WaitingCalls | undefined,
  tenant: string | undefined,
  session: string,
): number {
  const subscribe = useCallback(
    (listener: () => void) =>
      calls === undefined || tenant === undefined
        ? NOTHING_TO_STOP
        : calls.subscribe(tenant, session, listener),
    [calls, tenant, session],
  )
  return useSyncExternalStore(subscribe, () =>
    calls === undefined || tenant === undefined ? 0 : calls.count(tenant, session),
  )
}

type MarkerWeight = 'unspoken' | 'failed'

/** The normal start and completion of a run are not drawn; a failed run's line is in the failure colour. */
function markerWeights(entries: readonly HistoryEntry[]): ReadonlyMap<string, MarkerWeight> {
  const weights = new Map<string, MarkerWeight>()
  for (const entry of entries) {
    const outcome = terminalOf(entry)?.outcome
    if (entry.kind === 'run.started' || outcome === 'completed')
      weights.set(entry.entryId, 'unspoken')
    else if (outcome === 'failed') weights.set(entry.entryId, 'failed')
  }
  return weights
}

const saysSomething = (item: Item): boolean =>
  item.kind !== 'message' ||
  item.parts.some(part => part.kind !== 'text' || part.text.trim() !== '')

function Conversation({
  epoch,
  content,
  runActive,
  inputs,
  waiting,
  driver,
}: {
  readonly epoch: string
  readonly content: Open['content']
  readonly runActive: boolean
  readonly inputs: readonly PendingInput[]
  readonly waiting: Waiting | null
  readonly driver: SessionDriver
}) {
  const weights = useMemo(() => markerWeights(content.entries), [content.entries])
  const committed = useMemo(
    () =>
      conversationItems({ ...EMPTY_CONTENT, entries: content.entries }, runActive).filter(
        item => weights.get(item.key) !== 'unspoken',
      ),
    [content.entries, runActive, weights],
  )
  const live = useMemo(
    () =>
      content.live === null
        ? []
        : conversationItems({ ...EMPTY_CONTENT, live: content.live }, runActive).filter(
            saysSomething,
          ),
    [content.live, runActive],
  )
  const { scroller, onScroll } = useFollowBottom(committed, live, inputs, waiting)
  const keys = [
    ...committed.map(item => item.key),
    ...inputs.map(input => `input:${input.acceptId}`),
    ...live.map(item => item.key),
  ]
  const publication = usePublication(epoch, keys, content.readThrough !== null)
  const arriving = (key: string) => publication.arrivals.has(key)
  const anchor = waitingAnchor(committed, waiting)
  const rows = useMemo(() => committed.map(item => item.key), [committed])
  const found = useShownEntry(epoch, scroller, rows, content.readThrough !== null)
  const notice = <WaitingNotice waiting={waiting} driver={driver} />
  return (
    <div className="omne-conversation" ref={scroller} onScroll={onScroll}>
      {committed.map(item => (
        <Fragment key={item.key}>
          <TranscriptRow
            arriving={arriving(item.key)}
            speaker={speakerOf(item)}
            entry={item.key}
            found={item.key === found}
          >
            <ItemView item={item} failed={weights.get(item.key) === 'failed'} />
          </TranscriptRow>
          {item.key === anchor ? notice : null}
        </Fragment>
      ))}
      {anchor === null ? notice : null}
      {inputs.map(input => (
        <TranscriptRow
          key={input.acceptId}
          arriving={arriving(`input:${input.acceptId}`)}
          speaker="user"
        >
          <PendingInputView input={input} driver={driver} />
        </TranscriptRow>
      ))}
      {live.map(item => (
        <TranscriptRow key={item.key} arriving={arriving(item.key)} speaker={speakerOf(item)}>
          <ItemView item={item} />
        </TranscriptRow>
      ))}
      {content.liveStatus?.kind === 'gap' ? (
        <p className="omne-live-status">
          {`回复的内容丢了一段（${content.liveStatus.reason === 'buffer' ? '缓冲放不下' : '来源的历史不够'}），正在重新取……`}
        </p>
      ) : null}
    </div>
  )
}

function PendingInputView({
  input,
  driver,
}: {
  readonly input: PendingInput
  readonly driver: SessionDriver
}) {
  return (
    <article className="omne-message" data-role="user" data-pending={input.status}>
      <span className="omne-message-speaker">你</span>
      <div className="omne-message-body">{input.text}</div>
      <InputNote input={input} onConfirm={() => driver.confirmSend(input.acceptId)} />
    </article>
  )
}

function InputNote({
  input,
  onConfirm,
}: {
  readonly input: PendingInput
  readonly onConfirm: () => void
}) {
  if (input.notice === null || input.status === 'sending' || input.status === 'accepted')
    return null
  const failed = input.status === 'refused' || input.status === 'not-committed'
  return (
    <p className="omne-message-note" data-tone={failed ? 'danger' : undefined} role="status">
      {input.notice.text}
      {input.status === 'unknown' ? (
        <IconButton label="再确认一次" size="icon-compact" onClick={onConfirm}>
          <RetryIcon aria-hidden="true" />
        </IconButton>
      ) : null}
    </p>
  )
}

const PLACEHOLDER = '输入消息'
const QUEUED_PLACEHOLDER = '现在发的话会排队，不算回答'

function Composer({
  state,
  driver,
  status,
  waiting,
}: {
  readonly state: Open
  readonly driver: SessionDriver
  readonly status: ReactNode
  readonly waiting: number
}) {
  const [text, setText] = useState('')
  const submit = () => {
    if (text.trim().length === 0) return
    void driver.send(text)
    setText('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }
  return (
    <form
      className="omne-composer"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        aria-label="输入消息"
        placeholder={waiting > 0 ? QUEUED_PLACEHOLDER : PLACEHOLDER}
        rows={3}
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="omne-composer-actions">
        <div className="omne-session-status">{status}</div>
        <ComposerActionSlot
          face={stopFace(state.run)}
          canSend={text.trim().length > 0}
          onStop={() => driver.cancel()}
        />
      </div>
    </form>
  )
}
