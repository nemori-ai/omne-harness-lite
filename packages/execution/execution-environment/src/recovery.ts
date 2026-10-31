import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  AcquisitionListing,
  AcquisitionSettlement,
  EnvironmentProvider,
  ManagedResource,
  OriginalAcquisition,
  OwnedRecovery,
  ProviderIdentity,
  RecoveryListing,
  ResourceRecovery,
  UnsupportedRecovery,
} from '@omne-harness/execution-environment-contract'
import { fingerprint, tenantText } from './compare.ts'
import { routeFor, routesByDomain, settleOriginal, type DomainRoute } from './original.ts'

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

type ResourceGroups = Pick<OwnedRecovery, 'stopped' | 'pending' | 'unsupported'> & {
  unavailable: ProviderIdentity[]
}

/** The resource path: list and stop the scope's managed resources, provider by provider. */
async function driveResources(
  scope: ScopeRef,
  providers: readonly RecoverableProvider[],
): Promise<ResourceGroups> {
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
  return { stopped, pending, unsupported, unavailable }
}

async function listAcquisitions(route: DomainRoute, scope: ScopeRef): Promise<AcquisitionListing> {
  try {
    const listing = await route.provider.listAcquisitions(scope)
    return listing?.kind === 'listed' && Array.isArray(listing.acquisitions)
      ? listing
      : { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}

function originalKey(original: OriginalAcquisition): string {
  return JSON.stringify([
    original.placement.quotaDomain,
    tenantText(original.tenant) ?? null,
    original.acquisition,
  ])
}

type Item<K extends keyof OwnedRecovery> = OwnedRecovery[K] extends readonly (infer T)[] ? T : never
type AcquisitionGroups = {
  settledAcquisitions: Item<'settledAcquisitions'>[]
  pendingAcquisitions: Item<'pendingAcquisitions'>[]
  unsupportedAcquisitions: Item<'unsupportedAcquisitions'>[]
  unavailable: ProviderIdentity[]
}

/** Called after each settlement, so the registry can update its local copy of the acquisition. */
export type SettlementObserver = (
  original: OriginalAcquisition,
  answer: AcquisitionSettlement,
) => void

/**
 * The acquisition path: list the scope's acquisitions once per quota domain, add the known
 * descriptions, and settle each. A failed listing or an unreachable domain goes to the unavailable
 * group, never to an empty success.
 */
async function driveAcquisitions(
  scope: ScopeRef,
  routes: readonly DomainRoute[],
  known: readonly OriginalAcquisition[],
  observe: SettlementObserver,
): Promise<AcquisitionGroups> {
  const groups: AcquisitionGroups = {
    settledAcquisitions: [],
    pendingAcquisitions: [],
    unsupportedAcquisitions: [],
    unavailable: [],
  }
  const originals = new Map<string, OriginalAcquisition>()
  for (const route of routesByDomain(routes)) {
    const listing = await listAcquisitions(route, scope)
    if (listing.kind !== 'listed') {
      groups.unavailable.push(route.identity)
      continue
    }
    for (const original of listing.acquisitions) originals.set(originalKey(original), original)
  }
  for (const original of known)
    if (!originals.has(originalKey(original))) originals.set(originalKey(original), original)
  for (const original of originals.values()) {
    const route = routeFor(routes, original)
    if (route === undefined) {
      groups.unavailable.push(original.placement.provider)
      continue
    }
    const answer = await settleOriginal(route, original)
    observe(original, answer)
    file(groups, original, route, answer)
  }
  return groups
}

function file(
  groups: AcquisitionGroups,
  original: OriginalAcquisition,
  route: DomainRoute,
  answer: AcquisitionSettlement,
): void {
  switch (answer.kind) {
    case 'settled':
    case 'notAllocated':
      groups.settledAcquisitions.push({ original, outcome: answer.kind })
      return
    case 'pending':
      groups.pendingAcquisitions.push({
        original,
        reason: 'pending',
        resources: Array.isArray(answer.resources) ? answer.resources : [],
      })
      return
    case 'unsupported':
      groups.unsupportedAcquisitions.push(original)
      return
    case 'unavailable':
      groups.unavailable.push(route.identity)
      return
    case 'conflict':
    case 'unknown':
      groups.pendingAcquisitions.push({ original, reason: 'unknown', resources: [] })
      return
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

function sameIdentity(left: ProviderIdentity, right: ProviderIdentity): boolean {
  return (
    left.name === right.name &&
    left.generation === right.generation &&
    left.version === right.version
  )
}

/**
 * Drives recovery over both paths. A provider without the two resource recovery operations is
 * unsupported; a failed enumeration is unavailable, never an empty list; a failed stop stays
 * pending. Groups already handled are kept whatever happens to later groups.
 */
export async function driveRecovery(
  scope: ScopeRef,
  providers: readonly RecoverableProvider[],
  known: readonly OriginalAcquisition[] = [],
  observe: SettlementObserver = () => undefined,
): Promise<OwnedRecovery> {
  const resources = await driveResources(scope, providers)
  const acquisitions = await driveAcquisitions(scope, providers, known, observe)
  const unavailable: ProviderIdentity[] = []
  for (const identity of [...resources.unavailable, ...acquisitions.unavailable])
    if (!unavailable.some(seen => sameIdentity(seen, identity))) unavailable.push(identity)
  return Object.freeze({
    kind: 'recovered',
    scope,
    stopped: resources.stopped,
    pending: resources.pending,
    unsupported: resources.unsupported,
    unavailable,
    settledAcquisitions: acquisitions.settledAcquisitions,
    pendingAcquisitions: acquisitions.pendingAcquisitions,
    unsupportedAcquisitions: acquisitions.unsupportedAcquisitions,
  })
}

/** True when a local record and a settled original name the same acquisition and fingerprint. */
export function sameOriginal(left: OriginalAcquisition, right: OriginalAcquisition): boolean {
  return originalKey(left) === originalKey(right) && fingerprint(left) === fingerprint(right)
}
