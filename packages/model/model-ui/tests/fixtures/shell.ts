import { Context } from '@deepseek-ai/cordis'
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

/** The least shell a UI module loads under: it keeps what is placed, and draws nothing. */
export class TestShell extends ShellService implements ShellSlots {
  readonly login: ShellLogin = {
    state: () => 'signed-in',
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

  items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
    return this.store.items(slot)
  }

  subscribe(slot: SlotName, listener: () => void): () => void {
    return this.store.subscribe(slot, listener)
  }

  navigate(): void {}

  attached(): ReactNode {
    return null
  }

  arranged(): ReactNode {
    return null
  }

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
  }
}

export async function startShell(): Promise<{ root: Context; shell: TestShell }> {
  const root = new Context()
  await root.plugin(TestShell)
  return { root, shell: root.shell as unknown as TestShell }
}
