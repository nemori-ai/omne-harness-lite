# assets-local behavior

## Scope and authority

The trusted owner capability persists fixed asset versions, the latest published version, tenant holdings and their legal Settings source layout. It consumes category contracts from [assets](../assets/SPEC.md). Settings owns assignment values, locks and evaluation. Identity owns caller qualification. The [composition boundary](../docs/settings-composition.md) remains unchanged.

All operations use one configured tenant transaction domain. Holding `scopeRef` must equal the domain's tenant reference. Cross-scope and cross-domain bindings are refused. Registration alone creates no holding or setting right.

## Versions and holdings

Publication derives declarations from the actual `PinnedBody` through its registered category contract. The persisted declaration includes a canonical JSON SHA-256 digest calculated by the server. Category, name, body, source and declaration are immutable for one asset/version pair. Reusing that pair with different content returns `version_conflict`.

Each new version advances the latest pointer and the asset revision. Publication requires the current asset revision, or `0` before the first publication. Republishing an existing identical version with the current revision changes nothing and does not move the latest pointer backwards.

A holding selects either the latest published version or one existing pinned version. Follow selection observes future publications. Pinned selection stays on its version. The holding must reference a published asset. The package permits one held capability, identified by category and name, in a tenant scope. A same-name asset can exist without a holding.

A holding has its own revision. Changes require the exact current revision. A changed selection, source layout, grant list or state increments that revision. Removing a holding retains its identity as a tombstone. It cannot be held again or selected again. A fresh holding uses a new identity and cannot inherit settings stored under the removed identity. Removal does not delete Settings values or operation results.

Source IDs are ordered, unique and limited to 32. Grants refer only to those sources. Each source grant and each action occurs at most once. Actions are `set`, `clear`, `lock` and `unlock`.

## Transaction facts

The `assets.settings` participant owns asset tables. It reads the current holding, selected published version, declaration and source layout in the same transaction as the Settings participant. It reads no Settings or Identity private tables.

The guard only accepts `policyId: 'asset'`, with `targetRef` equal to the held identity. It refuses removed holdings, missing definitions, foreign scopes and stale definition references. Its public fact contains the exact command binding, current declaration, definition reference, source IDs and grants. Settings still validates revisions, item compatibility, grants and locks.

Capture uses the public `SettingsProjectionBinding` and provides `settings.assets-projection`. Management capture with an empty target list enumerates held targets in the domain. An explicit list restricts output to matching asset targets. Other policies contribute no asset views. Runtime capture uses only explicit targets and never chooses a target itself. The composition owner verifies the genuine runtime selection and caller qualification.

A requested missing, removed or undeclared asset target produces a safe refusal. A held asset without a Settings declaration cannot be presented as an available Settings target. Management capture fails safely if such a target prevents a complete result.

Each currentness change obtains a new durable owner sequence number. The projection's `ownerRevision` changes when its holding or followed version changes. A pinned holding does not change when another version is published. The sequence is never reused within the domain.

Capture accepts at most 128 targets. Management enumeration reads at most 129 holding identities and refuses overflow. It never truncates an oversized set into success. Commands and individual records have a 1 MiB text budget, a depth limit of 32 and a 50,000-node limit. Aggregate projections obey the same budget. Malformed persisted data does not become an empty or successful result.

## Results and lifetime

Mutation operation IDs identify the original request across restarts. A duplicate identical operation returns its original result. Reusing the ID for different command content returns `operation_conflict`. A revision conflict is a durable original rejection. A lost response returns `unknown`; callers recover with the original operation ID rather than inventing a new request.

The SQL provider owns commit durability and receipts. Asset mutation, owner sequence, current pointer and holding changes share its transaction. A success is returned only from a matching committed receipt. An unrecognized receipt remains unknown.

`close` rejects new operations and waits for accepted operations. The caller closes shared storage after every consumer drains.

## Verification responsibility

[Package tests](tests/README.md) exercise public operations with real SQLite Workers, including both holding-removal/setting-write orders. Reopen and lost-reply tests verify ordinary durable recovery. They do not certify power-loss behavior, hardware durability or the complete Identity and Settings application composition. The composition owner provides those applicable independent acceptance results.
