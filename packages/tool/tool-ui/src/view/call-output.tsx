import { useCallback, useSyncExternalStore } from 'react'
import type { CallOutputStore } from '../model/call-output.ts'

export function CallOutput({
  store,
  tenant,
  reference,
}: {
  readonly store: CallOutputStore
  readonly tenant: string
  readonly reference: string
}) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, reference, listener),
    [store, tenant, reference],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, reference))
  switch (view.kind) {
    case 'unread':
      return <p className="omne-call-output-note">正在读输出…</p>
    case 'none':
      return <p className="omne-call-output-note">还没有可读的输出</p>
    case 'unreadable':
      return <p className="omne-call-output-note">输出现在读不到：{view.reason}</p>
    case 'text':
      return (
        <figure className="omne-call-output">
          <pre aria-label="调用的输出">{view.text}</pre>
          <figcaption>{view.sealed ? '输出已写完' : '输出还在写'}</figcaption>
        </figure>
      )
  }
}
