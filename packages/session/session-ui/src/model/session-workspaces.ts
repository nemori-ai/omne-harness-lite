import type { TenantId } from '@omne-harness/public-contract'
import { SessionDriver, type SessionDriverDeps } from './session-driver.ts'

export type SessionLease = Readonly<{ driver: SessionDriver; release: () => void }>

type Held = { readonly driver: SessionDriver; users: number }

export class SessionWorkspaces {
  readonly #deps: Omit<SessionDriverDeps, 'tenant'>
  readonly #held = new Map<string, Held>()

  constructor(deps: Omit<SessionDriverDeps, 'tenant'>) {
    this.#deps = deps
  }

  acquire(scope: string, tenant: TenantId): SessionLease {
    const held = this.#held.get(scope) ?? this.#create(scope, tenant)
    held.users += 1
    let released = false
    return {
      driver: held.driver,
      release: () => {
        if (released) return
        released = true
        held.users -= 1
        if (held.users > 0) return
        this.#held.delete(scope)
        held.driver.dispose()
      },
    }
  }

  /** The driver held for a scope now, if some view holds it; it makes none. */
  peek(scope: string): SessionDriver | undefined {
    return this.#held.get(scope)?.driver
  }

  #create(scope: string, tenant: TenantId): Held {
    const driver = new SessionDriver({ ...this.#deps, tenant })
    driver.loadList()
    const held = { driver, users: 0 }
    this.#held.set(scope, held)
    return held
  }
}
