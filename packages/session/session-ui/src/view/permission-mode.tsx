import { Segmented } from '@omne-harness/ui-kit'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  MODE_LABELS,
  type PermissionMode,
  type PermissionModeStore,
} from '../model/permission-mode.ts'

type Props = Readonly<{ store: PermissionModeStore; tenant: string; session: string }>

const OPTIONS = (Object.keys(MODE_LABELS) as PermissionMode[]).map(value => ({
  value,
  label: MODE_LABELS[value],
}))

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
      <Segmented
        label="权限处理"
        value={view.mode}
        options={OPTIONS}
        onValueChange={mode => void store.change(tenant, session, mode).then(say)}
      />
      {said === null ? null : <span role="status">{said}</span>}
    </span>
  )
}
