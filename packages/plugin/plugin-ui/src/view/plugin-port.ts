import type { ComponentType } from 'react'

/** One member of a plugin as the assets tell it: where it is placed, which side, the category it is one of, and whether it is in effect. */
export type PlacedMember = Readonly<{
  point: string
  key: string
  /** The id of the item, on a point that tells its items by id. */
  id: string | null
  side: 'client' | 'server' | null
  category: string | null
  categoryTitle: string | null
  standing: string
  says: string
  /** What a person sees the member and its point called, when one is written. */
  title?: string
  pointTitle?: string
}>

export type TakenBack = Readonly<{
  mark: string
  of: string | null
  point: string
  key: string
  id: string | null
  says: string
  title?: string
  pointTitle?: string
}>

export type PluginEffect = Readonly<{
  places: readonly PlacedMember[]
  advice: string | null
  disable: readonly TakenBack[] | null
  remove: readonly TakenBack[] | null
}>

type Described = Readonly<{ effect?: PluginEffect }>

export type PluginNotice = Readonly<{ kind: string; text: string }>

export type PluginDetail =
  | Readonly<{ kind: 'reading'; shown?: Described }>
  | Readonly<{ kind: 'read'; asset: Described }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'failed'; notice: PluginNotice }>

export type PluginEntry = Readonly<{
  row: Readonly<{
    name: string
    enabled: boolean
    summary: Readonly<{ title: string; description: string }> | null
  }>
  settings: readonly Readonly<{ key: string }>[]
  detail: PluginDetail | null
  action:
    | Readonly<{ kind: 'none' | 'submitting' }>
    | Readonly<{ kind: 'done'; text: string }>
    | Readonly<{ kind: 'unknown' | 'refused'; notice: PluginNotice }>
}>

type Listed =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: PluginNotice }>
  | Readonly<{ kind: 'read'; entries: readonly PluginEntry[]; partial: boolean }>

export type PluginSnapshot =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: PluginNotice }>
  | Readonly<{ kind: 'read'; assets: Listed }>

/** What the page of the plugins reads and does through the assets' governance port: the category `plugin`. */
export type PluginView = Readonly<{
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => PluginSnapshot
  read: () => void
  openAsset: (name: string) => void
  closeAsset: (name: string) => void
  setEnabled: (name: string, enabled: boolean) => void
  remove: (name: string) => void
  close: () => void
  Row: ComponentType<{ rowKey: string }>
}>

export type PluginGovernance = Readonly<{
  open: (tenantText: string, category: string) => PluginView
}>
