import {
  AddIcon,
  Ago,
  Button,
  GlideMenu,
  InlineNotice,
  LoadingState,
  Segmented,
  StateWord,
  useAgeClock,
  type StateLabel,
  RetryIcon,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { SessionDriver } from '../model/session-driver.ts'
import {
  arrange,
  relationOf,
  sessionName,
  shownBy,
  type ListedSession,
  type ListPage,
  type Relation,
  type RelationFilter,
  type SessionList,
} from '../model/session-list.ts'
import { createInFlight } from '../model/session-machine.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import type { WorkspaceSelectionStore } from '../model/workspace-selection.ts'
import { ReadOnEnd } from './read-on-end.tsx'
import { useNewSessionWorkspace } from './workspace-selection.tsx'
import { useSession } from './use-session.ts'

export type SessionListPanelProps = Readonly<{
  workspaces: SessionWorkspaces
  places: WorkspaceSelectionStore
  scope: string | undefined
  onShow: () => void
  /** Whether the conversation page is on show; without it, it always is. */
  conversationShown?: Readonly<{ get(): boolean; subscribe(listener: () => void): () => void }>
}>

type ConversationShown = NonNullable<SessionListPanelProps['conversationShown']>

const ALWAYS_SHOWN: ConversationShown = { get: () => true, subscribe: () => () => undefined }

export function SessionListPanel({
  workspaces,
  places,
  scope,
  onShow,
  conversationShown = ALWAYS_SHOWN,
}: SessionListPanelProps) {
  const handle = useSession(workspaces, scope)
  if (handle.kind !== 'ready' || scope === undefined)
    return <div className="omne-session-sidebar" />
  return (
    <Panel
      driver={handle.driver}
      places={places}
      tenant={scope}
      onShow={onShow}
      shown={conversationShown}
    />
  )
}

function Panel({
  driver,
  places,
  tenant,
  onShow,
  shown,
}: {
  readonly driver: SessionDriver
  readonly places: WorkspaceSelectionStore
  readonly tenant: string
  readonly onShow: () => void
  readonly shown: ConversationShown
}) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  // The current session is the sidebar's one selection only while its page is on show (DT-42).
  const conversation = useSyncExternalStore(
    useCallback((listener: () => void) => shown.subscribe(listener), [shown]),
    () => shown.get(),
  )
  const open = state.kind === 'open' || state.kind === 'unavailable' ? state.session : null
  const current = conversation ? open : null
  const place = useNewSessionWorkspace(places, tenant)
  return (
    <div className="omne-session-sidebar">
      <Button
        variant="ghost"
        className="omne-sessions-new"
        disabled={state.kind === 'creating'}
        onClick={() => {
          driver.createSession(place.workspace === undefined ? {} : { workspace: place.workspace })
          onShow()
        }}
      >
        <AddIcon aria-hidden="true" />
        <span>新建会话</span>
      </Button>
      {place.picker}
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

const RELATION: Readonly<Partial<Record<Relation, string>>> = {
  child: '子会话',
  handoff: '交接而来',
}
const RELATIONS: readonly { value: RelationFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'main', label: '主会话' },
  { value: 'child', label: '子会话' },
  { value: 'handoff', label: '交接而来' },
]

function SessionRow({
  item,
  level,
  now,
  current,
  locked,
  onOpen,
}: {
  readonly item: ListedSession
  readonly level: number
  readonly now: number
  readonly current: boolean
  readonly locked: boolean
  readonly onOpen: () => void
}) {
  const lifecycle = LIFECYCLE[item.lifecycle]
  const at = item.lastActivityAt
  const marks = [
    RELATION[relationOf(item)],
    item.attendance === 'unattended' ? '无人值守' : undefined,
  ].filter(mark => mark !== undefined)
  return (
    <li
      data-level={level}
      style={{ paddingInlineStart: `calc(${String(level)} * var(--omne-space-block))` }}
    >
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
        {at === null && lifecycle === undefined && marks.length === 0 ? null : (
          <span className="omne-session-item-meta">
            {at === null ? null : <Ago at={encodeInstant(at)} now={now} />}
            {lifecycle === undefined ? null : <StateWord state={lifecycle} />}
            {marks.map(mark => (
              <span key={mark}>{mark}</span>
            ))}
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

export function SessionListView({
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
  const sessions = shown?.sessions ?? []
  const [relation, setRelation] = useState<RelationFilter>('all')
  const rows = arrange(sessions, relation)
  // One clock for the list, so every row's age is read against the same instant.
  const now = useAgeClock(rows.length > 0)
  return (
    <nav className="omne-sessions" aria-label="会话列表">
      {sessions.length === 0 ? null : (
        <Segmented value={relation} onValueChange={setRelation} options={RELATIONS} label="按关系看" />
      )}
      {rows.length === 0 ? null : (
        <GlideMenu>
          <ul className="omne-session-items">
            {rows.map(({ item, level }) => (
              <SessionRow
                key={item.session}
                item={item}
                level={level}
                now={now}
                current={item.session === current}
                locked={locked}
                onOpen={() => onOpen(item.session)}
              />
            ))}
          </ul>
        </GlideMenu>
      )}
      {sessions.length > 0 && rows.length === 0 ? (
        <p className="omne-sessions-note">已载入的会话里没有这一类。</p>
      ) : null}
      <ListState list={list} driver={driver} />
      <ListEnd list={list} shown={shown} driver={driver} />
    </nav>
  )
}
