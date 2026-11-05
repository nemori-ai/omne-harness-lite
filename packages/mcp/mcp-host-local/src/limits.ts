// The byte bound of what a line reads from the peer. One stdio line, one 2xx JSON body or one SSE
// event above the bound breaks the stream (contract T2): the transport reports `stream-broken`
// and is unusable. An error-status body above the bound is reported as empty, so it classifies as
// plain, and a metadata document above it counts as not fetched.
// The JSON limits of a message are the contract's: `classifyWireEvent` and `readPeerMessage`
// parse with them, and the session parses nothing itself.

/** 16 MiB: the bound of one stdio line and of one HTTP body. */
export const BYTE_LIMIT = 16_777_216
