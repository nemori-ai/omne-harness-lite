import { StateWord, type StateLabel } from '@omne-harness/ui-kit'
import type { ToolCallChild } from '@omne-harness/tool-protocol'
import { useCallback, useSyncExternalStore } from 'react'
import { toolCallChildren } from '../parts.ts'
import type { CallChildrenStore } from '../model/call-children.ts'

const WORD: Readonly<Record<ToolCallChild['state'], StateLabel>> = {
  queued: 'queued',
  running: 'working',
  waiting: 'approval',
  background: 'background',
  completed: 'completed',
  failed: 'failed',
  denied: 'refused',
  stopped: 'stopped',
  unknown: 'unknown',
}

/** The positions under a call, one row each by ordinal; a call with none, or one not read, draws nothing. */
export function CallChildren({
  store,
  tenant,
  reference,
}: {
  readonly store: CallChildrenStore
  readonly tenant: string
  readonly reference: string
}) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, reference, listener),
    [store, tenant, reference],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, reference))
  if (view.kind !== 'listed' || view.items.length === 0) return null
  return (
    <ol aria-label="子调用" className="flex flex-col gap-1 text-xs" {...toolCallChildren.props}>
      {view.items.map(item => (
        <li key={item.ordinal} className="flex items-baseline gap-2" data-child-state={item.state}>
          <span className="font-mono text-ink-muted">{item.ordinal}</span>
          <span className="font-mono">
            {item.command === null ? item.tool : `${item.tool} ${item.command}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink-muted">{item.preview}</span>
          <StateWord state={WORD[item.state]} />
        </li>
      ))}
    </ol>
  )
}
