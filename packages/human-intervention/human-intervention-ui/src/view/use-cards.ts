import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { CardsHub } from '../model/cards-hub.ts'
import type { State } from '../model/cards-machine.ts'

export function useTenant(text: string): TenantId | undefined {
  return useMemo(() => readTenantText(text), [text])
}

export function useCards(
  hub: CardsHub,
  tenant: TenantId,
): Readonly<{ driver: CardsDriver; state: State }> {
  const driver = useMemo(() => hub.driver(tenant), [hub, tenant])
  useEffect(() => driver.retain(), [driver])
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  return { driver, state }
}
