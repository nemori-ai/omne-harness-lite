import { readTenantText } from '@omne-harness/public-contract'
import { useEffect, useMemo, useState } from 'react'
import type { SessionDriver } from '../model/session-driver.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'

export type SessionHandle =
  | Readonly<{ kind: 'waiting' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'ready'; driver: SessionDriver }>

const WAITING: SessionHandle = { kind: 'waiting' }
const UNREADABLE: SessionHandle = { kind: 'unreadable' }

export function useSession(
  workspaces: SessionWorkspaces,
  scope: string | undefined,
): SessionHandle {
  const tenant = useMemo(() => (scope === undefined ? undefined : readTenantText(scope)), [scope])
  const [held, setHeld] = useState<{ scope: string; driver: SessionDriver } | null>(null)
  useEffect(() => {
    if (scope === undefined || tenant === undefined) return
    const lease = workspaces.acquire(scope, tenant)
    setHeld({ scope, driver: lease.driver })
    return () => lease.release()
  }, [workspaces, scope, tenant])
  if (scope === undefined) return WAITING
  if (tenant === undefined) return UNREADABLE
  return held === null || held.scope !== scope ? WAITING : { kind: 'ready', driver: held.driver }
}
