import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createElement, type ReactNode } from 'react'
import type {
  AttachedLayout,
  ItemOf,
  ScopeSource,
  ShellLogin,
  ShellSlots,
  SlotName,
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

  navigate(pageId: string): void {
    this.state.page.choose(pageId)
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

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.state.slots.place(slot, item)
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
