import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import {
  createFigureStore,
  createToastStore,
  definePoint,
  type AttachedLayout,
  type FigureBoard,
  type FigureStore,
  type ScopeSource,
  type ShellLogin,
  type ToastBoard,
  type ToastStore,
} from '@omne-harness/shell-contract'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { ShellService } from '@omne-harness/shell-contract/cordis'

export class ReferenceShell extends ShellService {
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
  /** Two at a time; a toast stays until the test takes it down. */
  readonly toastStore: ToastStore = createToastStore({
    visible: 2,
    durationMs: 1000,
    schedule: () => () => undefined,
  })
  readonly figureStore: FigureStore = createFigureStore()

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

  protected override toasts(): ToastBoard {
    return this.toastStore
  }

  protected override figures(): FigureBoard {
    return this.figureStore
  }
}

const text = { encode: (value: string) => value, decode: (value: string) => value }

/** The points the cases of this member attach to: a place counts only while it is declared. */
export const TEST_POINTS = ['test.a', 'test.b', 'test.chat', 'test.other', 'test.x']

export async function startShell(points: readonly string[] = TEST_POINTS): Promise<{
  root: Context
  shell: ReferenceShell
  host: Fiber
}> {
  const root = new Context()
  await root.plugin(DynamisService)
  const host = root.plugin(ReferenceShell)
  await host
  for (const name of points) definePoint({ name, subject: text }).declare(root.shell)
  return { root, shell: root.shell as unknown as ReferenceShell, host }
}

export const render = (): null => null
