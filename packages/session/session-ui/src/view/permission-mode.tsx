import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@omne-harness/ui-kit'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  MODE_LABELS,
  type PermissionMode,
  type PermissionModeStore,
} from '../model/permission-mode.ts'

type Props = Readonly<{ store: PermissionModeStore; tenant: string; session: string }>

const MODES = Object.keys(MODE_LABELS) as PermissionMode[]

const modeOf = (value: string): PermissionMode | undefined => MODES.find(mode => mode === value)

/** How the session handles permissions: a quiet dropdown in the heading whose face is the mode in force. */
export function PermissionModeAction({ store, tenant, session }: Props) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  const [said, say] = useState<string | null>(null)
  useEffect(() => {
    void store.load(tenant, session)
  }, [store, tenant, session])
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable')
    return (
      <span className="omne-session-mode" role="status">
        权限处理读不到：{view.reason}
      </span>
    )
  return (
    <span className="omne-session-mode">
      <Select
        value={view.mode}
        onValueChange={value => {
          const mode = modeOf(value)
          if (mode !== undefined) void store.change(tenant, session, mode).then(say)
        }}
      >
        <SelectTrigger aria-label="权限处理" size="sm">
          <SelectValue>{MODE_LABELS[view.mode]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MODES.map(mode => (
            <SelectItem key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {said === null ? null : <span role="status">{said}</span>}
    </span>
  )
}
