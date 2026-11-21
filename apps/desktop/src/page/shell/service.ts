import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createElement, type ReactNode } from 'react'
import {
  type AttachedLayout,
  type FigureBoard,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotName,
  type ToastBoard,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { Arranged, Attached } from './attached.tsx'
import type { ShellState } from './state.ts'

export class DesktopShell extends ShellService implements ShellSlots {
  readonly login: ShellLogin
  readonly scope: ScopeSource
  private readonly state: ShellState

  constructor(ctx: Context, state: ShellState) {
    super(ctx)
    this.state = state
    this.login = state.login
    this.scope = state.scope
  }

  items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
    return this.state.slots.items(slot)
  }

  subscribe(slot: SlotName, listener: () => void): () => void {
    return this.state.slots.subscribe(slot, listener)
  }

  navigate(pageId: string, subject?: string): void {
    this.state.page.choose(pageId, subject)
  }

  /** Only which page is on show: choosing one stays with `navigate`. */
  override get page(): ShellService['page'] {
    const { get, subscribe } = this.state.page
    return { get, subscribe }
  }

  attached(anchor: string, subject: string): ReactNode {
    return createElement(Attached, {
      slots: this.state.slots,
      scope: this.state.scope,
      anchor,
      subject,
    })
  }

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return createElement(Arranged, {
      slots: this.state.slots,
      scope: this.state.scope,
      anchor,
      subject,
      layout,
    })
  }

  /** A page remembers the module that placed it: that module is in front while its page is on show. */
  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    const takeDown = this.state.slots.place(slot, item)
    if (slot !== 'pages') return takeDown
    const { pageOwners } = this.state
    const owner = this.ctx.fiber
    pageOwners.set(item.id, owner)
    return () => {
      takeDown()
      if (pageOwners.get(item.id) === owner) pageOwners.delete(item.id)
    }
  }

  protected override toasts(): ToastBoard {
    return this.state.told
  }

  protected override figures(): FigureBoard {
    return this.state.figure
  }
}

export function shellPlugin(state: ShellState): Plugin.Object {
  return {
    name: 'desktop-shell',
    apply(ctx: Context) {
      ctx.plugin(DesktopShell, state)
    },
  }
}
