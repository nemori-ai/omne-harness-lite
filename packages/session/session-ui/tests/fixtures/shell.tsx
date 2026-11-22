import './dom.ts'
import { act, render } from '@testing-library/react'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import {
  type AttachedLayout,
  type FigureBoard,
  type FigureReport,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type SlotName,
} from '@omne-harness/shell-contract'
import { startShellOf, type Started } from '@omne-harness/shell-contract/testing'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { Fragment, StrictMode, useEffect, useState, type ReactNode } from 'react'
import { sessionClientService, sessionUiModule } from '../../src/cordis.ts'

export class TestShell extends ShellService {
  readonly navigated: string[] = []
  /** Every report handed to the figure port, in order. */
  readonly reports: FigureReport[] = []
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
  /** The page put in front last; before any, the first page, as the desktop shell does. */
  private chosen: string | undefined = undefined
  private readonly pageListeners = new Set<(page: string | undefined) => void>()

  navigate(pageId: string): void {
    this.navigated.push(pageId)
    this.chosen = pageId
    for (const listener of this.pageListeners) listener(pageId)
  }

  override get page(): ShellService['page'] {
    return {
      get: () => this.chosen ?? this.items('pages')[0]?.id,
      subscribe: listener => {
        this.pageListeners.add(listener)
        return () => this.pageListeners.delete(listener)
      },
    }
  }

  attached(anchor: string, subject: string): ReactNode {
    return this.items('attached')
      .filter(item => item.anchor === anchor)
      .map(item => (
        <Fragment key={item.id}>{item.render({ scope: this.scope.get(), subject })}</Fragment>
      ))
  }

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return <Arranged shell={this} anchor={anchor} subject={subject} layout={layout} />
  }

  protected override figures(): FigureBoard {
    return { report: (_owner, report) => void this.reports.push(report), withdraw: () => undefined }
  }
}

function Arranged({
  shell,
  anchor,
  subject,
  layout,
}: {
  readonly shell: TestShell
  readonly anchor: string
  readonly subject: string
  readonly layout: AttachedLayout
}) {
  const items = useSlot(shell, 'attached').filter(item => item.anchor === anchor)
  return (
    <>
      {layout(
        items.map(item => ({
          id: item.id,
          label: item.label,
          node: item.render({ scope: shell.scope.get(), subject }),
        })),
      )}
    </>
  )
}

function useSlot<K extends SlotName>(shell: TestShell, slot: K): readonly ItemOf<K>[] {
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

export const startShell = (): Promise<Started<TestShell>> => startShellOf(TestShell)

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
