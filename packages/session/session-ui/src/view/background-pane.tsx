import type { AttachedEntry } from '@omne-harness/shell-contract'
import { Button } from '@omne-harness/ui-kit'
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  actionText,
  statusText,
  stopText,
  type BackgroundCallItem,
  type BackgroundCallsStore,
} from '../model/background-calls.ts'
import { SidePanel } from './side-panel.tsx'

function useBackgroundCalls(store: BackgroundCallsStore, tenant: string, session: string) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  return useSyncExternalStore(subscribe, () => store.read(tenant, session))
}

function CallRow({
  call,
  onStop,
  detail,
}: {
  readonly call: BackgroundCallItem
  readonly onStop: (call: BackgroundCallItem) => void
  readonly detail: ReactNode
}) {
  const stop = stopText(call)
  const stoppable = call.stop === null && call.status !== 'ended-pending'
  return (
    <li className="omne-background-call" data-call={call.id}>
      <div className="omne-background-call-head">
        <strong>{call.id}</strong>
        <span data-status={call.status}>{statusText(call)}</span>
        <span>{call.label.intent ?? '（没有写意图）'}</span>
        {stoppable ? (
          <Button variant="ghost" onClick={() => onStop(call)}>
            停止
          </Button>
        ) : null}
      </div>
      <div className="omne-background-call-action">{actionText(call)}</div>
      {stop === null ? null : <div className="omne-background-call-stop">{stop}</div>}
      {call.lastLine === null ? null : (
        <div className="omne-background-call-last">{call.lastLine}</div>
      )}
      {detail}
    </li>
  )
}

export function BackgroundPane({
  store,
  tenant,
  session,
  detail,
}: {
  readonly store: BackgroundCallsStore
  readonly tenant: string
  readonly session: string
  readonly detail: (call: string) => ReactNode
}) {
  const view = useBackgroundCalls(store, tenant, session)
  const [notice, setNotice] = useState<string | null>(null)
  const onStop = (call: BackgroundCallItem) =>
    void store.stop(tenant, session, call).then(setNotice)
  if (view.kind === 'unread') return <p className="omne-background-empty">正在读后台调用…</p>
  if (view.kind === 'unreadable')
    return <p className="omne-background-empty">后台调用现在读不到：{view.reason}</p>
  return (
    <section className="omne-background-pane" aria-label="本会话的后台调用">
      {notice === null ? null : <p className="omne-background-notice">{notice}</p>}
      {view.calls.length === 0 ? (
        <p className="omne-background-empty">没有在后台的调用</p>
      ) : (
        <ul>
          {view.calls.map(call => (
            <CallRow
              key={call.id}
              call={call}
              onStop={onStop}
              detail={detail(call.producer.call)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** One line above the composer while calls of the session run in the background. */
export function BackgroundHint({
  store,
  tenant,
  session,
}: {
  readonly store: BackgroundCallsStore
  readonly tenant: string
  readonly session: string
}) {
  const view = useBackgroundCalls(store, tenant, session)
  if (view.kind !== 'listed' || view.calls.length === 0) return null
  return (
    <p className="omne-background-hint" role="status">
      后台有 {view.calls.length} 项调用在跑，在侧边区的「后台」里看
    </p>
  )
}

export const BACKGROUND_CALLS = 'background-calls'

/** The side area of a session: the entries others placed, then 后台 while calls run there. */
export function SideWithBackground({
  entries,
  store,
  tenant,
  session,
  detail,
}: {
  readonly entries: readonly AttachedEntry[]
  readonly store: BackgroundCallsStore
  readonly tenant: string
  readonly session: string
  readonly detail: (call: string) => ReactNode
}) {
  const view = useBackgroundCalls(store, tenant, session)
  const running = view.kind === 'listed' && view.calls.length > 0
  const pane = <BackgroundPane store={store} tenant={tenant} session={session} detail={detail} />
  const all = running ? [...entries, { id: BACKGROUND_CALLS, label: '后台', node: pane }] : entries
  return <SidePanel entries={all} />
}
