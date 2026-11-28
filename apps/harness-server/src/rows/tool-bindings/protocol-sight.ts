import { ask, list, type Registry, type Scope } from '@omne-harness/dynamis'
import type { ProtocolRules, ProtocolShown } from '@omne-harness/plugin-tools'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { contractRules } from '@omne-harness/public-contract/snapshot'

const PROTOCOLS = 'access.protocols'

type Held = Readonly<{ contribution: Readonly<{ contract: ProtocolContract }>; revision: number }>

/** A protocol as the asker can call it: the official ones and those of its own tenant; another tenant's is not there. */
export function protocolOf(
  registry: Registry | undefined,
  name: string,
  major: number,
  asker: Scope,
): ProtocolShown | 'not-found' | 'unavailable' {
  if (registry === undefined) return 'unavailable'
  const answer = ask<Held>(registry, PROTOCOLS, `${name}/v${String(major)}`, asker)
  if (answer.kind === 'none') return 'not-found'
  if (answer.kind !== 'one') return 'unavailable'
  const { item, scope } = answer.entry
  return {
    name,
    major,
    revision: item.revision,
    held: scope.length === 0 ? 'deployment' : 'tenant',
    rules: contractRules(item.contribution.contract) as ProtocolRules,
  }
}

/** The keys of the protocols the asker can call now. */
export function protocolKeys(
  registry: Registry | undefined,
  asker: Scope,
): readonly string[] | 'unavailable' {
  if (registry === undefined) return 'unavailable'
  const listing = list(registry, PROTOCOLS, null, asker)
  if (listing.kind !== 'read') return 'unavailable'
  return [...new Set(listing.items.map(each => each.entry.key))].sort()
}
