# assets-local behavior

## Scope and authority

The trusted owner capability persists fixed asset versions, the latest published version, tenant holdings and their legal Settings source layout. It consumes category contracts from [assets](../assets/SPEC.md). Settings owns assignment values, locks and evaluation. Identity owns caller qualification. The [composition boundary](../docs/settings-composition.md) remains unchanged.

All operations use one configured tenant transaction domain. Holding `scopeRef` must equal the domain's tenant reference. Cross-scope and cross-domain bindings are refused. Registration alone creates no holding or setting right.

## Versions and holdings

Publication derives declarations from the actual `PinnedBody` through its registered category contract. The persisted declaration includes a canonical JSON SHA-256 digest calculated by the server. Category, name, body, source and declaration are immutable for one asset/version pair. Reusing that pair with different content returns `version_conflict`.

Each new version advances the latest pointer and the asset revision. Publication requires the current asset revision, or `0` before the first publication. Republishing an existing identical version with the current revision changes nothing and does not move the latest pointer backwards.

A holding selects either the latest published version or one existing pinned version. Follow selection observes future publications. Pinned selection stays on its version. The holding must reference a published asset. The package permits one held capability, identified by category and name, in a tenant scope. A same-name asset can exist without a holding.

A holding has its own revision. Changes require the exact current revision. A changed selection, source layout, grant list or state increments that revision. Removing a holding retains its identity as a tombstone. It cannot be held again or selected again. A fresh holding uses a new identity and cannot inherit settings stored under the removed identity. Removal does not delete Settings values or operation results.

Sources carry explicit stable owner and scope identities. Their IDs are ordered, unique and limited to 32. Grants refer only to those sources. Each source grant and each action occurs at most once. Actions are `set`, `clear`, `lock` and `unlock`.

## Transaction facts

The `assets.settings` participant owns asset tables. It reads the current holding, selected published version, declaration and source layout in the same transaction as the Settings participant. It reads no Settings or Identity private tables.

The guard only accepts `policyId: 'asset'`, with `targetRef` equal to the held identity. It refuses removed holdings, missing definitions, foreign scopes and stale definition references. Its public fact contains the exact command binding, current declaration, definition reference, full source descriptors and grants. Settings still validates revisions, item compatibility, grants and locks.

Capture uses the public `SettingsProjectionBinding` and provides `settings.assets-projection`. Management capture with an empty target list enumerates held targets in the domain. An explicit list restricts output to matching asset targets. Other policies contribute no asset views. Runtime capture uses only explicit targets and never chooses a target itself. The composition owner verifies the genuine runtime selection and caller qualification.

A requested missing, removed or undeclared asset target produces a safe refusal. A held asset without a Settings declaration cannot be presented as an available Settings target. Management enumeration omits a legitimate held asset whose selected version declares no Settings. Such an asset is not a settings target and does not make unrelated settings unavailable. Missing or malformed selected versions still fail instead of silently disappearing.

Each currentness change obtains a new durable owner sequence number. The projection's `ownerRevision` changes when its holding or followed version changes. A pinned holding does not change when another version is published. The sequence is never reused within the domain.

Capture accepts at most 128 targets. Management enumeration reads at most 129 holding identities and refuses overflow. It never truncates an oversized set into success. Commands and individual records have a 1 MiB text budget, a depth limit of 32 and a 50,000-node limit. Aggregate projections obey the same budget. Malformed persisted data does not become an empty or successful result.

## Current publication projection

Publication capture supplies the existing Settings projection and a separate Assets publication fact from the same selected-version reads. Each entry retains the complete target, owner revision and Settings definition reference, together with the actual asset reference, category, name, version, source and canonical body digest. Follow and pinned holdings use the same selected-version rule as normal capture. Equal Settings definitions do not make two asset releases interchangeable.

The projection attests to this owner's current selection, not to a global publisher or current execution permission. The integration owner must resolve the native publication identity through an unambiguous trusted namespace mapping and compare the original declaration. Actual loaded enforcement remains a separate current fact. No caller can supply publication-result fields through the capture command. This projection creates no new asset publication column or approval protocol and does not rewrite historical versions or receipts.

