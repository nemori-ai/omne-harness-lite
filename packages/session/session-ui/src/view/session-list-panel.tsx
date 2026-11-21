import {
  AddIcon,
  Ago,
  Button,
  GlideMenu,
  InlineNotice,
  LoadingState,
  StateWord,
  useAgeClock,
  type StateLabel,
  RetryIcon,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useSyncExternalStore } from 'react'
import type { SessionDriver } from '../model/session-driver.ts'
import {
  sessionName,
  shownBy,
  type ListedSession,
  type ListPage,
  type SessionList,
} from '../model/session-list.ts'
import { createInFlight } from '../model/session-machine.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { ReadOnEnd } from './read-on-end.tsx'
import { useSession } from './use-session.ts'

export type SessionListPanelProps = Readonly<{
  workspaces: SessionWorkspaces
  scope: string | undefined
  onShow: () => void
  /** Whether the conversation page is on show; without it, it always is. */
  conversationShown?: Readonly<{ get(): boolean; subscribe(listener: () => void): () => void }>
}>

type ConversationShown = NonNullable<SessionListPanelProps['conversationShown']>

const ALWAYS_SHOWN: ConversationShown = { get: () => true, subscribe: () => () => undefined }

export function SessionListPanel({
  workspaces,
  scope,
  onShow,
  conversationShown = ALWAYS_SHOWN,
}: SessionListPanelProps) {
  const handle = useSession(workspaces, scope)
  if (handle.kind !== 'ready' || scope === undefined)
    return <div className="omne-session-sidebar" />
  return <Panel driver={handle.driver} onShow={onShow} shown={conversationShown} />
}

function Panel({
  driver,
  onShow,
  shown,
}: {
  readonly driver: SessionDriver
  readonly onShow: () => void
  readonly shown: ConversationShown
}) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  // The current session is the sidebar's one selection only while its page is on show (DT-31).
  const conversation = useSyncExternalStore(
    useCallback((listener: () => void) => shown.subscribe(listener), [shown]),
    () => shown.get(),
  )
  const open = state.kind === 'open' || state.kind === 'unavailable' ? state.session : null
  const current = conversation ? open : null
  return (
    <div className="omne-session-sidebar">
      {/* A new session names no model: it takes the deployment's default. */}
      <Button
        variant="ghost"
        className="omne-sessions-new"
        disabled={state.kind === 'creating'}
        onClick={() => {
          driver.createSession()
          onShow()
        }}
      >
        <AddIcon aria-hidden="true" />
        <span>新建会话</span>
      </Button>
      <SessionListView
        list={list}
        current={current}
        locked={createInFlight(state)}
        onOpen={session => {
          driver.openSession(session)
          onShow()
        }}
        driver={driver}
      />
    </div>
  )
}

// A normal session says nothing: only these two ask for a word, and replying is the figure's to show.
const LIFECYCLE: Readonly<Partial<Record<ListedSession['lifecycle'], StateLabel>>> = {
  initializing: 'initializing',
  frozen: 'frozen',
}

function SessionRow({
  item,
  now,
  current,
  locked,
  onOpen,
}: {
  readonly item: ListedSession
  readonly now: number
  readonly current: boolean
  readonly locked: boolean
  readonly onOpen: () => void
}) {
  const lifecycle = LIFECYCLE[item.lifecycle]
  const at = item.lastActivityAt
  return (
    <li>
      <button
        type="button"
        className="omne-session-item"
        data-glide-row=""
        data-control="row"
        data-selected={current}
        aria-current={current ? 'true' : undefined}
        disabled={locked}
        onClick={onOpen}
      >
        <span className="omne-session-item-title">{sessionName(item)}</span>
        {at === null && lifecycle === undefined ? null : (
          <span className="omne-session-item-meta">
            {at === null ? null : <Ago at={encodeInstant(at)} now={now} />}
            {lifecycle === undefined ? null : <StateWord state={lifecycle} />}
          </span>
        )}
      </button>
    </li>
  )
}

// With rows on screen, reading the first page again after an activity draws nothing: only the first read and a read
// the person asked for are loading states.
function ListState({
  list,
  driver,
}: {
  readonly list: SessionList
  readonly driver: SessionDriver
}) {
  switch (list.kind) {
    case 'unread':
      return null
    case 'reading':
      return list.shown === null || list.cursor !== null ? (
        <LoadingState label="正在读会话列表……" />
      ) : null
    case 'failed':
      return (
        <InlineNotice
          tone={list.retry ? 'caution' : 'neutral'}
          {...(list.retry
            ? { action: { label: '重试', onClick: () => driver.loadList(), icon: RetryIcon } }
            : {})}
        >
          {list.notice.text}
        </InlineNotice>
      )
    case 'read':
      return null
  }
}

function ListEnd({
  list,
  shown,
  driver,
}: {
  readonly list: SessionList
  readonly shown: ListPage | null
  readonly driver: SessionDriver
}) {
  const partial = shown?.completeness === 'partial'
  const page = list.kind === 'read' && list.page.next !== null ? list.page : null
  return (
    <>
      {partial ? (
        <div className="omne-sessions-end">
          <p className="omne-sessions-note">列表可能不全</p>
        </div>
      ) : null}
      <ReadOnEnd page={page} read={() => driver.loadMoreSessions()} />
    </>
  )
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
  const rows = shown?.sessions ?? []
  // One clock for the list, so every row's age is read against the same instant.
  const now = useAgeClock(rows.length > 0)
  return (
    <nav className="omne-sessions" aria-label="会话列表">
      {rows.length === 0 ? null : (
        <GlideMenu>
          <ul className="omne-session-items">
            {rows.map(item => (
              <SessionRow
                key={item.session}
                item={item}
                now={now}
                current={item.session === current}
                locked={locked}
                onOpen={() => onOpen(item.session)}
              />
            ))}
          </ul>
        </GlideMenu>
      )}
      <ListState list={list} driver={driver} />
      <ListEnd list={list} shown={shown} driver={driver} />
    </nav>
  )
}
