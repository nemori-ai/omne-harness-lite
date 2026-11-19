import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import {
  createSlotStore,
  createToastStore,
  type AttachedLayout,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotName,
  type ToastBoard,
  type ToastStore,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'

export class ReferenceShell extends ShellService implements ShellSlots {
  readonly navigated: string[] = []
  readonly login: ShellLogin = {
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  readonly scope: ScopeSource = {
    get: () => undefined,
    set: () => undefined,
    subscribe: () => () => undefined,
  }
  private readonly store = createSlotStore()
  /** Two at a time; a toast stays until the test takes it down. */
  readonly toastStore: ToastStore = createToastStore({
    visible: 2,
    durationMs: 1000,
    schedule: () => () => undefined,
  })

  items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
    return this.store.items(slot)
  }

  subscribe(slot: SlotName, listener: () => void): () => void {
    return this.store.subscribe(slot, listener)
  }

  navigate(pageId: string): void {
    this.navigated.push(pageId)
  }

  attached(anchor: string, subject: string): ReactNode {
    return this.items('attached')
      .filter(item => item.anchor === anchor)
      .map(item => item.render({ scope: this.scope.get(), subject }))
  }

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return layout(
      this.items('attached')
        .filter(item => item.anchor === anchor)
        .map(item => ({
          id: item.id,
          label: item.label,
          node: item.render({ scope: this.scope.get(), subject }),
        })),
    )
  }

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
  }

  protected override toasts(): ToastBoard {
    return this.toastStore
  }
}

export async function startShell(): Promise<{
  root: Context
  shell: ReferenceShell
  host: Fiber
}> {
  const root = new Context()
  const host = root.plugin(ReferenceShell)
  await host
  return { root, shell: root.shell as unknown as ReferenceShell, host }
}

export const render = (): null => null
