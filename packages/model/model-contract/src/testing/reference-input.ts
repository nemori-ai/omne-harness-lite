import { tenantCodec } from '@omne-harness/legal-identity'
import {
  encodeModelInvocationRef,
  type ModelInvocationParts,
  type ModelInvocationRef,
} from '../reference.ts'

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

/** Negative fixture: bypass the codec to send a reserved admission into the public boundary. */
export function reservedReference<T extends ModelInvocationParts>(parts: T): string {
  const tenant = tenantCodec.encode(parts.tenant)
  if (!tenant.ok) throw new Error('fixture requires a minted tenant')
  return JSON.stringify(['model-invocation', 1, tenant.value, parts.call, parts.admission])
}
