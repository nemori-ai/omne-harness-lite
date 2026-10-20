import {
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type ModelInvocationParts,
  type ModelInvocationRef,
} from '@omne-harness/model-contract'
import type { TenantId } from '@omne-harness/legal-identity'

/** Construct a fixture locator from explicit original identities before admission. */
export function invocationReference<T extends ModelInvocationParts>(parts: T): ModelInvocationRef {
  const encoded = encodeModelInvocationRef({
    tenant: parts.tenant,
    call: parts.call,
    admission: parts.admission,
  })
  if ('failure' in encoded) throw new Error('fixture reference: ' + encoded.failure.reason)
  return encoded.ok
}
