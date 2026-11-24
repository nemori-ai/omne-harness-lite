import type { ReactNode } from 'react'
import {
  createToastStore,
  type AttachedLayout,
  type ScopeSource,
  type ShellLogin,
  type ToastBoard,
  type ToastStore,
} from '@omne-harness/shell-contract'
import { startShellOf, type Started } from '@omne-harness/shell-contract/testing'
import { ShellService } from '@omne-harness/shell-contract/cordis'

export class ReferenceShell extends ShellService {
  readonly navigated: string[] = []
  tenant: string | undefined = undefined
  readonly login: ShellLogin = {
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  private readonly scopeListeners = new Set<(scope: string | undefined) => void>()
  readonly scope: ScopeSource = {
    get: () => this.tenant,
    set: () => undefined,
    subscribe: listener => {
      this.scopeListeners.add(listener)
      return () => this.scopeListeners.delete(listener)
    },
  }
  /** Holds every toast until the test looks; nothing times out. */
  readonly toastStore: ToastStore = createToastStore({
    visible: 100,
    durationMs: 1000,
    schedule: () => () => undefined,
  })

  /** Changes the tenant and tells those who subscribed, as a shell does on sign-in and sign-out. */
  setTenant(tenant: string | undefined): void {
    this.tenant = tenant
    for (const listener of Array.from(this.scopeListeners)) listener(tenant)
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

  protected override toasts(): ToastBoard {
    return this.toastStore
  }
}

export const startShell = (): Promise<Started<ReferenceShell>> => startShellOf(ReferenceShell)

export const render = (): null => null
