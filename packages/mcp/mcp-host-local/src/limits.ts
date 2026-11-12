// The byte bound of what a line reads from the peer: the contract's `WIRE_LIMITS.maxBytes`
// (T2). One stdio line, one 2xx JSON body or one SSE event above the bound breaks the stream:
// the transport reports `stream-broken` and is unusable. An error-status body above the bound is
// reported as empty, so it classifies as plain, and a metadata document above it counts as not
// fetched. The JSON limits of a message are the contract's too: `classifyWireEvent` and
// `readPeerMessage` parse with them, the metadata fetch reads with them, and the session parses
// nothing itself.
import { WIRE_LIMITS } from '@omne-harness/mcp-contract'

/** 16 MiB: the bound of one stdio line and of one HTTP body, by the contract. */
export const BYTE_LIMIT: number = WIRE_LIMITS.maxBytes
