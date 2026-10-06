import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ManagedResource } from '@omne-harness-lite/execution-environments'
const object = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
function data(value: unknown, keys: readonly string[]): JsonObject | undefined {
  const copy = copyJsonValue(value)
  return 'ok' in copy && object(copy.ok) && Object.keys(copy.ok).every(key => keys.includes(key))
    ? copy.ok
    : undefined
}
export {
  captureEnvironmentScope as ownScope,
  captureEnvironmentReference as ownReference,
  captureEnvironmentRequirement as ownRequirement,
  captureEnvironmentDescription as ownDescription,
} from '@omne-harness-lite/execution-environments'
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
