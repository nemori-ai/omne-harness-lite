import { AddIcon, Button, Segmented, StatusPill } from '@omne-harness/ui-kit'
import { encodeInstant, type Instant } from '@omne-harness/utc-instant'
import { useState, useSyncExternalStore } from 'react'
import type { ModelSelectionStore } from '../model/model-selection.ts'
import type { WorkspaceSelectionStore } from '../model/workspace-selection.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import {
  arrange,
  relationOf,
  sessionName,
  shownBy,
  type ListedSession,
  type Relation,
  type RelationFilter,
  type SessionList,
} from '../model/session-list.ts'
import { createInFlight } from '../model/session-machine.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { useNewSessionModel } from './model-selection.tsx'
import { useNewSessionWorkspace } from './workspace-selection.tsx'
import { formatMoment } from './moment.ts'
import { NoticeLine } from './notice.tsx'
import { useSession } from './use-session.ts'

export type SessionListPanelProps = Readonly<{
  workspaces: SessionWorkspaces
  models: ModelSelectionStore
  places: WorkspaceSelectionStore
  scope: string | undefined
  onShow: () => void
}>

export function SessionListPanel({
  workspaces,
  models,
  places,
  scope,
  onShow,
}: SessionListPanelProps) {
  const handle = useSession(workspaces, scope)
  if (handle.kind !== 'ready' || scope === undefined)
    return <div className="omne-session-sidebar" />
  return (
    <Panel driver={handle.driver} models={models} places={places} tenant={scope} onShow={onShow} />
  )
}

function Panel({
  driver,
  models,
  places,
  tenant,
  onShow,
}: {
  readonly driver: SessionDriver
  readonly models: ModelSelectionStore
  readonly places: WorkspaceSelectionStore
  readonly tenant: string
  readonly onShow: () => void
}) {
  const { session: state, list } = useSyncExternalStore(driver.subscribe, driver.getState)
  const { model, picker } = useNewSessionModel(models, tenant)
  const place = useNewSessionWorkspace(places, tenant)
  const current = state.kind === 'open' || state.kind === 'unavailable' ? state.session : null
  return (
    <div className="omne-session-sidebar">
      <Button
        variant="outline"
        size="compact"
        disabled={state.kind === 'creating'}
        onClick={() => {
          driver.createSession({
            ...(model === undefined ? {} : { model }),
            ...(place.workspace === undefined ? {} : { workspace: place.workspace }),
          })
          onShow()
        }}
      >
        <AddIcon aria-hidden="true" />
        新建会话
      </Button>
      {picker}
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

const LIFECYCLE: Readonly<Partial<Record<ListedSession['lifecycle'], string>>> = {
  initializing: '正在初始化',
  frozen: '已冻结',
  archived: '已归档',
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

function Moment({ label, at }: { readonly label: string; readonly at: Instant | null }) {
  if (at === null) return null
  return (
    <span>
      {label} <time dateTime={encodeInstant(at)}>{formatMoment(at)}</time>
    </span>
  )
}

function SessionRow({
  item,
  level,
  current,
  locked,
  onOpen,
}: {
  readonly item: ListedSession
  readonly level: number
  readonly current: boolean
  readonly locked: boolean
  readonly onOpen: () => void
}) {
  const marks = [
    LIFECYCLE[item.lifecycle],
    RELATION[relationOf(item)],
    item.attendance === 'unattended' ? '无人值守' : undefined,
  ].filter(mark => mark !== undefined)
  const dated = item.createdAt !== null || item.lastActivityAt !== null
  return (
    <li
      data-level={level}
      style={{ paddingInlineStart: `calc(${String(level)} * var(--omne-row-indent, 14px))` }}
    >
      <button
        type="button"
        className="omne-session-item"
        aria-current={current ? 'true' : undefined}
        disabled={locked}
        onClick={onOpen}
      >
        <span className="omne-session-item-title">{sessionName(item)}</span>
        {dated || marks.length > 0 ? (
          <span className="omne-session-item-meta">
            <Moment label="最近活动" at={item.lastActivityAt} />
            <Moment label="创建" at={item.createdAt} />
            {marks.map(mark => (
              <StatusPill key={mark} tone="neutral">
                {mark}
              </StatusPill>
            ))}
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
  const [relation, setRelation] = useState<RelationFilter>('all')
  const rows = shown === null ? [] : arrange(shown.sessions, relation)
  return (
    <nav className="omne-sessions" aria-label="会话列表">
      {shown === null || shown.sessions.length === 0 ? null : (
        <Segmented
          value={relation}
          onValueChange={setRelation}
          options={RELATIONS}
          label="按关系看"
        />
      )}
      {shown === null ? null : (
        <ul className="omne-session-items">
          {rows.map(({ item, level }) => (
            <SessionRow
              key={item.session}
              item={item}
              level={level}
              current={item.session === current}
              locked={locked}
              onOpen={() => onOpen(item.session)}
            />
          ))}
        </ul>
      )}
      {shown !== null && shown.sessions.length > 0 && rows.length === 0 ? (
        <p className="omne-sessions-note">已载入的会话里没有这一类。</p>
      ) : null}
      <ListFooter list={list} driver={driver} />
      {shown?.completeness === 'partial' ? (
        <p className="omne-sessions-note">列表可能不全</p>
      ) : null}
    </nav>
  )
}
