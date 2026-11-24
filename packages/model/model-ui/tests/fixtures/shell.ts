import type { ReactNode } from 'react'
import { type ScopeSource, type ShellLogin } from '@omne-harness/shell-contract'
import { startShellOf, type Started } from '@omne-harness/shell-contract/testing'
import { ShellService } from '@omne-harness/shell-contract/cordis'

/** The least shell a UI module loads under: it keeps what is placed, and draws nothing. */
export class TestShell extends ShellService {
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

  navigate(): void {}

  attached(): ReactNode {
    return null
  }

  arranged(): ReactNode {
    return null
  }
}

export const startShell = (): Promise<Started<TestShell>> => startShellOf(TestShell)
