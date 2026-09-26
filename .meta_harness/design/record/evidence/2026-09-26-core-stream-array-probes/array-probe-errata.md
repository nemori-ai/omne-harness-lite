# Structure probe limits

The original `array-probe.mjs` and its unmodified `array-probe.json` only measure frozen-array copying and fragment-chain materialization.

- The original probe selects records by array slot, not by the candidate's mathematical JsonNumber index comparison. The earlier handoff message describing that lookup as linear was incorrect.
- `settleMs` builds output shells from an already materialized snapshot. It does not measure state-to-settlement materialization or actual `closeOut`.
- `retainedHeapDeltaBytes` is a misleading historical key. It is a heap-used delta without a second GC, not a stable retained-heap measurement.
- No AR/CB validation, tool parsing, audio, trim accounting, or product throughput is measured.

These numbers cannot establish a production latency, memory bound, or O(1) claim. The intended array candidate has O(B) lookup/update, O(1) fragment head insertion (excluding validation and copying payload), and O(B + live fragment count + materialized content) reads, with empty fragments counted when present.
