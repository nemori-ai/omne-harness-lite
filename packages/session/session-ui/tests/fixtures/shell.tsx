import './dom.ts'
import { Context } from '@deepseek-ai/cordis'
import { act, render } from '@testing-library/react'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import {
  createSlotStore,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotName,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { Fragment, StrictMode, useEffect, useState, type ReactNode } from 'react'
import { sessionClientService, sessionUiModule } from '../../src/cordis.ts'

export class TestShell extends ShellService implements ShellSlots {
  readonly navigated: string[] = []
  readonly login: ShellLogin = {
    state: () => 'signed-in',
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
      .map(item => (
        <Fragment key={item.id}>{item.render({ scope: this.scope.get(), subject })}</Fragment>
      ))
  }

  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
  }
}

function useSlot<K extends 'sidebar' | 'pages'>(shell: TestShell, slot: K): readonly ItemOf<K>[] {
  const [items, setItems] = useState(() => shell.items(slot))
  useEffect(() => {
    setItems(shell.items(slot))
    return shell.subscribe(slot, () => setItems(shell.items(slot)))
  }, [shell, slot])
  return items
}

export function ShellView({
  shell,
  scope,
}: {
  readonly shell: TestShell
  readonly scope: string | undefined
}) {
  const sidebar = useSlot(shell, 'sidebar')
  const pages = useSlot(shell, 'pages')
  return (
    <div>
      <aside>
        {sidebar.map(item => (
          <div key={item.id}>{item.render({ scope })}</div>
        ))}
      </aside>
      <main>
        {pages.map(item => (
          <section key={item.id} aria-label={item.title}>
            {item.render({ scope })}
          </section>
        ))}
      </main>
    </div>
  )
}

export async function startShell(): Promise<{ root: Context; shell: TestShell }> {
  const root = new Context()
  await root.plugin(TestShell)
  return { root, shell: root.shell as unknown as TestShell }
}

export async function mountModule(
  client: ClientOf<SessionProtocol>,
  scope: string | undefined,
  options: { readonly strict?: boolean } = {},
) {
  const { root, shell } = await startShell()
  const withdraw = root.reflect.provide(sessionClientService, client)
  await root.plugin(sessionUiModule)
  shell.tenant = scope
  const tree = (next: string | undefined) =>
    options.strict === true ? (
      <StrictMode>
        <ShellView shell={shell} scope={next} />
      </StrictMode>
    ) : (
      <ShellView shell={shell} scope={next} />
    )
  const view = render(tree(scope))
  return {
    root,
    shell,
    withdraw: async () => {
      await act(async () => {
        await withdraw()
      })
    },
    rerender: (next: string | undefined) => {
      shell.tenant = next
      view.rerender(tree(next))
    },
  }
}
