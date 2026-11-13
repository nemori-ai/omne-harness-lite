import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { encodeInstant } from '@omne-harness/utc-instant'
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type JSX,
  type KeyboardEvent,
} from 'react'
import { stopFace, type StopFace } from '../model/composer.ts'
import { EMPTY_CONTENT } from '../model/content.ts'
import { conversationItems } from '../model/conversation.ts'
import { SessionDriver } from '../model/session-driver.ts'
import { shownBy, type ListedSession, type SessionList } from '../model/session-list.ts'
import {
  createInFlight,
  type Notice,
  type Open,
  type PendingInput,
  type State,
} from '../model/session-machine.ts'
import { ItemView } from './parts.tsx'
import { useFollowBottom } from './scroll.ts'

export type SessionWorkspaceProps = Readonly<{
  /** session/v1 的协议客户端。外壳从客户端装配的树上取到才渲染这个组件。 */
  client: ClientOf<SessionProtocol>
  /** 当前租户。外壳用 identity/v1 的 query-current-tenant 得到。 */
  tenant: string
}>

export function SessionWorkspace(props: SessionWorkspaceProps): JSX.Element {
  const tenant = readTenantText(props.tenant)
  if (tenant === undefined)
    return (
      <div className="omne-session">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，会话界面不能工作。' }} />
      </div>
    )
  return <Workspace client={props.client} tenant={tenant} />
}

/**
 * The driver lives exactly as long as the effect: React may run an effect, clean it up and run it
 * again (StrictMode), and a new client or tenant is a new driver. Its cleanup aborts what it opened.
 */
function Workspace({
  client,
  tenant,
}: {
  readonly client: ClientOf<SessionProtocol>
  readonly tenant: TenantId
}) {
  const [driver, setDriver] = useState<SessionDriver | null>(null)
  useEffect(() => {
    const created = new SessionDriver({ client, tenant })
    created.loadList()
    setDriver(created)
    return () => created.dispose()
  }, [client, tenant])
  return driver === null ? <div className="omne-session" /> : <Session driver={driver} />
}

function Session({ driver }: { readonly driver: SessionDriver }) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  // Only below 720px wide does the list fold away; there this opens it as a drop-down.
  const [listOpen, setListOpen] = useState(false)
  return (
    <div className="omne-session" data-list-open={listOpen}>
      <SessionListView
        list={list}
        current={state.kind === 'open' || state.kind === 'unavailable' ? state.session : null}
        locked={createInFlight(state)}
        onOpen={session => {
          setListOpen(false)
          driver.openSession(session)
        }}
        driver={driver}
      />
      <div className="omne-session-main">
        <header className="omne-session-bar">
          <button
            type="button"
            className="omne-button omne-sessions-toggle"
            aria-expanded={listOpen}
            onClick={() => setListOpen(open => !open)}
          >
            会话列表
          </button>
          <h2 className="omne-session-title">{titleOf(state)}</h2>
          <ConnectionBadge state={state} />
          <button
            type="button"
            className="omne-button"
            disabled={state.kind === 'creating'}
            onClick={() => driver.createSession()}
          >
            新建会话
          </button>
        </header>
        <Body state={state} driver={driver} />
      </div>
    </div>
  )
}

const LIFECYCLE: Readonly<Partial<Record<ListedSession['lifecycle'], string>>> = {
  initializing: '正在初始化',
  frozen: '已冻结',
  archived: '已归档',
}

function itemTitle(item: ListedSession): string {
  return item.title ?? `未命名的会话 ${item.session.slice(0, 8)}`
}

