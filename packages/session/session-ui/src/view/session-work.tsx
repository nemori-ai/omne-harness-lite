import { Disclosure } from '@omne-harness/ui-kit'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { refused } from '../model/notices.ts'
import type { SessionWorkStore } from '../model/session-work.ts'
import { sessionQueue } from '../parts.ts'

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

const heading = (count: number, more: boolean): string =>
  more ? `至少还有 ${count} 句话排着没处理` : `还有 ${count} 句话排着没处理`

/** The inputs no run took yet, one line unfolding into the list; calls waiting for a person have their cards. */
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
  const pending = useSessionWork(store, tenant, session, revision).pending
  if (pending.kind === 'unread' || (pending.kind === 'read' && pending.items.length === 0))
    return null
  return (
    <section className="omne-session-work" aria-label="排着的话" {...sessionQueue.props}>
      {pending.kind === 'unreadable' ? (
        <p className="omne-session-work-line">还排着哪些话现在读不到：{because(pending.outcome)}</p>
      ) : (
        <Disclosure label={heading(pending.items.length, pending.more)} triggerClassName="text-xs">
          <ul className="omne-session-work-list">
            {pending.items.map(input => (
              <li key={input.input}>
                {input.source.label}：{input.preview}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  )
}
