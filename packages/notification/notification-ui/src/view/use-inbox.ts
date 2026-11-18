import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { InboxDriver } from '../model/inbox-driver.ts'
import type { InboxHub } from '../model/inbox-hub.ts'
import type { State } from '../model/inbox-machine.ts'

export function useTenant(text: string): TenantId | undefined {
  return useMemo(() => readTenantText(text), [text])
}

export function useInbox(
  hub: InboxHub,
  tenant: TenantId,
): Readonly<{ driver: InboxDriver; state: State }> {
  const driver = useMemo(() => hub.driver(tenant), [hub, tenant])
  useEffect(() => driver.retain(), [driver])
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  return { driver, state }
}
