# Upstream provenance

This package carries a targeted fork of the OpenAI-compatible request/stream and SSE
framing portions of `earendil-works/pi` **1.0.0**, release commit
`a13d35a742c6ef8462812a28fbe1d8c8b7431c32`. Exact source/archive/license hashes and
file-to-source mappings are retained in [provenance.json](provenance.json).

The fork was first taken from 0.86.1 (`3390bd9`) and re-anchored to 1.0.0 on
2026-10-02 without code changes: each upstream change to the two source files between
those versions is listed with its disposition under `rebase` in provenance.json.

The original MIT notice is retained verbatim in [LICENSE.pi](LICENSE.pi).
Adapted files carry source and copyright headers. The package does not depend on the
complete upstream package, its model catalog, environment credential lookup or SDKs.

Request projection now uses this project's public message/tool values and exact binding.
Streaming produces arrival events, preserving raw tool fragments and opaque reasoning;
only the consumer assembler parses tool arguments. SSE framing uses Node byte streams,
strict UTF-8 and bounded events. JSON numbers use the project's lossless representation.
Cancellation includes owned admission before Node's Agent queue, actual request/socket
shutdown and reader cleanup. Hidden retries and redirects are absent.

These implementation changes do not inherit upstream model certification. Public API,
examples and current implementation limits are described in [README.md](README.md)
and [README_ZH.md](README_ZH.md).
