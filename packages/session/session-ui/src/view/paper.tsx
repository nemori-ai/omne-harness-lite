import {
  Ago,
  Button,
  GlideMenu,
  ListReadingRow,
  LoadingState,
  StateWord,
  useAgeClock,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import {
  SESSION_KIND,
  paperRow,
  pickable,
  type ArchivedDirectory,
  type PaperElementSubject,
  type PaperFrame,
  type PaperPickerSubject,
} from '../model/paper.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import { sessionName, type ListedSession } from '../model/session-list.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { sessionPaperItem, sessionPaperPick } from '../parts.ts'
import { LIFECYCLE } from './session-list-panel.tsx'
import { useSession } from './use-session.ts'

const PICKS = 6

function Said({ frame, children }: { readonly frame: PaperFrame; readonly children: ReactNode }) {
  return (
    <div className="omne-paper-session" data-frame={frame} {...sessionPaperItem.props}>
      <p className="omne-paper-session-said">{children}</p>
    </div>
  )
}

const lifecycleOf = (item: ListedSession) => LIFECYCLE[item.lifecycle]

function Facts({
  item,
  archived,
  now,
}: {
  readonly item: ListedSession
  readonly archived: boolean
  readonly now: number
}) {
  const lifecycle = lifecycleOf(item)
  const at = item.lastActivityAt
  if (at === null && lifecycle === undefined && !archived) return null
  return (
    <span className="omne-session-item-meta">
      {at === null ? null : <Ago at={encodeInstant(at)} now={now} />}
      {lifecycle === undefined ? null : <StateWord state={lifecycle} />}
      {archived ? <span>已归档</span> : null}
    </span>
  )
}

// On the sheet and in a pile the row opens the session; in the search the row is the search's own.
function Row({
  item,
  archived,
  frame,
  onOpen,
}: {
  readonly item: ListedSession
  readonly archived: boolean
  readonly frame: PaperFrame
  readonly onOpen: (session: string) => void
}) {
  const now = useAgeClock(item.lastActivityAt !== null)
  const facts = (
    <>
      <span className="omne-session-item-title">{sessionName(item)}</span>
      <Facts item={item} archived={archived} now={now} />
    </>
  )
  if (frame === 'search')
    return (
      <div className="omne-paper-session" data-frame={frame} {...sessionPaperItem.props}>
        {facts}
      </div>
    )
  return (
    <Button
      variant="ghost"
      className="omne-paper-session"
      data-frame={frame}
      {...sessionPaperItem.props}
      onClick={() => onOpen(item.session)}
    >
      {facts}
    </Button>
  )
}

function DirectoryRow({
  driver,
  tenant,
  archived,
  subject,
  onOpen,
}: {
  readonly driver: SessionDriver
  readonly tenant: string
  readonly archived: ArchivedDirectory
  readonly subject: PaperElementSubject
  readonly onOpen: (session: string) => void
}) {
  const { list } = useSyncExternalStore(driver.subscribe, driver.getState)
  const scan = useSyncExternalStore(
    useCallback((listener: () => void) => archived.subscribe(tenant, listener), [archived, tenant]),
    () => archived.read(tenant),
  )
  const { row, read } = paperRow(list, scan, subject.reference.ref)
  useEffect(() => {
    if (read === 'more') driver.loadMoreSessions()
    if (read === 'archived' && list.kind === 'read') archived.scan(tenant, list.page)
  }, [read, driver, archived, tenant, list])
  const { frame } = subject
  switch (row.kind) {
    case 'reading':
      return <LoadingState label="正在读这个会话……" />
    case 'unreadable':
      return <Said frame={frame}>读不到这个会话：它不在了，或你没有权限看。</Said>
    case 'unavailable':
      return <Said frame={frame}>现在读不到这个会话。</Said>
    case 'row':
      return <Row item={row.item} archived={row.archived} frame={frame} onOpen={onOpen} />
  }
}

/** A session on the paper: its row of the session directory, drawn for the frame it stands in. */
export function PaperSession({
  workspaces,
  archived,
  scope,
  subject,
  onOpen,
}: {
  readonly workspaces: SessionWorkspaces
  readonly archived: ArchivedDirectory
  readonly scope: string | undefined
  readonly subject: PaperElementSubject
  readonly onOpen: (session: string) => void
}) {
  const handle = useSession(workspaces, scope)
  if (handle.kind === 'unreadable') return <Said frame={subject.frame}>现在读不到这个会话。</Said>
  if (handle.kind !== 'ready' || scope === undefined)
    return <LoadingState label="正在读这个会话……" />
  return (
    <DirectoryRow
      driver={handle.driver}
      tenant={scope}
      archived={archived}
      subject={subject}
      onOpen={onOpen}
    />
  )
}

function PickRow({
  item,
  now,
  onPick,
}: {
  readonly item: ListedSession
  readonly now: number
  readonly onPick: () => void
}) {
  const lifecycle = lifecycleOf(item)
  const at = item.lastActivityAt
  return (
    <ListReadingRow
      title={sessionName(item)}
      {...(lifecycle === undefined ? {} : { facts: <StateWord state={lifecycle} /> })}
      {...(at === null ? {} : { time: <Ago at={encodeInstant(at)} now={now} /> })}
      onSelect={onPick}
    />
  )
}

function Picks({
  driver,
  subject,
}: {
  readonly driver: SessionDriver
  readonly subject: PaperPickerSubject
}) {
  const { list } = useSyncExternalStore(driver.subscribe, driver.getState)
  const rows = pickable(list, subject.query, PICKS)
  const more = list.kind === 'read' && list.page.next !== null && rows.length < PICKS
  useEffect(() => {
    if (more) driver.loadMoreSessions()
  }, [more, driver, list])
  const now = useAgeClock(rows.length > 0)
  if (rows.length === 0) {
    if (list.kind === 'failed') return null
    if (list.kind !== 'read' || more) return <LoadingState label="正在读会话……" />
    const words = subject.query.trim()
    return (
      <p className="omne-paper-pick-none" {...sessionPaperPick.props}>
        {words === '' ? '还没有会话。' : `没有名字里有「${words}」的会话。`}
      </p>
    )
  }
  return (
    <GlideMenu>
      <ul className="omne-paper-picks" aria-label="会话" {...sessionPaperPick.props}>
        {rows.map(item => (
          <li key={item.session}>
            <PickRow
              item={item}
              now={now}
              onPick={() => subject.pick({ kind: SESSION_KIND, ref: item.session })}
            />
          </li>
        ))}
      </ul>
    </GlideMenu>
  )
}

/** The open sessions of the tenant a search can pick one of, by the words of their names. */
export function PaperPicker({
  workspaces,
  scope,
  subject,
}: {
  readonly workspaces: SessionWorkspaces
  readonly scope: string | undefined
  readonly subject: PaperPickerSubject
}) {
  const handle = useSession(workspaces, scope)
  if (handle.kind !== 'ready') return null
  return <Picks driver={handle.driver} subject={subject} />
}