function SessionListView({
  list,
  current,
  locked,
  onOpen,
  driver,
}: {
  readonly list: SessionList
  readonly current: string | null
  readonly locked: boolean
  readonly onOpen: (session: string) => void
  readonly driver: SessionDriver
}) {
  const shown = shownBy(list)
  return (
    <nav className="omne-sessions" aria-label="会话列表">
      {shown === null ? null : (
        <ul className="omne-session-items">
          {shown.sessions.map(item => {
            const lifecycle = LIFECYCLE[item.lifecycle]
            return (
              <li key={item.session}>
                <button
                  type="button"
                  className="omne-session-item"
                  aria-current={item.session === current ? 'true' : undefined}
                  disabled={locked}
                  onClick={() => onOpen(item.session)}
                >
                  <span className="omne-session-item-title">{itemTitle(item)}</span>
                  {item.lastActivityAt === null ? null : (
                    <time
                      className="omne-session-item-time"
                      dateTime={encodeInstant(item.lastActivityAt)}
                    >
                      {new Date(encodeInstant(item.lastActivityAt)).toLocaleString()}
                    </time>
                  )}
                  {lifecycle === undefined ? null : <span className="omne-badge">{lifecycle}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {list.kind === 'read' && list.page.sessions.length === 0 ? (
        <p className="omne-sessions-note">还没有会话。</p>
      ) : null}
      {list.kind === 'reading' ? <p className="omne-sessions-note">正在读会话列表……</p> : null}
      {list.kind === 'failed' ? (
        <NoticeLine
          notice={list.notice}
          action={
            list.retry ? (
              <button type="button" className="omne-link" onClick={() => driver.loadList()}>
                重试
              </button>
            ) : undefined
          }
        />
      ) : null}
      {list.kind === 'read' && list.page.next !== null ? (
        <button
          type="button"
          className="omne-button omne-sessions-more"
          onClick={() => driver.loadMoreSessions()}
        >
          更多
        </button>
      ) : null}
      {shown?.completeness === 'partial' ? (
        <p className="omne-sessions-note">列表可能不全</p>
      ) : null}
    </nav>
  )
}

function titleOf(state: State): string {
  switch (state.kind) {
    case 'none':
      return '还没有会话'
    case 'creating':
      return '正在建会话'
    case 'open':
    case 'unavailable':
      return `会话 ${state.session}`
  }
}

function ConnectionBadge({ state }: { readonly state: State }) {
  if (state.kind !== 'open') return null
  const observation = state.observation
  switch (observation.kind) {
    case 'live':
      return null
    case 'connecting':
      return <span className="omne-badge">正在连接</span>
    case 'reconnecting':
      return (
        <span className="omne-badge" data-tone="unknown">
          观察断开，正在重连（第 {observation.attempt} 次）
        </span>
      )
  }
}

function NoticeLine({
  notice,
  action,
}: {
  readonly notice: Notice
  readonly action?: JSX.Element | undefined
}) {
  return (
    <p
      className="omne-notice"
      data-kind={notice.kind}
      role={notice.kind === 'unknown' ? 'status' : 'alert'}
    >
      <span>{notice.text}</span>
      {action ?? null}
    </p>
  )
}

function Body({ state, driver }: { readonly state: State; readonly driver: SessionDriver }) {
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
                state.confirm === 'unknown' ? (
                  <button
                    type="button"
                    className="omne-link"
                    onClick={() => driver.confirmCreate()}
                  >
                    再确认一次
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
      )
    case 'unavailable':
      return (
        <>
          <NoticeLine notice={state.notice} />
          <Conversation content={state.content} runActive={false} inputs={[]} driver={driver} />
        </>
      )
    case 'open':
      // Another session starts from scratch: its own scroll position and an empty input box.
      return <OpenSession key={state.session} state={state} driver={driver} />
  }
}

function OpenSession({ state, driver }: { readonly state: Open; readonly driver: SessionDriver }) {
  return (
    <>
      {state.notice === null ? null : <NoticeLine notice={state.notice} />}
      {state.history.failure === null ? null : <NoticeLine notice={state.history.failure} />}
      <Conversation
        content={state.content}
        runActive={state.run.kind !== 'idle'}
        inputs={state.inputs}
        driver={driver}
      />
      <Composer state={state} driver={driver} />
    </>
  )
}

function Conversation({
  content,
  runActive,
  inputs,
  driver,
}: {
  readonly content: Open['content']
  readonly runActive: boolean
  readonly inputs: readonly PendingInput[]
  readonly driver: SessionDriver
}) {
  // Committed items depend on the entries only, so a growing reply leaves them untouched.
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
  const { scroller, onScroll } = useFollowBottom(committed, live, inputs)
  return (
    <div className="omne-conversation" ref={scroller} onScroll={onScroll}>
      {committed.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
      {inputs.map(input => (
        <PendingInputView key={input.acceptId} input={input} driver={driver} />
      ))}
      {live.map(item => (
        <ItemView key={item.key} item={item} />
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
        <span className="omne-badge" data-tone={input.status}>
          {INPUT_STATUS[input.status]}
        </span>
      </header>
      <div className="omne-message-body omne-plain">{input.text}</div>
      {input.notice === null ? null : (
        <NoticeLine
          notice={input.notice}
          action={
            input.status === 'unknown' ? (
              <button
                type="button"
                className="omne-link"
                onClick={() => driver.confirmSend(input.acceptId)}
              >
                再确认一次
              </button>
            ) : undefined
          }
        />
      )}
    </article>
  )
}

const STOP_LABEL: Readonly<Record<Exclude<StopFace, 'none'>, string>> = {
  stop: '停止',
  stopping: '正在停止',
  'confirm-stop': '再确认停止',
}

function Composer({ state, driver }: { readonly state: Open; readonly driver: SessionDriver }) {
  const [text, setText] = useState('')
  const face = stopFace(state.run)
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
      <textarea
        className="omne-input"
        aria-label="输入消息"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows={3}
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="omne-composer-actions">
        {face === 'none' ? null : (
          <button
            type="button"
            className="omne-button"
            data-tone="stop"
            disabled={face === 'stopping'}
            onClick={() => driver.cancel()}
          >
            {STOP_LABEL[face]}
          </button>
        )}
        <button
          type="submit"
          className="omne-button"
          data-tone="primary"
          disabled={text.trim().length === 0}
        >
          发送
        </button>
      </div>
    </form>
  )
}
