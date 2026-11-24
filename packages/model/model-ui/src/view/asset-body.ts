import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { useEffect, useState, useSyncExternalStore } from 'react'

type Described = Readonly<{ content: Readonly<{ kind: string; body?: JsonValue }> }>
type Detail = Readonly<{ kind: string; asset?: Described; shown?: Described }>
type KeyRow = Readonly<{
  key?: string
  view: Readonly<{
    kind: string
    item?: string
    own?: unknown
    official?: unknown
    editable?: Readonly<{ kind: string; reason?: string }>
  }>
  write?: Readonly<{ kind: string; notice?: Readonly<{ text: string }> }>
}>
type Entry = Readonly<{
  row: Readonly<{ name: string; summary?: Readonly<{ title: string }> | null }>
  detail: Detail | null
  settings?: readonly KeyRow[]
}>
type Snapshot = Readonly<{
  kind: string
  assets?: Readonly<{ kind: string; entries?: readonly Entry[] }>
}>

/** What this module reads of the assets of one category: the shape it needs of the asset governance port. */
export type AssetView = Readonly<{
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => Snapshot
  close: () => void
  setValue: (key: string, value: JsonValue) => void
  confirm: (key: string) => void
}>

export type AssetPort = Readonly<{ open: (tenantText: string, category: string) => AssetView }>
export type { Entry, KeyRow, Snapshot }

const EMPTY: Snapshot = { kind: 'reading' }
/** A view of nothing, for while no port is opened; its snapshot is always the same value. */
export const IDLE_VIEW: AssetView = {
  subscribe: () => () => undefined,
  getSnapshot: () => EMPTY,
  close: () => {},
  setValue: () => {},
  confirm: () => {},
}

/** The view of one category opened while the caller is drawn, and the entry of one asset in it. */
export function useAssetEntry(
  port: AssetPort,
  tenant: string,
  category: string,
  name: string,
): Readonly<{ view: AssetView; snapshot: Snapshot; entry: Entry | undefined }> {
  const [view, setView] = useState<AssetView>(IDLE_VIEW)
  useEffect(() => {
    const opened = port.open(tenant, category)
    setView(opened)
    return opened.close
  }, [port, tenant, category])
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  return { view, snapshot, entry: snapshot.assets?.entries?.find(each => each.row.name === name) }
}

/** The body of an entry as plain JSON once the assets page has read it; undefined before, and for files. */
export function bodyOf(entry: Entry | undefined): unknown {
  const described = entry?.detail?.asset ?? entry?.detail?.shown
  const body = described?.content.kind === 'data' ? described.content.body : undefined
  return body === undefined ? undefined : (JSON.parse(writeJsonText(body)) as unknown)
}

/** The body of one asset as plain JSON once the assets page has read it; undefined before, and for files. */
export function useAssetBody(
  port: AssetPort,
  tenant: string,
  category: string,
  name: string,
): unknown {
  return bodyOf(useAssetEntry(port, tenant, category, name).entry)
}
