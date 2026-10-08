# MF4 provider binding

The standalone factory and migrations stay in the pure root. The concrete services and plugin are exported only from `./cordis`.
Business behavior remains [MF4](../../../.meta_harness/design/spec/capabilities/assembly-manifest/v4/contract.md),
D-079 and its exact accepted provider clauses.
SQL algorithms, tables, identities, capacity, error order and diagnostic facts are unchanged by this binding migration.

The named `assembly-manifest-store` plugin requires storage and assemblyManifestResources.
Its configuration is a strict empty serialized object. Callbacks and runtime handles must be injected through the resource service.
Missing required services hold the consumer pending. Invalid configuration rejects startup.
`AssemblyManifestResourcesService` validates ports before publication and snapshots the option fields.
An explicit empty resource service selects the original optional-port defaults.
The source object and functions remain borrowed. The factory captures the PresenceSource object and the two callback references once.
It calls diagnostic and diagnosticFailure as bare functions, without binding this to Cordis or the caller Context.
It calls presenceSource.read through the captured source object; it does not snapshot or bind that method separately.

`AssemblyManifestStoreService` extends the existing public six-operation Service.
Its close effect is registered before publication. It owns one factory and borrows storage and ports.
Withdrawal invokes factory close immediately. Valid new calls return unavailable; original invalid-input precedence remains.
Admitted operations continue on the captured generation. All six old callable references retain this stop policy.

The concrete provider's stable `closed` promise stays pending until factory drain and diagnostics finish.
It can be captured by assembly code that selects this provider. It is not a seventh business operation or a promise made by borrowed adapters.
Repeated inactive fiber disposal is not an observation of drain.
Close rejection remains observable on `closed`; its internal observer only prevents unhandled rejection.
Only fulfillment establishes drain. On rejection the owner must inspect and retain resources while release remains unproved.
Borrowed resources are never closed automatically. A new provider may be available while old admitted work still owns its generation.

Required verification and retained legacy obligations are indexed in [verification](verification/README.md).
