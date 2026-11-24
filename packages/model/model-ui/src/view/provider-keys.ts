import { useEffect, useState, useSyncExternalStore } from 'react'
import { IDLE_VIEW, type AssetPort, type AssetView, type KeyRow } from './asset-body.ts'

const NONE: readonly string[] = []

const lacksKey = (rows: readonly KeyRow[]): boolean =>
  rows.some(
    row => row.view.kind === 'secret' && row.view.own === 'unset' && row.view.official === 'unset',
  )

/** The providers with a secret item that no layer fills, by the name the list shows; none while unread. */
export function useProvidersWithoutKey(
  port: AssetPort | undefined,
  tenant: string,
  category: string,
): readonly string[] {
  const [view, setView] = useState<AssetView>(IDLE_VIEW)
  useEffect(() => {
    if (port === undefined) return
    const opened = port.open(tenant, category)
    setView(opened)
    return opened.close
  }, [port, tenant, category])
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const missing = (snapshot.assets?.entries ?? [])
    .filter(entry => lacksKey(entry.settings ?? []))
    .map(entry => entry.row.summary?.title ?? entry.row.name)
  return missing.length === 0 ? NONE : missing
}
