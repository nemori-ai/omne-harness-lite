import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { refused } from '../model/notices.ts'
import type {
  QueuedInput,
  SessionWorkStore,
  WaitingCallItem,
  WorkRead,
} from '../model/session-work.ts'

const because = (outcome: string): string =>
  outcome === 'unavailable' ? '连不上服务。' : refused(outcome, '').text

const worthShowing = (read: WorkRead<unknown>): boolean =>
  read.kind === 'unreadable' || (read.kind === 'read' && read.items.length > 0)

function useSessionWork(store: SessionWorkStore, tenant: string, session: string, at: unknown) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const work = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  useEffect(() => {
    void store.refresh(tenant, session)
  }, [store, tenant, session, at])
  return work
}

function Part<T>({
  read,
  what,
  heading,
  line,
}: {
  readonly read: WorkRead<T>
  readonly what: string
  readonly heading: (count: number, more: boolean) => string
  readonly line: (item: T) => Readonly<{ key: string; text: string }>
}) {
  if (read.kind === 'unread' || !worthShowing(read)) return null
  if (read.kind === 'unreadable')
    return (
      <p className="omne-session-work-line">
        {what}现在读不到：{because(read.outcome)}
      </p>
    )
  return (
    <div className="omne-session-work-part">
      <p className="omne-session-work-line">{heading(read.items.length, read.more)}</p>
      <ul>
        {read.items.map(item => {
          const { key, text } = line(item)
          return <li key={key}>{text}</li>
        })}
      </ul>
    </div>
  )
}

const pendingHeading = (count: number, more: boolean): string =>
  more ? `至少还有 ${count} 句话排着没处理，这里只列出前面的` : `还有 ${count} 句话排着没处理`

const pendingLine = (input: QueuedInput) => ({
  key: input.input,
  text: `${input.source.label}：${input.preview}`,
})

const callsHeading = (count: number): string => `agent 停着，在等人答 ${count} 张卡`

const callLine = (call: WaitingCallItem) => ({
  key: `${call.card.owner}/${call.card.record}`,
  text: `${call.action ?? call.passage} · 卡 ${call.card.record}`,
})

/** What the session still holds: inputs no run took yet, and calls that wait for a person. */
export function SessionWork({
  store,
  tenant,
  session,
  revision,
}: {
  readonly store: SessionWorkStore
  readonly tenant: string
  readonly session: string
  /** The log position last seen; each new one reads again. */
  readonly revision: string | null
}) {
  const work = useSessionWork(store, tenant, session, revision)
  if (!worthShowing(work.pending) && !worthShowing(work.calls)) return null
  return (
    <section className="omne-session-work" aria-label="排着的与在等的">
      <Part read={work.pending} what="还排着哪些话" heading={pendingHeading} line={pendingLine} />
      <Part read={work.calls} what="在等人答的调用" heading={callsHeading} line={callLine} />
    </section>
  )
}
