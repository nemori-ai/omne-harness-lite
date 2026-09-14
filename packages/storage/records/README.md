# `@omne-harness-lite/records`

Project-owned durable-record data, ports, and the strict `core-journal/1` single-line codec.
The package has no writer implementation, filesystem, lock, recovery, admission, reducer, or Cordis dependency.

The default entry exports the accepted P0 records boundary. `encodeEnvelope` validates and
encodes one envelope; `decodeLine` validates one complete LF-terminated physical line. A valid
decoded line establishes only single-line codec conformance. Journal continuity, ownership
authorization, writer epochs, deduplication, durability, and recovery belong to later providers.