All scope, missing-target, enablement and aggregate budget rules of capture apply. The paired facts have identical capture bindings and come from one transaction; consumers must also match their target, definition reference and owner revision. Unloading an integration does not delete held assets, Settings values or publication history.

## Holding enablement

A new holding is enabled. `changeHolding` accepts `setEnabled` with a boolean and the expected holding revision. The operation changes only that holding's enabled state. An effective change advances both holding and owner revisions in the same transaction. A repeated value leaves the revisions unchanged. Removal remains irreversible, including through `setEnabled`.

Disabling retains the holding, selected release, Settings values and original receipts. Management capture includes disabled targets and reports `enabled: false`. Runtime capture of a disabled target refuses with `forbidden`. The Settings catalog exposes `targetEnabled` separately from configurable item values. Authorized Settings management can still change a disabled target's configuration. Enabling permits a new current read; it does not grant an execution permit or bypass outer governance.

The owner capability decides which holdings callers may manage. This provider does not infer official capabilities, organization policy or user authorization from an asset name. Runtime adoption and action admission must consume the current owner fact at their own boundary; a historical catalog result is not permission to execute.

The new enablement migrations retain the old meaning that existing holdings were enabled. They add the explicit field without changing identities, revisions, selection or retirement. Migrations use primary-key pages of at most 64 rows. Existing explicit booleans are preserved. A malformed explicit field fails verification rather than becoming enabled. No compatibility default is applied when reading current records.

For the local lifecycle, let H mean held and E mean enabled. Management visibility requires H. Runtime eligibility requires H and E. `setEnabled` preserves H and Settings values; remove makes H false irreversibly. Each mutation requires the current revision. Induction over these transitions preserves values across enablement changes and prevents reactivation after removal. SQL transaction ordering gives concurrent changes one order; this argument does not prove a later external action rechecks eligibility. The runtime integration owns that obligation.

## Results and lifetime

Mutation operation IDs identify the original request across restarts. A duplicate identical operation returns its original result. Reusing the ID for different command content returns `operation_conflict`. A revision conflict is a durable original rejection. A lost response returns `unknown`; callers recover with the original operation ID rather than inventing a new request.

The SQL provider owns commit durability and receipts. Asset mutation, owner sequence, current pointer and holding changes share its transaction. A success is returned only from a matching committed receipt. An unrecognized receipt remains unknown.

`close` rejects new operations and waits for accepted operations. The caller closes shared storage after every consumer drains.

## Verification responsibility

[Package tests](tests/README.md) exercise public operations with real SQLite Workers, including both holding-removal/setting-write orders. Reopen and lost-reply tests verify ordinary durable recovery. The separate settings-governance suite exercises real Identity, independent targets and Assets through one Settings application. These tests do not certify power-loss behavior, hardware durability or complete product adoption. The composition owner provides those applicable independent acceptance results.


## Source provenance

New holdings and `updateSources` require complete stable source identities. The holding stores this layout. Projection adds the selected owner revision as the current local authority revision. An owner command cannot choose that token. Changing the stable layout advances holding and owner revisions. The Settings participant separately checks the identity binding of stored values. Changing an owner or subject under the same source ID cannot transfer those values.

The source-layout migration runs after enablement migration. It preserves legacy IDs as an explicit `unmapped` layout without guessing owners or scopes. It reads at most 64 holdings per primary-key page, preserves grants and removed holdings, and rejects malformed explicit provenance. An unmapped holding emits no current Settings projection. A trusted `updateSources` can establish its complete layout. Settings still requires explicit rebase of its own unmapped assignments. Removing a holding does not delete either owner's historical records.

Historical operation lookup decodes the original `sourceIds` form of stored hold and source-update receipts. This private decoder preserves the original binding and result. It does not construct source identities or admit the old command shape. Current commands still require complete sources. Reusing a historical operation ID for a different current command returns `operation_conflict`. Malformed historical bindings remain `unknown`.
