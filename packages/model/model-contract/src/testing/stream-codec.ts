// The Model adapter of the common stream reference codec, for the doubles that judge a
// `StreamRef` against a tenant. It maps the detailed Model rejection to the common `malformed`.
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
