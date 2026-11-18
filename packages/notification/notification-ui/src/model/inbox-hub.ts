import type { NotificationProtocol } from '@omne-harness/notification-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { InboxDriver, type Schedule } from './inbox-driver.ts'

export type InboxHubDeps = Readonly<{
  client: ClientOf<NotificationProtocol>
  schedule?: Schedule
}>

/** One driver per tenant, shared by the page and the count beside its title. */
export class InboxHub {
  readonly #deps: InboxHubDeps
  readonly #drivers = new Map<string, InboxDriver>()

  constructor(deps: InboxHubDeps) {
    this.#deps = deps
  }

  driver(tenant: TenantId): InboxDriver {
    const key = encodeTenantText(tenant)
    const known = this.#drivers.get(key)
    if (known !== undefined) return known
    const created = new InboxDriver({ ...this.#deps, tenant })
    this.#drivers.set(key, created)
    return created
  }

  dispose(): void {
    for (const driver of this.#drivers.values()) driver.dispose()
    this.#drivers.clear()
  }
}
