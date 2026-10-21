import {
  encodeModelInvocationRef,
  decodeModelCallId,
  decodeModelOperationId,
  type ModelInvocationParts,
  type ModelInvocationRef,
} from '@omne-harness/model-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

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

export function referenceParts<T extends { tenant: TenantId; reference: ModelInvocationRef }>(
  input: T,
) {
  const tuple: unknown = JSON.parse(input.reference)
  if (
    !Array.isArray(tuple) ||
    tuple[0] !== 'model-invocation' ||
    tuple[1] !== 1 ||
    tuple.length !== 5
  )
    throw new Error('fixture reference tuple')
  const call = decodeModelCallId(tuple[3])
  const admission = decodeModelOperationId(tuple[4])
  if ('failure' in call || 'failure' in admission) throw new Error('fixture reference identity')
  return { ...input, call: call.ok, admission: admission.ok }
}

/** Negative fixture: bypass the codec to send a reserved admission into the public boundary. */
export function reservedReference<T extends ModelInvocationParts>(parts: T): string {
  const tenant = tenantCodec.encode(parts.tenant)
  if (!tenant.ok) throw new Error('fixture requires a minted tenant')
  return JSON.stringify(['model-invocation', 1, tenant.value, parts.call, parts.admission])
}
