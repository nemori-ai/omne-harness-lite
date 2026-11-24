import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint, AdoptionView } from '@omne-harness/mcp-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EndpointFacts, EndpointSettingRead } from './endpoints.ts'

type Asker = Parameters<AdoptionView<unknown, unknown>['endpoint']>[0]
type Answer = Outcome<AdoptedEndpoint | 'not-adopted', 'unknown'>
type Items = ReadonlyMap<string, EndpointSettingRead>

/** Moves whenever what the tenant adopted may have changed; undefined keeps nothing. */
export type AdoptionStamp = (tenant: TenantId, tenantRef: string) => string | undefined

/** The endpoints a tenant holds now: a cheap read, made at each call. */
export type HeldRefs = (tenant: TenantId) => Promise<Outcome<readonly EndpointRef[], 'unknown'>>

/** The settings of all the endpoints of a tenant in one read, by endpoint name; `unknown` when not read whole. */
export type TenantEndpointSettings = (
  tenant: TenantId,
) => Promise<ReadonlyMap<string, Items> | 'unknown'>

const KEPT_MAX = 512
const NO_ITEMS: Items = new Map()

type Kept<T> = Map<string, Readonly<{ stamp: string; value: T }>>

// What is kept for the tenant under its stamp now; undefined when the stamp cannot be told.
function keptFor<T>(
  kept: Kept<T>,
  stampOf: AdoptionStamp,
  tenant: TenantId,
  make: (key: string) => T,
): T | undefined {
  const tenantRef = tenantCodec.encode(tenant)
  const stamp = tenantRef.ok ? stampOf(tenant, tenantRef.value) : undefined
  if (!tenantRef.ok || stamp === undefined) return undefined
  const have = kept.get(tenantRef.value)
  if (have?.stamp === stamp) return have.value
  const value = make(tenantRef.value)
  kept.delete(tenantRef.value)
  kept.set(tenantRef.value, { stamp, value })
  if (kept.size > KEPT_MAX) kept.delete(kept.keys().next().value as string)
  return value
}

// Each endpoint's answer is kept until the tenant's stamp moves; one that could not be read is not.
export function keptAdoption(
  inner: AdoptionView<unknown, unknown>,
  held: HeldRefs,
  stampOf: AdoptionStamp,
): AdoptionView<unknown, unknown> {
  const kept: Kept<Map<string, Promise<Answer>>> = new Map()

  async function endpoint(asker: Asker, ref: EndpointRef): Promise<Answer> {
    const reads = keptFor(kept, stampOf, asker.tenant, () => new Map())
    if (reads === undefined) return inner.endpoint(asker, ref)
    const key = `${ref.name}\n${ref.holding}`
    const have = reads.get(key)
    if (have !== undefined) return have
    const reading = inner.endpoint(asker, ref)
    reads.set(key, reading)
    const answer = await reading
    if ('failure' in answer && reads.get(key) === reading) reads.delete(key)
    return answer
  }

  async function endpoints(asker: Asker): Promise<Outcome<readonly AdoptedEndpoint[], 'unknown'>> {
    const refs = await held(asker.tenant)
    if ('failure' in refs) return refs
    const answers = await Promise.all(refs.ok.map(ref => endpoint(asker, ref)))
    const adopted: AdoptedEndpoint[] = []
    for (const answer of answers) {
      if ('failure' in answer) return fail('unknown')
      if (answer.ok !== 'not-adopted') adopted.push(answer.ok)
    }
    return succeed(adopted)
  }

  return { endpoint, endpoints }
}

// One read of a tenant serves every endpoint of it until the stamp moves; one that could not be made is not kept.
export function keptSettings(
  read: TenantEndpointSettings,
  stampOf: AdoptionStamp,
): EndpointFacts['settings'] {
  const kept: Kept<Promise<ReadonlyMap<string, Items> | 'unknown'>> = new Map()
  const reading = (tenant: TenantId) => read(tenant).catch(() => 'unknown' as const)

  return async (tenant, endpoint) => {
    const made = keptFor(kept, stampOf, tenant, key => {
      const value = reading(tenant)
      void value.then(answer => {
        if (answer === 'unknown' && kept.get(key)?.value === value) kept.delete(key)
      })
      return value
    })
    const all = await (made ?? reading(tenant))
    return all === 'unknown' ? 'unknown' : (all.get(endpoint) ?? NO_ITEMS)
  }
}
