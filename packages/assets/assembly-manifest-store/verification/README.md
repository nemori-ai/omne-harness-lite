# Manifest provider verification

Run the package build, typecheck and full tests. The [public binding promise](../SPEC.md) is separate from full model-runtime acceptance.
[Legacy MF4 verification](../../../../.meta_harness/design/realization/packages/assets/assembly-manifest-store/verification.md)
and D-079's accepted obligations remain effective. Their contract, schema and model sources are not retired by this binding change.

The real SQLite tests cover immutable/lossless records, reopen, conditional append, two-session reads, actual given selection,
rollback after table failure, capacity, unavailable/defect distinctions, diagnostics and child-process crashes.
`store.spec.ts` and `given.spec.ts` retain their original business assertions. Formal-Service assertions replace only the old plain-object enumeration.
Binding tests must cover missing/invalid dependencies and configuration, every stopped callable reference,
blocked work during required dependency removal and replacement, captured callbacks, actual completion and borrowed-resource retention.
A passing callback or repeated kernel disposal cannot stand in for the drain observation.

The public-boundary checks must inspect source dependencies, emitted declarations and runtime loading.
They must consume actual packed archives through root and ./cordis and reject removed/private exports.
Use the unchanged Cordis 4.0.4 [kernel probes](../../../core/kernel-basis/verification/README.md).
Provider combination tests supply evidence beyond those bounded upstream facts.

Dual-session isolation does not prove tenant authorization. SQLite component checks do not prove PostgreSQL or power-loss guarantees.
No paid model call is necessary for this binding delivery.
