import { Button, Input, StatusPill } from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { archivedByText, type ArchiveStore, type ArchivedItem } from '../model/archive.ts'
import { sessionName } from '../model/session-list.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { formatMoment } from './moment.ts'
import { useSession } from './use-session.ts'

type Props = Readonly<{ store: ArchiveStore; workspaces: SessionWorkspaces; tenant: string }>

// After a change the list of sessions not archived is read again, so a session is in one list.
function useReloadList(workspaces: SessionWorkspaces, tenant: string) {
  const handle = useSession(workspaces, tenant)
  return () => {
    if (handle.kind === 'ready') handle.driver.loadList()
  }
}

export function ArchiveAction({ store, workspaces, tenant, session }: Props & { session: string }) {
  const reload = useReloadList(workspaces, tenant)
  const [said, say] = useState<string | null>(null)
  return (
    <span className="omne-session-archive">
      <Button
        variant="ghost"
        size="compact"
        onClick={() =>
          void store.archive(tenant, session).then(text => {
            say(text)
            reload()
          })
        }
      >
        归档
      </Button>
      {said === null ? null : <span role="status">{said}</span>}
    </span>
  )
}

function ArchivedRow({
  item,
  onUnarchive,
}: {
  readonly item: ArchivedItem
  readonly onUnarchive: () => void
}) {
  return (
    <li className="omne-archived-item">
      <span className="omne-session-item-title">{sessionName(item)}</span>
      <span className="omne-session-item-meta">
        {item.archivedAt === null ? null : (
          <time dateTime={encodeInstant(item.archivedAt)}>{formatMoment(item.archivedAt)}</time>
        )}
        <StatusPill tone="neutral">{archivedByText(item)}</StatusPill>
      </span>
      <Button variant="ghost" size="compact" onClick={onUnarchive}>
        撤销归档
      </Button>
    </li>
  )
}

export function ArchivedSessions({ store, workspaces, tenant }: Props) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, listener),
    [store, tenant],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant))
  const reload = useReloadList(workspaces, tenant)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [said, say] = useState<string | null>(null)
  if (!open)
    return (
      <Button
        variant="ghost"
        size="compact"
        onClick={() => {
          setOpen(true)
          void store.load(tenant, title)
        }}
      >
        已归档
      </Button>
    )
  return (
    <section className="omne-archived" aria-label="已归档的会话">
      <form
        onSubmit={event => {
          event.preventDefault()
          void store.load(tenant, title)
        }}
      >
        <Input
          aria-label="按标题里的字找"
          value={title}
          maxLength={200}
          onChange={event => setTitle(event.target.value)}
        />
      </form>
      {view.kind === 'unreadable' ? (
        <p className="omne-sessions-note">已归档的会话暂时读不到。</p>
      ) : null}
      {view.kind === 'listed' ? (
        <>
          <ul className="omne-session-items">
            {view.page.sessions.map(item => (
              <ArchivedRow
                key={item.session}
                item={item}
                onUnarchive={() =>
                  void store.unarchive(tenant, item.session).then(text => {
                    say(text)
                    reload()
                  })
                }
              />
            ))}
          </ul>
          {view.page.sessions.length === 0 ? (
            <p className="omne-sessions-note">没有已归档的会话。</p>
          ) : null}
          {view.page.next === null ? null : (
            <Button
              variant="ghost"
              size="compact"
              onClick={() => void store.load(tenant, view.title, true)}
            >
              更多
            </Button>
          )}
          {view.page.completeness === 'partial' ? (
            <p className="omne-sessions-note">列表可能不全</p>
          ) : null}
        </>
      ) : null}
      {said === null ? null : <span role="status">{said}</span>}
      <Button variant="ghost" size="compact" onClick={() => setOpen(false)}>
        收起
      </Button>
    </section>
  )
}
