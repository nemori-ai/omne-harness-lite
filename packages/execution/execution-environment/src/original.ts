import type {
  AcquisitionSettlement,
  EnvironmentProvider,
  OriginalAcquisition,
  ProviderAcquisitionStatus,
  ProviderIdentity,
} from '@omne-harness/execution-environment-contract'

/** One route to the original record of a quota domain: a provider registration of that domain. */
export type DomainRoute = Readonly<{
  provider: EnvironmentProvider
  identity: ProviderIdentity
}>

/**
 * Picks the route for an original acquisition: the original generation when it is still in the
 * table, otherwise another registration of the same quota domain. Never another domain, and never
 * the current provider of the same name in another domain.
 */
export function routeFor(
  routes: readonly DomainRoute[],
  original: OriginalAcquisition,
): DomainRoute | undefined {
  const domain = original.placement.quotaDomain
  const sameDomain = routes.filter(route => route.provider.quotaDomain === domain)
  const wanted = original.placement.provider
  return (
    sameDomain.find(
      route =>
        route.identity.name === wanted.name &&
        route.identity.generation === wanted.generation &&
        route.identity.version === wanted.version,
    ) ?? sameDomain[0]
  )
}

/** One route per quota domain, so no registration claims a complete view on its own. */
export function routesByDomain(routes: readonly DomainRoute[]): readonly DomainRoute[] {
  const seen = new Map<string, DomainRoute>()
  for (const route of routes)
    if (!seen.has(route.provider.quotaDomain)) seen.set(route.provider.quotaDomain, route)
  return [...seen.values()]
}

const statusKinds = new Set([
  'acquired',
  'pending',
  'notAllocated',
  'settled',
  'conflict',
  'unavailable',
  'unknown',
])
const settlementKinds = new Set([
  'settled',
  'notAllocated',
  'pending',
  'unsupported',
  'conflict',
  'unavailable',
  'unknown',
])

function hasKind(value: unknown, kinds: ReadonlySet<string>): value is { kind: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof value.kind === 'string' &&
    kinds.has(value.kind)
  )
}

/** Asks the original record. A throw or an answer outside the closed set reads as `unknown`. */
export async function queryOriginal(
  route: DomainRoute,
  original: OriginalAcquisition,
): Promise<ProviderAcquisitionStatus> {
  try {
    const answer = await route.provider.inspectAcquisition(original)
    return hasKind(answer, statusKinds) ? answer : { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}

/** Settles an original acquisition. A throw or an illegal answer reads as `unknown`. */
export async function settleOriginal(
  route: DomainRoute,
  original: OriginalAcquisition,
): Promise<AcquisitionSettlement> {
  try {
    const answer = await route.provider.settleAcquisition(original)
    return hasKind(answer, settlementKinds) ? answer : { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}
