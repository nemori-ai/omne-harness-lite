import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { useEffect, useState, useSyncExternalStore } from 'react'

type Described = Readonly<{ content: Readonly<{ kind: string; body?: JsonValue }> }>
type Detail = Readonly<{ kind: string; asset?: Described; shown?: Described }>
type Entry = Readonly<{ row: Readonly<{ name: string }>; detail: Detail | null }>
type Snapshot = Readonly<{
  kind: string
  assets?: Readonly<{ kind: string; entries?: readonly Entry[] }>
}>

/** What this module reads of the assets of one category: the shape it needs of the asset governance port. */
export type AssetView = Readonly<{
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => Snapshot
  close: () => void
}>

export type AssetPort = Readonly<{ open: (tenantText: string, category: string) => AssetView }>

const EMPTY: Snapshot = { kind: 'reading' }
const idle: AssetView = {
  subscribe: () => () => undefined,
  getSnapshot: () => EMPTY,
  close: () => {},
}

/** The body of one asset as plain JSON once the assets page has read it; undefined before, and for files. */
export function useAssetBody(
  port: AssetPort,
  tenant: string,
  category: string,
  name: string,
): unknown {
  const [view, setView] = useState<AssetView>(idle)
  useEffect(() => {
    const opened = port.open(tenant, category)
    setView(opened)
    return opened.close
  }, [port, tenant, category])
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const entry = snapshot.assets?.entries?.find(each => each.row.name === name)
  const described = entry?.detail?.asset ?? entry?.detail?.shown
  const body = described?.content.kind === 'data' ? described.content.body : undefined
  return body === undefined ? undefined : (JSON.parse(writeJsonText(body)) as unknown)
}
