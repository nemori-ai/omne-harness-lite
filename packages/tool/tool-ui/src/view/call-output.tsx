import { CodeSurface, InlineNotice, LoadingState, StateWord } from '@omne-harness/ui-kit'
import { useCallback, useSyncExternalStore } from 'react'
import { toolCallOutput } from '../parts.ts'
import type { CallOutputStore } from '../model/call-output.ts'

/** A refusal and a result nobody knows are neutral; any other outcome is a known fact, said as a caution. */
const NEUTRAL = new Set(['denied', 'uncertain'])

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
      return <LoadingState label="正在读输出…" />
    case 'none':
      return <p className="text-xs text-ink-muted">还没有可读的输出</p>
    case 'unreadable':
      return (
        <InlineNotice tone={NEUTRAL.has(view.reason) ? 'neutral' : 'caution'} detail={view.reason}>
          输出现在读不到。
        </InlineNotice>
      )
    case 'text':
      // The surface scrolls by itself under its header's rule; a finished output says nothing more.
      return (
        <div role="group" aria-label="调用的输出" {...toolCallOutput.props}>
          <CodeSurface name="输出" text={view.text} />
          {view.sealed ? null : <StateWord state="outputOpen" className="mt-1" />}
        </div>
      )
  }
}
