# Manifest provider verification

Run the package build, typecheck and full tests. The [public binding promise](../SPEC.md) is separate from full model-runtime acceptance.
The common business promise belongs to [assembly-manifest](../../../core/assembly-manifest/SPEC.md).

The real SQLite tests cover immutable/lossless records, reopen, conditional append, two-session reads, actual given selection,
rollback after table failure, capacity, unavailable/defect distinctions, diagnostics and child-process crashes.
`store.spec.ts` and `given.spec.ts` retain their original business assertions.
Binding tests must cover missing/invalid dependencies and configuration, every stopped callable reference,
blocked work during required dependency removal and replacement, captured callbacks, actual completion and borrowed-resource retention.
A passing callback or repeated kernel disposal cannot stand in for the drain observation.

The public-boundary checks must inspect source dependencies, emitted declarations and runtime loading.
They must consume actual packed archives through root and ./cordis and reject removed/private exports.
Use the unchanged Cordis 4.0.4 [kernel probes](../../../core/kernel-basis/verification/README.md).
Provider combination tests supply evidence beyond those bounded upstream facts.

Dual-session isolation does not prove tenant authorization. SQLite component checks do not prove PostgreSQL or power-loss guarantees.
No paid model call is necessary for this binding delivery.

Keep a real two-writer same-H positive case and a split-read/write negative control that fails conditional append.
Check given retry after lost receipt and child-process crash, strict historical times, and a consistent head/latest view.
Unreadable storage and unknown presence must fail, never become empty facts.
readEvaluation must select the latest given/mint without reuse regression and reject a bad latest projection without fallback.
readGiven must keep an old explicit H across later append and reopen, preserve unknown content and exact numbers, distinguish unknown from none, reject a truly out-of-range H only after reading the head, and perform no write or repair.
Include huge legal expectedHead/H, safe-integer capacity before mint/INSERT, parent-only unique-conflict retry, and table-conflict rollback of the entire batch.
Do not catch a program/schema defect as unavailable or use a JOIN to hide a corrupt parent.
