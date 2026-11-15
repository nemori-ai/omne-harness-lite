import { AddIcon, Button, StatusPill } from '@omne-harness/ui-kit'
import { encodeInstant, type Instant } from '@omne-harness/utc-instant'
import { useSyncExternalStore } from 'react'
import type { SessionDriver } from '../model/session-driver.ts'
import { shownBy, type ListedSession, type SessionList } from '../model/session-list.ts'
import { createInFlight } from '../model/session-machine.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { NoticeLine } from './notice.tsx'
import { useSession } from './use-session.ts'

export type SessionListPanelProps = Readonly<{
  workspaces: SessionWorkspaces
  scope: string | undefined
  onShow: () => void
}>

export function SessionListPanel({ workspaces, scope, onShow }: SessionListPanelProps) {
  const handle = useSession(workspaces, scope)
  if (handle.kind !== 'ready') return <div className="omne-session-sidebar" />
  return <Panel driver={handle.driver} onShow={onShow} />
}

function Panel({
  driver,
  onShow,
}: {
  readonly driver: SessionDriver
  readonly onShow: () => void
}) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  const current = state.kind === 'open' || state.kind === 'unavailable' ? state.session : null
  return (
    <div className="omne-session-sidebar">
      <Button
        variant="outline"
        size="compact"
        disabled={state.kind === 'creating'}
        onClick={() => {
          driver.createSession()
          onShow()
        }}
      >
        <AddIcon aria-hidden="true" />
        新建会话
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

const LIFECYCLE: Readonly<Partial<Record<ListedSession['lifecycle'], string>>> = {
  initializing: '正在初始化',
  frozen: '已冻结',
  archived: '已归档',
}

function itemTitle(item: ListedSession): string {
  return item.title ?? `未命名的会话 ${item.session.slice(0, 8)}`
}

function Moment({ label, at }: { readonly label: string; readonly at: Instant | null }) {
  if (at === null) return null
  const text = encodeInstant(at)
  return (
    <span>
      {label} <time dateTime={text}>{new Date(text).toLocaleString()}</time>
    </span>
  )
}

function SessionRow({
  item,
  current,
  locked,
  onOpen,
}: {
  readonly item: ListedSession
  readonly current: boolean
  readonly locked: boolean
  readonly onOpen: () => void
}) {
  const lifecycle = LIFECYCLE[item.lifecycle]
  const dated = item.createdAt !== null || item.lastActivityAt !== null
  return (
    <li>
      <button
        type="button"
        className="omne-session-item"
        aria-current={current ? 'true' : undefined}
        disabled={locked}
        onClick={onOpen}
      >
        <span className="omne-session-item-title">{itemTitle(item)}</span>
        {dated || lifecycle !== undefined ? (
          <span className="omne-session-item-meta">
            <Moment label="最近活动" at={item.lastActivityAt} />
            <Moment label="创建" at={item.createdAt} />
            {lifecycle === undefined ? null : <StatusPill tone="neutral">{lifecycle}</StatusPill>}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function ListFooter({
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
      return <p className="omne-sessions-note">正在读会话列表……</p>
    case 'failed':
      return (
        <NoticeLine
          notice={list.notice}
          action={list.retry ? { label: '重试', onClick: () => driver.loadList() } : undefined}
        />
      )
    case 'read':
      if (list.page.sessions.length === 0) return <p className="omne-sessions-note">还没有会话。</p>
      return list.page.next === null ? null : (
        <Button variant="ghost" size="compact" onClick={() => driver.loadMoreSessions()}>
          更多
        </Button>
      )
  }
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
          {shown.sessions.map(item => (
            <SessionRow
              key={item.session}
              item={item}
              current={item.session === current}
              locked={locked}
              onOpen={() => onOpen(item.session)}
            />
          ))}
        </ul>
      )}
      <ListFooter list={list} driver={driver} />
      {shown?.completeness === 'partial' ? (
        <p className="omne-sessions-note">列表可能不全</p>
      ) : null}
    </nav>
  )
}
