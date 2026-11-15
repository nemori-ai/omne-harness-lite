import type { ReactNode } from 'react'

export const slots = {
  gate: { kind: 'one' },
  pages: { kind: 'list' },
  sidebar: { kind: 'list' },
} as const

export type SlotName = keyof typeof slots

export type GateProps = Readonly<Record<never, never>>

export type ScopedProps = Readonly<{ scope: string | undefined }>

export type GateItem = Readonly<{
  id: string
  render: (props: GateProps) => ReactNode
}>

export type PageItem = Readonly<{
  id: string
  title: string
  order: number
  icon?: string
  render: (props: ScopedProps) => ReactNode
}>

export type SidebarItem = Readonly<{
  id: string
  order: number
  render: (props: ScopedProps) => ReactNode
}>

export type SlotItems = {
  gate: GateItem
  pages: PageItem
  sidebar: SidebarItem
}

export type ItemOf<K extends SlotName> = SlotItems[K]

export interface ShellSlots {
  items<K extends SlotName>(slot: K): readonly ItemOf<K>[]
  subscribe(slot: SlotName, listener: () => void): () => void
}

export type ShellAssemblyReason = 'occupied' | 'duplicate'

export class ShellAssemblyError extends Error {
  readonly slot: SlotName
  readonly id: string
  readonly reason: ShellAssemblyReason
  constructor(slot: SlotName, id: string, reason: ShellAssemblyReason) {
    super(
      reason === 'occupied'
        ? `slot ${slot} already holds an item; cannot place ${id}`
        : `slot ${slot} already holds an item with id ${id}`,
    )
    this.name = 'ShellAssemblyError'
    this.slot = slot
    this.id = id
    this.reason = reason
  }
}
