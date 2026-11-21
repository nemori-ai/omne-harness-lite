import {
  Ago,
  Button,
  Disclosure,
  DropdownMenuItem,
  EmptyState,
  InlineNotice,
  Input,
  useAgeClock,
  useArrival,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { Fragment, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import {
  archivedByText,
  type ArchiveStore,
  type ArchivedItem,
  type ArchivedView,
} from '../model/archive.ts'
import { sessionName } from '../model/session-list.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { useSession } from './use-session.ts'

type Props = Readonly<{ store: ArchiveStore; workspaces: SessionWorkspaces; tenant: string }>

// After a change the list of sessions not archived is read again, so a session is in one list.
function useReloadList(workspaces: SessionWorkspaces, tenant: string) {
  const handle = useSession(workspaces, tenant)
  return () => {
    if (handle.kind === 'ready') handle.driver.loadList()
  }
}

/** 「归档」 in the heading's `⋯`: it asks nothing and sends at once; what came of it is said once by the heading. */
export function ArchiveAction({
  store,
  workspaces,
  tenant,
  session,
  say,
}: Props & { session: string; say: (text: string) => void }) {
  const reload = useReloadList(workspaces, tenant)
  return (
    <DropdownMenuItem
      onSelect={() =>
        void store.archive(tenant, session).then(text => {
          say(text)
          reload()
        })
      }
    >
      归档
    </DropdownMenuItem>
  )
}

function ArchivedRow({
  item,
  now,
  onUnarchive,
}: {
  readonly item: ArchivedItem
  readonly now: number
  readonly onUnarchive: () => void
}) {
  return (
    <li className="omne-archived-row">
      <span className="omne-archived-text">
        <span className="omne-archived-title">{sessionName(item)}</span>
        <span className="omne-archived-meta">
          {item.archivedAt === null ? null : <Ago at={encodeInstant(item.archivedAt)} now={now} />}
          <span>{archivedByText(item)}</span>
        </span>
      </span>
      <Button variant="ghost" size="compact" onClick={onUnarchive}>
        撤销归档
      </Button>
    </li>
  )
}

/** What an unarchive answered: shown once, under its row, or where the row was once the row has left the list. */
type Said = Readonly<{ session: string; at: number; text: string }>

function Receipt({ text }: { readonly text: string }) {
  const node = useRef<HTMLLIElement>(null)
  useArrival(node)
  return (
    <li ref={node} role="status" className="omne-archived-receipt">
      {text}
    </li>
  )
}

function ArchivedRows({
  rows,
  said,
  onUnarchive,
}: {
  readonly rows: readonly ArchivedItem[]
  readonly said: Said | null
  readonly onUnarchive: (item: ArchivedItem, at: number) => void
}) {
  const now = useAgeClock(rows.length > 0)
  const shown = rows.map((item, at) => (
    <Fragment key={item.session}>
      <ArchivedRow item={item} now={now} onUnarchive={() => onUnarchive(item, at)} />
      {said?.session === item.session ? <Receipt text={said.text} /> : null}
    </Fragment>
  ))
  if (said !== null && !rows.some(item => item.session === said.session))
    shown.splice(Math.min(said.at, shown.length), 0, <Receipt key="receipt" text={said.text} />)
  return <ul className="omne-archived-rows">{shown}</ul>
}

function ArchivedList({
  view,
  said,
  onUnarchive,
  onMore,
}: {
  readonly view: ArchivedView
  readonly said: Said | null
  readonly onUnarchive: (item: ArchivedItem, at: number) => void
  readonly onMore: () => void
}) {
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable')
    return <InlineNotice tone="neutral">已归档的会话暂时读不到。</InlineNotice>
  const { sessions, next, completeness } = view.page
  return (
    <>
      {sessions.length > 0 || said !== null ? (
        <ArchivedRows rows={sessions} said={said} onUnarchive={onUnarchive} />
      ) : null}
      {sessions.length === 0 ? <EmptyState title="没有已归档的会话。" /> : null}
      {completeness === 'partial' || next !== null ? (
        <div className="omne-archived-end">
          {completeness === 'partial' ? <p className="omne-archived-note">列表可能不全</p> : null}
          {next === null ? null : (
            <Button variant="ghost" size="compact" className="text-xs" onClick={onMore}>
              更多
            </Button>
          )}
        </div>
      ) : null}
    </>
  )
}

export function ArchivedSessions({ store, workspaces, tenant }: Props) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, listener),
    [store, tenant],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant))
  const reload = useReloadList(workspaces, tenant)
  const [title, setTitle] = useState('')
  const [said, say] = useState<Said | null>(null)
  return (
    <section className="omne-archived" aria-label="已归档的会话">
      <Disclosure
        label="已归档"
        onOpenChange={open => {
          if (!open) return
          say(null)
          void store.load(tenant, title)
        }}
      >
        <form
          className="omne-archived-find"
          onSubmit={event => {
            event.preventDefault()
            say(null)
            void store.load(tenant, title)
          }}
        >
          <Input
            aria-label="按标题里的字找"
            placeholder="按标题里的字找"
            value={title}
            maxLength={200}
            onChange={event => setTitle(event.target.value)}
          />
        </form>
        <ArchivedList
          view={view}
          said={said}
          onUnarchive={(item, at) =>
            void store.unarchive(tenant, item.session).then(text => {
              say({ session: item.session, at, text })
              reload()
            })
          }
          onMore={() => {
            if (view.kind === 'listed') void store.load(tenant, view.title, true)
          }}
        />
      </Disclosure>
    </section>
  )
}
