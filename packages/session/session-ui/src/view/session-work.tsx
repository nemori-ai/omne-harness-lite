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

function Pending({
  read,
}: {
  readonly read: WorkRead<{ inputs: readonly QueuedInput[]; more: boolean }>
}) {
  if (read.kind === 'unread') return null
  if (read.kind === 'unreadable')
    return <p className="omne-session-work-line">还排着哪些话现在读不到：{because(read.outcome)}</p>
  const { inputs, more } = read.value
  if (inputs.length === 0) return null
  return (
    <div className="omne-session-work-part">
      <p className="omne-session-work-line">
        {more
          ? `至少还有 ${inputs.length} 句话排着没处理，这里只列出前面的`
          : `还有 ${inputs.length} 句话排着没处理`}
      </p>
      <ul>
        {inputs.map(input => (
          <li key={input.input} data-role={input.role}>
            {input.source.label}：{input.preview}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Calls({ read }: { readonly read: WorkRead<readonly WaitingCallItem[]> }) {
  if (read.kind === 'unread') return null
  if (read.kind === 'unreadable')
    return (
      <p className="omne-session-work-line">在等人答的调用现在读不到：{because(read.outcome)}</p>
    )
  if (read.value.length === 0) return null
  return (
    <div className="omne-session-work-part">
      <p className="omne-session-work-line">agent 停着，在等人答 {read.value.length} 张卡</p>
      <ul>
        {read.value.map(call => (
          <li key={`${call.card.owner}/${call.card.record}`}>
            {call.action ?? call.passage} · 卡 {call.card.record}
          </li>
        ))}
      </ul>
    </div>
  )
}

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
  const shown = [work.pending, work.calls].some(
    read => read.kind === 'unreadable' || (read.kind === 'read' && hasAny(read.value)),
  )
  if (!shown) return null
  return (
    <section className="omne-session-work" aria-label="排着的与在等的">
      <Pending read={work.pending} />
      <Calls read={work.calls} />
    </section>
  )
}

const hasAny = (value: Readonly<{ inputs: readonly unknown[] }> | readonly unknown[]): boolean =>
  'inputs' in value ? value.inputs.length > 0 : value.length > 0
