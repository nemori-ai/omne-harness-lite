import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type {
  EnvironmentDescription,
  EnvironmentReference,
  EnvironmentRequirement,
  ManagedResource,
} from '@omne-harness-lite/execution-environments'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
const object = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
function data(value: unknown, keys: readonly string[]): JsonObject | undefined {
  const copy = copyJsonValue(value)
  return 'ok' in copy && object(copy.ok) && Object.keys(copy.ok).every(key => keys.includes(key))
    ? copy.ok
    : undefined
}
export function ownScope(value: unknown): SessionScope | undefined {
  const copy = data(value, ['tenant', 'session'])
  if (!copy) return undefined
  const tenant = parseTenantId(copy.tenant),
    session = parseOpaqueIdentifier(copy.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session
    ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
    : undefined
}
export function ownReference(value: unknown): EnvironmentReference | undefined {
  const copy = data(value, ['provider', 'reference'])
  return copy && typeof copy.provider === 'string' && copy.provider && copy.reference !== undefined
    ? Object.freeze({ provider: copy.provider, reference: copy.reference })
    : undefined
}
export function ownRequirement(value: unknown): EnvironmentRequirement | undefined {
  const copy = data(value, ['bindingLayer', 'facilities'])
  if (
    !copy ||
    !Array.isArray(copy.facilities) ||
    new Set(copy.facilities).size !== copy.facilities.length
  )
    return undefined
  const facilities: string[] = []
  for (const item of copy.facilities) {
    if (typeof item !== 'string' || !item) return undefined
    facilities.push(item)
  }
  const layer = copy.bindingLayer
  return layer === 'host_machine' ||
    layer === 'stateless_sandbox' ||
    layer === 'session_sandbox' ||
    layer === 'tenant_sandbox'
    ? Object.freeze({ bindingLayer: layer, facilities: Object.freeze(facilities) })
    : undefined
}
export function ownDescription(value: EnvironmentDescription): EnvironmentDescription | undefined {
  const copied = data(value, ['reference', 'bindingLayer', 'facilities'])
  if (!copied) return undefined
  const reference = ownReference(copied.reference),
    requirement = ownRequirement({
      bindingLayer: copied.bindingLayer,
      facilities: copied.facilities,
    })
  return reference && requirement ? Object.freeze({ ...requirement, reference }) : undefined
}
export function ownResources(
  value: readonly ManagedResource[],
): readonly ManagedResource[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: ManagedResource[] = [],
    keys = new Set<string>()
  for (const resource of value) {
    const copy = data(resource, ['key', 'provider', 'reference'])
    if (
      !copy ||
      typeof copy.key !== 'string' ||
      !copy.key ||
      typeof copy.provider !== 'string' ||
      !copy.provider ||
      copy.reference === undefined ||
      keys.has(copy.key)
    )
      return undefined
    keys.add(copy.key)
    result.push(
      Object.freeze({ key: copy.key, provider: copy.provider, reference: copy.reference }),
    )
  }
  return Object.freeze(result)
}
