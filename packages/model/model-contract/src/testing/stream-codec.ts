import type { StreamCallCodec } from '@omne-harness/stream-arrival'
import { encodeModelInvocationRef, resolveModelInvocationRef } from '../reference.ts'

export const modelStreamCodec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant }) {
    const resolved = resolveModelInvocationRef(text, tenant)
    if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
    const encoded = encodeModelInvocationRef(resolved.ok)
    if ('failure' in encoded)
      throw new TypeError('a resolved Model invocation could not be encoded')
    return encoded
  },
}
