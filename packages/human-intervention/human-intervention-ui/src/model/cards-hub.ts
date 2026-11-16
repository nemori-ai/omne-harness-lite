import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { CardsDriver, type Schedule } from './cards-driver.ts'

export type CardsHubDeps = Readonly<{
  client: ClientOf<HumanInterventionProtocol>
  newId?: () => string
  schedule?: Schedule
}>

export class CardsHub {
  readonly #deps: CardsHubDeps
  readonly #drivers = new Map<string, CardsDriver>()

  constructor(deps: CardsHubDeps) {
    this.#deps = deps
  }

  driver(tenant: TenantId): CardsDriver {
    const key = encodeTenantText(tenant)
    const known = this.#drivers.get(key)
    if (known !== undefined) return known
    const created = new CardsDriver({ ...this.#deps, tenant })
    this.#drivers.set(key, created)
    return created
  }

  dispose(): void {
    for (const driver of this.#drivers.values()) driver.dispose()
  }
}
