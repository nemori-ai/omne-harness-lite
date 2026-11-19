import { Context, type Fiber } from '@deepseek-ai/cordis'
import { useEffect, useState, type ReactNode } from 'react'
import {
  createSlotStore,
  type AttachedLayout,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotName,
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
  tenant: string | undefined = undefined
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

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return <Arranged shell={this} anchor={anchor} subject={subject} layout={layout} />
  }

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
  }
}

function Arranged({
  shell,
  anchor,
  subject,
  layout,
}: {
  readonly shell: ReferenceShell
  readonly anchor: string
  readonly subject: string
  readonly layout: AttachedLayout
}): ReactNode {
  const [items, setItems] = useState(() => shell.items('attached'))
  useEffect(() => {
    setItems(shell.items('attached'))
    return shell.subscribe('attached', () => setItems(shell.items('attached')))
  }, [shell])
  return layout(
    items
      .filter(item => item.anchor === anchor)
      .map(item => ({
        id: item.id,
        label: item.label,
        node: item.render({ scope: shell.scope.get(), subject }),
      })),
  )
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
