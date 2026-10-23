# Upstream provenance

Five files of this package are adapted from `earendil-works/pi` **1.0.0**, release commit
`a13d35a742c6ef8462812a28fbe1d8c8b7431c32`. The exact source, archive and license hashes and the
file-to-source mapping are kept in [provenance.json](provenance.json).

| File | Upstream source | Upstream symbols |
| --- | --- | --- |
| [src/sse.ts](src/sse.ts) | `packages/ai/src/api/openai-codex-responses.ts` | `parseSSE` |
| [src/chat-completions/projection.ts](src/chat-completions/projection.ts) | `packages/ai/src/api/openai-completions.ts` | `convertMessages`, `convertTools`, `addCacheControlToTextContent` |
| [src/chat-completions/request.ts](src/chat-completions/request.ts) | `packages/ai/src/api/openai-completions.ts` | `buildParams` |
| [src/chat-completions/chunk.ts](src/chat-completions/chunk.ts) | `packages/ai/src/api/openai-completions.ts` | chunk loop of `stream`, `parseChunkUsage` |
| [src/chat-completions/decoder.ts](src/chat-completions/decoder.ts) | `packages/ai/src/api/openai-completions.ts` | chunk loop of `stream`, `finishBlock`, `mapStopReason` |

The original MIT notice is kept verbatim in [LICENSE.pi](LICENSE.pi). Each adapted file carries
a source and copyright header. The headers of the engine files name the commit and the symbols
and refer to provenance.json for the file name, because the engine source must not contain a
vendor name. The package does not depend on the upstream package, its model catalog, its
environment credential lookup or any provider SDK.

## SSE framing

The SSE adaptation reaches this package through the archived `pi-ai-transport` fork, which first
took the code from 0.86.1 (`3390bd9`) and re-anchored it to 1.0.0 on 2026-10-02. `parseSSE`
did not change between those two versions.

`src/sse.ts` frames an async iterable of `Uint8Array` chunks into SSE event data. It keeps the
upstream character framing and adds strict UTF-8 decoding, a per-event byte limit, every SSE
line-break form across chunk cuts, rejection of an unterminated tail and four closed failure
reasons. Only an error of the UTF-8 decoder becomes an invalid-UTF-8 failure. Other errors pass
through unchanged. A `data` line without a colon has an empty value, as the WHATWG event-stream
rules require. JSON reading and the protocol end-marker are not in this file: the project-owned
[src/frames.ts](src/frames.ts) reads event data with `@omne-harness/json-text`. A reader that ends
the events early, even before the first one, closes the byte source. That wrapper is the
project-owned [src/iteration.ts](src/iteration.ts).

## Gateway engine

The engine takes only pure computation from the chat-completions module of pi: the message
conversion, the tool wrapper, the cache marker, the request parameters, the chunk loop, the usage
fields and the stop mapping. It does not take the
HTTP client, the SDK, the retry wrapper, the environment lookup of credentials or the detection
of provider compatibility from a URL or a provider id. Every vendor difference is record data or
one of four family hooks.

- `src/chat-completions/projection.ts` keeps the upstream message shapes: tool results as `tool`
  messages, the images of a run of tool results in one following user message, function tool
  calls with JSON text arguments, function tools and the cache marker on the last text part. It
  replaces the compatibility switches with record data, follows the contract replay projection,
  normalizes tool-call ids, refuses orphan calls and results, and writes sorted keys. It writes
  no placeholder text and no bridging assistant message.
- `src/chat-completions/request.ts` keeps the gateway body frame: `model`, `stream: true`, the
  `provider` routing object and the fixed fields. It adds parameter planning, the replay
  declaration check and the meter representation. It does not send a usage
  switch.
- `src/chat-completions/chunk.ts` reads one data frame into a typed chunk. It keeps the upstream
  usage fields, but a count that is not a decimal integer stays unknown and no cost is computed.
  It keeps a signature-only reasoning item, refuses a second choice and unsupported output
  members, and reads only the `reasoning` field name.
- `src/chat-completions/decoder.ts` replaces the event loop with a phase union and one pure reduce
  step per frame that gives contract facts. It keeps one text and one thinking block, tool-call
  blocks by stream index and the stop mapping. It adds the reasoning detail joining of the
  archived fork, the reasoning hook at finish, bounded buffers, the bounded usage tail, the
  served-provider check, a seal at a `length` finish and in-band error mapping without the
  upstream text.

The other engine files (`bind.ts`, `details.ts`, `decimal.ts`, `parameters.ts`, `gateway.ts`,
`json.ts`, `vocabulary.ts` and `index.ts`) are project-owned. `details.ts` holds the joining rule of the
archived fork, which is project-owned code. Other files of this package are project-owned
and carry no upstream header. The adaptation does not inherit any upstream model certification.
