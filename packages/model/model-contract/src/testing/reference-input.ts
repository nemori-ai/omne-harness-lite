import { tenantCodec } from '@omne-harness/legal-identity'
import {
  encodeModelInvocationRef,
  type ModelInvocationParts,
  type ModelInvocationRef,
} from '../reference.ts'

export function invocationReference<T extends ModelInvocationParts>(parts: T): ModelInvocationRef {
  const encoded = encodeModelInvocationRef({
    tenant: parts.tenant,
    call: parts.call,
    admission: parts.admission,
  })
  if ('failure' in encoded) throw new Error('fixture reference: ' + encoded.failure.reason)
  return encoded.ok
}

export function reservedReference<T extends ModelInvocationParts>(parts: T): string {
  if (!tenantCodec.encode(parts.tenant).ok) throw new Error('fixture requires a minted tenant')
  return JSON.stringify(['model-invocation', 2, parts.call, parts.admission])
}
