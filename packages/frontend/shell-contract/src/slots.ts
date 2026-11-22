import type { ReactNode } from 'react'

export const slots = {
  gate: { kind: 'one' },
  pages: { kind: 'list' },
  sidebar: { kind: 'list' },
  attached: { kind: 'list' },
} as const

export type SlotName = keyof typeof slots

export type GateProps = Readonly<Record<never, never>>

export type ScopedProps = Readonly<{ scope: string | undefined }>

/** A page may be brought up on one object of its own, as a toast's action names it. */
export type PageProps = Readonly<{ scope: string | undefined; subject?: string }>

export type AttachedProps = Readonly<{ scope: string | undefined; subject: string }>

export type GateItem = Readonly<{
  id: string
  render: (props: GateProps) => ReactNode
}>

/** The part of the sidebar an item sits in: `primary` at the top, `utility` at the foot. */
type SidebarGroup = 'primary' | 'utility'

export type PageItem = Readonly<{
  id: string
  title: string
  order: number
  /** A name in the icon set: all a page keeps when the sidebar folds to a rail. */
  icon: string
  group?: SidebarGroup
  badge?: (props: ScopedProps) => ReactNode
  render: (props: PageProps) => ReactNode
}>

export type SidebarItem = Readonly<{
  id: string
  order: number
  group?: SidebarGroup
  /** What the item draws when the sidebar folds to a rail; without it the rail leaves it out. */
  rail?: (props: ScopedProps) => ReactNode
  render: (props: ScopedProps) => ReactNode
}>

export type AttachedItem = Readonly<{
  id: string
  order: number
  anchor: string
  label?: string
  render: (props: AttachedProps) => ReactNode
}>

export type AttachedEntry = Readonly<{ id: string; label: string | undefined; node: ReactNode }>

export type AttachedLayout = (entries: readonly AttachedEntry[]) => ReactNode

export type SlotItems = {
  gate: GateItem
  pages: PageItem
  sidebar: SidebarItem
  attached: AttachedItem
}

export type ItemOf<K extends SlotName> = SlotItems[K]

/** One spot where two modules put different things: neither is drawn until one of them leaves. */
export type SlotConflict = Readonly<{
  slot: SlotName
  anchor: string | undefined
  id: string
  by: readonly string[]
}>

export interface ShellSlots {
  items<K extends SlotName>(slot: K): readonly ItemOf<K>[]
  conflicts(slot: SlotName): readonly SlotConflict[]
  subscribe(slot: SlotName, listener: () => void): () => void
}

export type ShellAssemblyReason = 'duplicate' | 'invalid'

const SAID: Readonly<Record<ShellAssemblyReason, string>> = {
  duplicate: 'this module already put an item there',
  invalid: 'the item cannot be put there',
}

export class ShellAssemblyError extends Error {
  readonly slot: SlotName
  readonly id: string
  readonly reason: ShellAssemblyReason
  constructor(slot: SlotName, id: string, reason: ShellAssemblyReason, detail: string) {
    super(`slot ${slot}, item ${id}: ${SAID[reason]} (${detail})`)
    this.name = 'ShellAssemblyError'
    this.slot = slot
    this.id = id
    this.reason = reason
  }
}
