import type { CliCatalog } from './catalog.ts'
import type { CenterProfile } from './center-preparation.ts'
import type { Diagnostic } from './diagnostic.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import type { SessionIdentityObservation } from './session-preparation.ts'
import type { TenantBinding } from './state-layout.ts'
import { usingSelectedTenant, type SelectedTenantPorts } from './selected-tenant-work.ts'
import { readNewSessionIdentity } from './session-preparation.ts'
import { usingGovernanceUse } from './governance-use-work.ts'

export type SessionEntryPreparation =
  | { readonly kind: 'center-required' }
  | {
      readonly kind: 'login-required'
      readonly centers: readonly CenterProfile[]
      readonly reason: 'not-selected' | 'not-logged-in' | 'login-rejected'
    }
  | {
      readonly kind: 'ready'
      readonly binding: TenantBinding
      readonly identity: SessionIdentityObservation
    }
  | { readonly kind: 'blocked'; readonly reason: string }

export async function readSessionEntryPreparation(options: {
  readonly home: string
  readonly catalog: CliCatalog
  readonly signal: AbortSignal
  readonly preparedFactory?: PreparedFactory
}): Promise<{ outcome: SessionEntryPreparation; diagnostics: readonly Diagnostic[] }> {
  const { home, catalog, signal, preparedFactory } = options
  if (signal.aborted)
    return { outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] }
  const centers = await catalog.listCenters()
  if (centers.length === 0) return { outcome: { kind: 'center-required' }, diagnostics: [] }
  const result = await usingSelectedTenant<SessionEntryPreparation>(
    home,
    catalog,
    signal,
    async ports => {
      const binding = ports.selection.selected
      if (!centers.some(profile => profile.center.centerId === binding.centerId))
        return { kind: 'blocked', reason: 'identity-mismatch' }
      return observeSelectedSession(ports)
    },
    preparedFactory,
  )
  const outcome = result.outcome
  if (
    outcome.kind === 'blocked' &&
    (outcome.reason === 'not-selected' ||
      outcome.reason === 'not-logged-in' ||
      outcome.reason === 'login-rejected')
  )
    return {
      ...result,
      outcome: { kind: 'login-required', centers, reason: outcome.reason },
    }
  return { ...result, outcome }
}

async function observeSelectedSession(
  ports: SelectedTenantPorts,
): Promise<SessionEntryPreparation> {
  const binding = ports.selection.selected
  const opened = await ports.client.openUse()
  if (opened.kind !== 'use') return { kind: 'blocked', reason: opened.reason }
  return usingGovernanceUse(opened.use, async use => {
    const observed = await readNewSessionIdentity(use)
    if (observed.kind !== 'observed') return observed
    const identity = observed.identity
    if (
      identity.centerId !== binding.centerId ||
      identity.tenant.account !== binding.tenant.account ||
      identity.tenant.organization !== binding.tenant.organization
    )
      return { kind: 'blocked', reason: 'identity-mismatch' }
    return { kind: 'ready', binding, identity }
  })
}
