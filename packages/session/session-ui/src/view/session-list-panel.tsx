import { encodeInstant } from '@omne-harness/utc-instant'
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
  if (handle.kind !== 'ready') return <div className="omne-session" />
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
    <div className="omne-session omne-session-sidebar">
      <button
        type="button"
        className="omne-button"
        disabled={state.kind === 'creating'}
        onClick={() => {
          driver.createSession()
          onShow()
        }}
      >
        新建会话
      </button>
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
