# `@omne-harness-lite/records`

Project-owned durable-record data, ports, and the strict `core-journal/1` single-line codec.
The package has no writer implementation, filesystem, lock, recovery, admission, reducer, or Cordis dependency.

The default entry exports the accepted P0 records boundary. `encodeEnvelope` validates and
encodes one envelope; `decodeLine` validates one complete LF-terminated physical line. A valid
decoded line establishes only single-line codec conformance. Journal continuity, ownership
authorization, writer epochs, deduplication, durability, and recovery belong to later providers.

For the shared stream model, one envelope may contain at most one append for a stream. Every
touched stream advances by exactly one revision per envelope, regardless of how many ordered
records that append contains; sequence numbers advance separately per envelope. This is the
current consumption of the accepted records rule in
[Records 的批次、身份和读取边界](../../../docs/proposals/core-capabilities/implementation/shared-interfaces.md#records-的批次身份和读取边界),
whose accepted source already contained the rule at commit `8f4cfa9c38092a9bfa1a9848a0fb506b35d779c5`.
