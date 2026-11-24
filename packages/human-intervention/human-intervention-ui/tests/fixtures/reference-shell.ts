import type { ReactNode } from 'react'
import {
  type AttachedLayout,
  type FigureBoard,
  type FigureReport,
  type ScopeSource,
  type ShellLogin,
} from '@omne-harness/shell-contract'
import { startShellOf, type Started } from '@omne-harness/shell-contract/testing'
import { ShellService } from '@omne-harness/shell-contract/cordis'

export class ReferenceShell extends ShellService {
  readonly navigated: string[] = []
  tenant: string | undefined = undefined
  /** Every report handed to the figure port, in order. */
  readonly reports: FigureReport[] = []
  private readonly scopeListeners = new Set<(scope: string | undefined) => void>()
  readonly login: ShellLogin = {
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  readonly scope: ScopeSource = {
    get: () => this.tenant,
    set: () => undefined,
    subscribe: listener => {
      this.scopeListeners.add(listener)
      return () => void this.scopeListeners.delete(listener)
    },
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

  protected override figures(): FigureBoard {
    return { report: (_owner, report) => void this.reports.push(report), withdraw: () => undefined }
  }

  /** The tenant the shell holds changes, as identity sets it or a sign-out clears it. */
  setTenant(next: string | undefined): void {
    this.tenant = next
    for (const listener of Array.from(this.scopeListeners)) listener(next)
  }
}

export const startShell = (): Promise<Started<ReferenceShell>> => startShellOf(ReferenceShell)

export const render = (): null => null
