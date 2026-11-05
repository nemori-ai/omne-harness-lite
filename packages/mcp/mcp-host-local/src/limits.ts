// The byte bounds of what a line reads from the peer. One stdio line or one HTTP body above the
// bound breaks the stream (contract T2): the transport reports `stream-broken` and is unusable.
// The JSON limits are those of the contract's `classifyWireEvent`, so that what the session parses
// for its payload is what the contract classified.
import type { JsonLimits } from '@omne-harness/json-text'

/** 16 MiB: the bound of one stdio line and of one HTTP body. */
export const BYTE_LIMIT = 16_777_216

export const JSON_LIMITS: JsonLimits = {
  maxBytes: BYTE_LIMIT,
  maxDepth: 128,
  maxItems: 1_000_000,
  maxMembers: 100_000,
  maxStringLength: BYTE_LIMIT,
  maxNumberLength: 100,
}
