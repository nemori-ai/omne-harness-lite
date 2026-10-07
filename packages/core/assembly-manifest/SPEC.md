# Assembly manifest integration

The root owns public shapes, pure decisions and runtime-port types. It does not load Cordis or select a provider.
The existing six business operations retain [MF4](../../../.meta_harness/design/spec/capabilities/assembly-manifest/v4/contract.md)
and D-079.
This page owns integration behavior only. It does not replace the remaining business clauses, schemas or model duties.

`./cordis` owns `AssemblyManifestService`, key `assemblyManifest`, and their Context type.
The abstract service exposes the same six operations. It does not own storage or require borrowed adapters to close it.
A concrete provider must preserve session identity, classified failures, consistent reads and same-write rollback.
Service isolation does not grant tenant authorization.

`AssemblyManifestResources`, key `assemblyManifestResources`, carries borrowed `ManifestOptions` through injection.
Presence observations belong to the explicit source. Unknown facts stay unknown.
Diagnostics run after the real resource returns and exclude content and raw error messages.
A configured diagnostic requires a diagnosticFailure callback. Callback failure cannot replace the committed result or original defect.
Ports own their output and retention bounds. Neither resource service nor manifest provider closes them.

A provider captures storage and runtime ports for its generation. Withdrawal stops new valid work.
Already admitted work retains the captured resources through actual completion, including diagnostics.
Replacement does not release the old generation or undo SQL effects.
The assembly owner must retain borrowed resources until its selected concrete provider certifies actual drain.
Only a fulfilled drain observation permits release. Rejection or kernel disposal alone does not prove safe release.
No new Session coordination or cross-owner atomic transaction is promised here.
