# Upstream provenance

One file of this package is adapted from `earendil-works/pi` **1.0.0**, release commit
`a13d35a742c6ef8462812a28fbe1d8c8b7431c32`: [src/sse.ts](src/sse.ts) derives from
`parseSSE` in `packages/ai/src/api/openai-codex-responses.ts`. The exact source, archive and
license hashes and the file-to-source mapping are kept in [provenance.json](provenance.json).

The adaptation reaches this package through the archived `pi-ai-transport` fork, which first
took the code from 0.86.1 (`3390bd9`) and re-anchored it to 1.0.0 on 2026-10-02. `parseSSE`
did not change between those two versions.

The original MIT notice is kept verbatim in [LICENSE.pi](LICENSE.pi). The adapted file carries
a source and copyright header. The package does not depend on the upstream package, its model
catalog, its environment credential lookup or any provider SDK.

`src/sse.ts` frames an async iterable of `Uint8Array` chunks into SSE event data. It keeps the
upstream character framing and adds strict UTF-8 decoding, a per-event byte limit, every SSE
line-break form across chunk cuts, rejection of an unterminated tail and four closed failure
reasons. Only an error of the UTF-8 decoder becomes an invalid-UTF-8 failure; other errors pass
through unchanged. A `data` line without a colon has an empty value, as the WHATWG event-stream
rules require. JSON reading and the protocol end-marker are not in this file: the project-owned
[src/frames.ts](src/frames.ts) reads event data with `@omne-harness/json-text`.

Other files of this package are project-owned and carry no upstream header. The adaptation does
not inherit any upstream model certification.
