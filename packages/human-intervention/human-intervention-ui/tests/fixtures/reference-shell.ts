import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import {
  createSlotStore,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotName,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'

export class ReferenceShell extends ShellService implements ShellSlots {
  readonly navigated: string[] = []
  tenant: string | undefined = undefined
  readonly login: ShellLogin = {
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  readonly scope: ScopeSource = {
    get: () => this.tenant,
    set: () => undefined,
    subscribe: () => () => undefined,
  }
  private readonly store = createSlotStore()

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

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
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
