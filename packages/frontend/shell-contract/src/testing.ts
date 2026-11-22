import { Context, type Fiber } from '@deepseek-ai/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { ReactNode } from 'react'
import { ShellService } from './cordis.ts'
import type { ScopeSource, ShellLogin } from './host.ts'
import type { AttachedLayout } from './slots.ts'

/** A shell for the cases of a view module: it holds what modules put and draws nothing itself. */
export class ReferenceShell extends ShellService {
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
}

export type Started<S extends ShellService> = Readonly<{ root: Context; shell: S; host: Fiber }>

/** A client tree with the registry and one shell on it, ready for modules. */
export async function startShellOf<S extends ShellService, C = undefined>(
  shell: new (ctx: Context, config: C) => S,
  config?: C,
): Promise<Started<S>> {
  const root = new Context()
  await root.plugin(DynamisService)
  const host = root.plugin(shell, config as C)
  await host
  return { root, shell: root.shell as unknown as S, host }
}

export const startShell = (): Promise<Started<ReferenceShell>> => startShellOf(ReferenceShell)

export const render = (): null => null
