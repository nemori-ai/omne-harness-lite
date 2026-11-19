import { CopyButton, StatusPill, Textarea, ValuePill } from '@omne-harness/ui-kit'
import {
  Fragment,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { stopFace } from '../model/composer.ts'
import { EMPTY_CONTENT } from '../model/content.ts'
import { conversationItems } from '../model/conversation.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import { sessionName, shownBy, type SessionList } from '../model/session-list.ts'
import type { Open, PendingInput, State } from '../model/session-machine.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import type { Waiting } from '../model/waiting.ts'
import { ComposerActionSlot } from './composer-action-slot.tsx'
import { NoticeLine } from './notice.tsx'
import { ItemView } from './parts.tsx'
import { useFollowBottom } from './scroll.ts'
import { TranscriptRow, usePublication } from './transcript-arrivals.tsx'
import { useSession } from './use-session.ts'
import { WaitingNotice, waitingAnchor } from './waiting-notice.tsx'

export type ConversationPageProps = Readonly<{
  workspaces: SessionWorkspaces
  scope: string | undefined
  dock: (session: string) => ReactNode
  side: (session: string) => ReactNode
  /** Actions on the open session in its heading, such as archiving it. */
  heading?: (session: string) => ReactNode
  /** What the open session still holds, read again at each log position. */
  work?: (session: string, revision: string | null) => ReactNode
}>

export function ConversationPage({
  workspaces,
  scope,
  dock,
  side,
  heading = () => null,
  work = () => null,
}: ConversationPageProps) {
  const handle = useSession(workspaces, scope)
  switch (handle.kind) {
    case 'waiting':
      return <div className="omne-session-page" />
    case 'unreadable':
      return (
        <div className="omne-session-page">
          <NoticeLine
            notice={{ kind: 'refused', text: '外壳给的租户读不懂，会话界面不能工作。' }}
          />
        </div>
      )
    case 'ready':
      return <Page driver={handle.driver} dock={dock} side={side} heading={heading} work={work} />
  }
}

type Parts = Readonly<{
  dock: (session: string) => ReactNode
  work: (session: string, revision: string | null) => ReactNode
}>

function Page({
  driver,
  dock,
  side,
  heading,
  work,
}: Parts & {
  readonly driver: SessionDriver
  readonly side: (session: string) => ReactNode
  readonly heading: (session: string) => ReactNode
}) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  return (
    <div className="omne-session-page">
      <header className="omne-session-bar">
        <div className="omne-session-heading">
          <h2 className="omne-session-title">{titleOf(state, list)}</h2>
          {state.kind === 'open' || state.kind === 'unavailable' ? (
            <SessionId session={state.session} />
          ) : null}
          {state.kind === 'open' ? heading(state.session) : null}
        </div>
        <ConnectionBadge state={state} />
      </header>
      <div className="omne-session-body">
        <div className="omne-session-main">
          <Body state={state} driver={driver} dock={dock} work={work} />
        </div>
        {state.kind === 'open' ? side(state.session) : null}
      </div>
    </div>
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

function SessionId({ session }: { readonly session: string }) {
  const short = session.length > SHOWN_ID ? `${session.slice(0, SHOWN_ID)}…` : session
  return (
    <span className="omne-session-id">
      <span title={session}>
        <ValuePill mono>{short}</ValuePill>
      </span>
      <CopyButton
        value={session}
        label="复制会话标识"
        copiedLabel="已复制会话标识"
        failedLabel="没有复制成功"
        size="icon-compact"
      />
    </span>
  )
}

function ConnectionBadge({ state }: { readonly state: State }) {
  if (state.kind !== 'open') return null
  const observation = state.observation
  switch (observation.kind) {
    case 'live':
      return null
    case 'connecting':
      return <StatusPill tone="neutral">正在连接</StatusPill>
    case 'reconnecting':
      return (
        <StatusPill tone="caution">观察断开，正在重连（第 {observation.attempt} 次）</StatusPill>
      )
  }
}

function Body({
  state,
  driver,
  dock,
  work,
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
                  ? { label: '再确认一次', onClick: () => driver.confirmCreate() }
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
      return (
        <OpenSession key={state.session} state={state} driver={driver} dock={dock} work={work} />
      )
  }
}

function OpenSession({
  state,
  driver,
  dock,
  work,
}: Parts & { readonly state: Open; readonly driver: SessionDriver }) {
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
      <Composer state={state} driver={driver} />
    </>
  )
}

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
  const committed = useMemo(
    () => conversationItems({ ...EMPTY_CONTENT, entries: content.entries }, runActive),
    [content.entries, runActive],
  )
  const live = useMemo(
    () =>
      content.live === null
        ? []
        : conversationItems({ ...EMPTY_CONTENT, live: content.live }, runActive),
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
  const notice = <WaitingNotice waiting={waiting} driver={driver} />
  return (
    <div className="omne-conversation" ref={scroller} onScroll={onScroll}>
      {committed.map(item => (
        <Fragment key={item.key}>
          <TranscriptRow arriving={arriving(item.key)}>
            <ItemView item={item} />
          </TranscriptRow>
          {item.key === anchor ? notice : null}
        </Fragment>
      ))}
      {anchor === null ? notice : null}
      {inputs.map(input => (
        <TranscriptRow key={input.acceptId} arriving={arriving(`input:${input.acceptId}`)}>
          <PendingInputView input={input} driver={driver} />
        </TranscriptRow>
      ))}
      {live.map(item => (
        <TranscriptRow key={item.key} arriving={arriving(item.key)}>
          <ItemView item={item} />
        </TranscriptRow>
      ))}
      {content.liveStatus === null ? null : (
        <p className="omne-live-status">
          {content.liveStatus.kind === 'refreshing'
            ? '正在等回复的内容……'
            : `回复的内容丢了一段（${content.liveStatus.reason === 'buffer' ? '缓冲放不下' : '来源的历史不够'}），正在重新取……`}
        </p>
      )}
    </div>
  )
}

const INPUT_STATUS: Readonly<Record<PendingInput['status'], string>> = {
  sending: '发送中',
  accepted: '已受理，等待写入会话',
  confirming: '未知，正在确认',
  unknown: '结果仍未知',
  'not-committed': '没有受理',
  refused: '没有发出',
}

const INPUT_TONE = {
  sending: 'neutral',
  accepted: 'neutral',
  confirming: 'info',
  unknown: 'info',
  'not-committed': 'caution',
  refused: 'danger',
} as const

function PendingInputView({
  input,
  driver,
}: {
  readonly input: PendingInput
  readonly driver: SessionDriver
}) {
  return (
    <article className="omne-message" data-role="user" data-pending={input.status}>
      <header className="omne-message-head">
        <span>你</span>
        <StatusPill tone={INPUT_TONE[input.status]}>{INPUT_STATUS[input.status]}</StatusPill>
      </header>
      <div className="omne-message-body">{input.text}</div>
      {input.notice === null ? null : (
        <NoticeLine
          notice={input.notice}
          action={
            input.status === 'unknown'
              ? { label: '再确认一次', onClick: () => driver.confirmSend(input.acceptId) }
              : undefined
          }
        />
      )}
    </article>
  )
}

function Composer({ state, driver }: { readonly state: Open; readonly driver: SessionDriver }) {
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
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows={3}
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="omne-composer-actions">
        <ComposerActionSlot
          face={stopFace(state.run)}
          canSend={text.trim().length > 0}
          onStop={() => driver.cancel()}
        />
      </div>
    </form>
  )
}
