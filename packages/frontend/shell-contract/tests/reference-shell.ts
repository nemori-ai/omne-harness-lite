import { Context, type Fiber } from '@deepseek-ai/cordis'
import {
  ShellAssemblyError,
  slots,
  type ItemOf,
  type ScopeSource,
  type ShellSlots,
  type SlotName,
} from '@omne-harness/shell-contract'
import { ShellService, type ShellLogin } from '@omne-harness/shell-contract/cordis'

type Held = { id: string; order?: number }

const byOrderThenId = (a: Held, b: Held): number =>
  (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

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
  private readonly held: Record<SlotName, Held[]> = { gate: [], pages: [], sidebar: [] }
  private readonly listeners = new Set<{ slot: SlotName; listener: () => void }>()

  items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
    return [...this.held[slot]].sort(byOrderThenId) as unknown as ItemOf<K>[]
  }

  subscribe(slot: SlotName, listener: () => void): () => void {
    const entry = { slot, listener }
    this.listeners.add(entry)
    return () => {
      this.listeners.delete(entry)
    }
  }

  navigate(pageId: string): void {
    this.navigated.push(pageId)
  }

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    const list = this.held[slot]
    if (slots[slot].kind === 'one' && list.length > 0)
      throw new ShellAssemblyError(slot, item.id, 'occupied')
    if (list.some(held => held.id === item.id))
      throw new ShellAssemblyError(slot, item.id, 'duplicate')
    list.push(item)
    this.changed(slot)
    return () => {
      list.splice(list.indexOf(item), 1)
      this.changed(slot)
    }
  }

  private changed(slot: SlotName): void {
    for (const entry of this.listeners) if (entry.slot === slot) entry.listener()
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
