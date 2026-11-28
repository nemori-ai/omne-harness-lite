import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type { GrantKey, HoldingRows } from '@omne-harness/mcp-contract/provider'
import type { Ack, Outcome } from '@omne-harness/operation-result'

export type Held = (tenant: TenantId) => Promise<Outcome<readonly EndpointRef[], 'unknown'>>

type Disconnect = (key: GrantKey) => Promise<Ack<'unavailable'>>

// The rows are read before what is held: a holding is never held again once removed, so one with rows that is not held now is gone.
async function sweep(
  tenant: TenantId,
  held: Held,
  rows: HoldingRows,
  disconnect: Disconnect,
): Promise<boolean> {
  const kept = await rows.kept(tenant)
  if ('failure' in kept) return false
  if (kept.ok.length === 0) return true
  const now = await held(tenant)
  if ('failure' in now) return false
  const holdings = new Set<string>(now.ok.map(ref => ref.holding))
  const names = new Set<string>(now.ok.map(ref => ref.name))
  let whole = true
  for (const gone of kept.ok.filter(item => !holdings.has(item.holding))) {
    const ended = await Promise.all(
      gone.grants
        .filter(name => !names.has(name))
        .map(endpoint => disconnect({ tenant, holding: gone.holding, endpoint })),
    )
    if (
      ended.some(end => 'failure' in end) ||
      'failure' in (await rows.forget(tenant, gone.holding))
    )
      whole = false
  }
  return whole
}

/** A removed holding loses its rows and its OAuth grant: swept on the first read of a tenant in this process and whenever what it holds changes; the secrets stay when another holding now holds the endpoint name. */
export function sweepingRemoved(
  held: Held,
  rows: () => HoldingRows | undefined,
  disconnect: Disconnect,
): Held {
  const swept = new Map<string, string>()
  const running = new Set<string>()
  return async tenant => {
    const refs = await held(tenant)
    if ('failure' in refs) return refs
    const text = JSON.stringify(tenant)
    const holdings = refs.ok
      .map(ref => ref.holding)
      .sort()
      .join('\n')
    const store = rows()
    if (store === undefined || running.has(text) || swept.get(text) === holdings) return refs
    running.add(text)
    void sweep(tenant, held, store, disconnect)
      .then(
        whole => {
          if (whole) swept.set(text, holdings)
        },
        () => undefined,
      )
      .finally(() => running.delete(text))
    return refs
  }
}
