import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  EnvironmentProvider,
  ManagedResource,
  OwnedRecovery,
  ProviderIdentity,
  RecoveryListing,
  ResourceRecovery,
  UnsupportedRecovery,
} from '@omne-harness/execution-environment-contract'

export type RecoverableProvider = Readonly<{
  provider: EnvironmentProvider
  identity: ProviderIdentity
}>

async function list(provider: EnvironmentProvider, scope: ScopeRef): Promise<RecoveryListing> {
  if (provider.listRecoveryResources === undefined) return { kind: 'unavailable' }
  try {
    return await provider.listRecoveryResources(scope)
  } catch {
    return { kind: 'unavailable' }
  }
}

async function recoverOne(
  provider: EnvironmentProvider,
  resource: ManagedResource,
): Promise<ResourceRecovery> {
  if (provider.recover === undefined) return { status: 'unsupported', evidence: null }
  try {
    return await provider.recover(resource)
  } catch {
    return { status: 'pending', evidence: null }
  }
}

/**
 * Drives recovery provider by provider. A provider without the two recovery operations is reported
 * as unsupported; a failed enumeration is reported as unavailable, never as an empty list; a failed
 * stop stays pending. Groups already handled are kept whatever happens to later groups.
 */
export async function driveRecovery(
  scope: ScopeRef,
  providers: readonly RecoverableProvider[],
): Promise<OwnedRecovery> {
  const stopped: ManagedResource[] = []
  const pending: ManagedResource[] = []
  const unsupported: UnsupportedRecovery[] = []
  const unavailable: ProviderIdentity[] = []
  for (const { provider, identity } of providers) {
    if (provider.listRecoveryResources === undefined || provider.recover === undefined) {
      unsupported.push({ kind: 'provider', provider: identity })
      continue
    }
    const listing = await list(provider, scope)
    if (listing.kind === 'unavailable') {
      unavailable.push(identity)
      continue
    }
    for (const resource of listing.resources) {
      const recovered = await recoverOne(provider, resource)
      switch (recovered.status) {
        case 'confirmedStopped':
          stopped.push(resource)
          break
        case 'pending':
          pending.push(resource)
          break
        case 'unsupported':
          unsupported.push({ kind: 'resource', resource })
          break
        default: {
          const exhaustive: never = recovered.status
          return exhaustive
        }
      }
    }
  }
  return Object.freeze({ kind: 'recovered', scope, stopped, pending, unsupported, unavailable })
}
