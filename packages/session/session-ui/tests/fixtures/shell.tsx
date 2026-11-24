import type { ComposerAssistant } from '../../src/model/composer-assistant.ts'
import './dom.ts'
import { act, render } from '@testing-library/react'
import type { ClientOf } from '@omne-harness/sdk/core'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import {
  FLOAT_GRIP_ATTRIBUTE,
  type AttachedLayout,
  type FigureBoard,
  type FigureReport,
  type FloatProps,
  type ItemOf,
  serviceKey,
  type ScopeSource,
  type ServiceKey,
  type ShellLogin,
  type SlotName,
} from '@omne-harness/shell-contract'
import { serveProtocol, startShellOf, type Started } from '@omne-harness/shell-contract/testing'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { Fragment, StrictMode, useEffect, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import {
  createSessionUiModule,
  type ModelChoiceSource,
  type WorkspaceChoiceSource,
} from '../../src/cordis.ts'
import type { BlockReadsSource } from '../../src/model/block-reads.ts'

/** The keys a case provides under: the session module is mounted taking what is on them. */
export const TAKEN = {
  modelChoices: serviceKey<ModelChoiceSource>('test.model-choices'),
  workspaceChoices: serviceKey<WorkspaceChoiceSource>('test.workspace-choices'),
  blockReads: serviceKey<BlockReadsSource>('test.block-reads'),
  composerAssistant: serviceKey<ComposerAssistant>('test.composer-assistant'),
}

/** Provides under a key as another module does; what `attach` returns takes it back. */
export function providerOf<T extends object>(root: Context, key: ServiceKey<T>) {
  return {
    attach(source: T): () => void {
      const fiber = root.plugin({
        name: `provides:${key}`,
        inject: ['shell'],
        apply: (ctx: Context) => ctx.shell.offer(key, source),
      })
      return () => void fiber.dispose()
    },
  }
}

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

/** What the shell tells a floating item besides the tenant; a case changes it to drag the item. */
export type Floating = Readonly<Pick<FloatProps, 'corner' | 'dragging'>>
const RESTING: Floating = { corner: { x: 'end', y: 'end' }, dragging: false }
const GRIP = { [FLOAT_GRIP_ATTRIBUTE]: '' } as const

export function ShellView({
  shell,
  scope,
  floating = RESTING,
}: {
  readonly shell: TestShell
  readonly scope: string | undefined
  readonly floating?: Floating
}) {
  const sidebar = useSlot(shell, 'sidebar')
  const pages = useSlot(shell, 'pages')
  const float = useSlot(shell, 'float')
  return (
    <div>
      <div data-float-layer="">
        {float.map(item => (
          <div key={item.id} data-float={item.id}>
            {item.render({ scope, grip: GRIP, ...floating })}
          </div>
        ))}
      </div>
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
  const served = await serveProtocol(root, sessionProtocol, client)
  await root.plugin(createSessionUiModule(TAKEN))
  shell.tenant = scope
  const tree = (next: string | undefined, floating?: Floating) => {
    const view = <ShellView shell={shell} scope={next} {...(floating ? { floating } : {})} />
    return options.strict === true ? <StrictMode>{view}</StrictMode> : view
  }
  const view = render(tree(scope))
  return {
    root,
    shell,
    withdraw: async () => {
      await act(async () => {
        await served.dispose()
      })
    },
    rerender: (next: string | undefined, floating?: Floating) => {
      shell.tenant = next
      view.rerender(tree(next, floating))
    },
  }
}
