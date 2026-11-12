# assets-local behavior

## Scope and authority

The trusted owner capability persists fixed asset versions, the latest published version, tenant holdings and their legal Settings source layout. It consumes category contracts from [assets](../assets/SPEC.md). Settings owns assignment values, locks and evaluation. Identity owns caller qualification. The [composition boundary](../docs/settings-composition.md) remains unchanged.

All operations use one configured tenant transaction domain. Holding `scopeRef` must equal the domain's tenant reference. Cross-scope and cross-domain bindings are refused. Registration alone creates no holding or setting right.

## Current asset queries

`readAsset` reads one asset in the owner's configured tenant domain. It returns the current asset identity, latest-version reference and publication revision, or explicit absence. A storage failure, malformed record or foreign binding is rejected, never reported as absence. The trusted caller remains responsible for authorization.

The snapshot does not reserve a publication revision. Publishing after a concurrent change must fail the original expected-revision check. Asset revision, holding revision and domain owner sequence remain distinct. Reads use the existing domain row and asset primary key, with no collection scan. Closing rejects new reads and drains accepted reads without closing shared storage.

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

Publication capture supplies the existing Settings projection and a separate Assets publication fact from the same selected-version reads. Each entry retains the complete target, owner revision and nullable Settings definition reference, together with the actual asset reference, category, name, version, source and canonical body digest. Follow and pinned holdings use the same selected-version rule as normal capture. Equal Settings definitions do not make two asset releases interchangeable. A published version without a Settings declaration still supplies its actual publication; its definitionRef is null and it contributes no Settings view. Absence of configuration does not skip the holding, selected-version, scope or runtime enablement checks. The publication fact protocol is assets-publication/2.

The projection attests to this owner's current selection, not to a global publisher or current execution permission. The integration owner must resolve the native publication identity through an unambiguous trusted namespace mapping and compare the original declaration. Actual loaded enforcement remains a separate current fact. No caller can supply publication-result fields through the capture command. This projection creates no new asset publication column or approval protocol and does not rewrite historical versions or receipts.

All scope, missing-target, enablement and aggregate budget rules of capture apply. The paired facts have identical capture bindings and come from one transaction; consumers that join a configured target must also match its target, non-null definition reference and owner revision. A publication with null definitionRef must not be treated as a configured Settings target. Unloading an integration does not delete held assets, Settings values or publication history.

## Holding enablement

A new holding is enabled. `changeHolding` accepts `setEnabled` with a boolean and the expected holding revision. The operation changes only that holding's enabled state. An effective change advances both holding and owner revisions in the same transaction. A repeated value leaves the revisions unchanged. Removal remains irreversible, including through `setEnabled`.

Disabling retains the holding, selected release, Settings values and original receipts. Management capture includes disabled targets and reports `enabled: false`. Runtime capture of a disabled target refuses with `forbidden`. The Settings catalog exposes `targetEnabled` separately from configurable item values. Authorized Settings management can still change a disabled target's configuration. Enabling permits a new current read; it does not grant an execution permit or bypass outer governance.

The owner capability decides which holdings callers may manage. This provider does not infer official capabilities, organization policy or user authorization from an asset name. Runtime adoption and action admission must consume the current owner fact at their own boundary; a historical catalog result is not permission to execute.

For the local lifecycle, let H mean held and E mean enabled. Management visibility requires H. Runtime eligibility requires H and E. `setEnabled` preserves H and Settings values; remove makes H false irreversibly. Each mutation requires the current revision. Induction over these transitions preserves values across enablement changes and prevents reactivation after removal. SQL transaction ordering gives concurrent changes one order; this argument does not prove a later external action rechecks eligibility. The runtime integration owns that obligation.

## Held capability read

`readHeldCapability({ capability })` reads the held holding of one capability identity, category plus name, in the configured domain. The unique held-capability index allows at most one. The answer has the same shape and the same rules as `readHolding`: the holding with its selected version, explicit absence, or a rejection. A domain without any record yet answers absence. A storage failure is a rejection, never absence.

## Published packages

This section implements [正文是目录的类别](../assets/SPEC.md#directory-category) on one machine. `createAssetsLocal` takes an optional `packageRoot`: the directory of the package files of this domain. One domain has one root; the caller guarantees it, and the root has no tenant subdirectory. Without a root, `packages.publish` answers `rejected` with `not-configured`, a reader answers `unavailable`, `locate` answers `absent`, and `recover` finds nothing. `readHeldCapability` does not use the root.

`packages` gives four operations:

- `publish({ capability, assetRef, from, operationId })` publishes the package that the reader `from` gives. The category must be registered and must give a `layout`. The manifest must keep the three limits of the layout, and its paths must stay below the package root without repeats or a file that is the parent of another path. The layout's `inspect` must accept the package, and the category's `judge` must accept the body. The version is the package digest of the manifest. The body of the version record is the declaration that `inspect` projected, an object, plus the field `manifest` with every entry: path, size and digest. It goes through the existing `publish`, with the asset's current revision as the expected revision.
- `reader({ assetRef, version })` gives the read port of one version of one asset. It reads the version record by its key, asset reference and version, and takes the category and the name from the record; one reader reads the record once and keeps it. `manifest` gives the manifest of the version record; `open(path, expected)` gives the bytes of the entry with that path and that digest, after it checks the digest of the bytes in place. A path or digest outside the manifest answers `entry-not-found`. Bytes in place that differ from the manifest answer `material-unavailable`; no byte is given.
- `recover()` is the recovery scan at start: see the table.
- `locate({ assetRef, version })` gives the local directory of a version in place, or `absent`. It reads the version record, so it answers later; a storage failure rejects and is never `absent`. It is on this member only, not in the asset contract.

Files are at `<root>/<namespace>/<name>/<directory name of the version>/`. A version is `sha256:<hex>`; a colon is no lawful file name on Windows, so its directory name is `sha256-<hex>` (`versionDirectoryName`). The version itself does not change. Each namespace directory holds a file `.category` with the name of its category, written before the first version is swapped in; the recovery scan reads it. A publish stages them at `<root>/.staging/<digest of the operation identifier>/`, with a meta file written last. Publishing is ordered: stage, record the version, swap the staging in with one directory rename. The two writes share no transaction. The flow is idempotent by operation identifier: the receipt of a committed operation gives the same answer again, after it completes a pending swap, and writes nothing.

The publish flow for one version of one capability identity:

| Operation | None | Published | Staging only | Recorded, not swapped in |
| --- | --- | --- | --- | --- |
| Publish | A package that does not pass is rejected, and nothing changes. A package that passes is staged, recorded and swapped in | The same version writes nothing and answers `changed: false`. A new version goes as in «None» | The staging of this operation is removed; then as in «None» | The pending swap completes first; then this publish goes on |
| Read | `package-not-found` | The content; bytes that differ answer `material-unavailable` | The staging is not visible: `package-not-found` | `material-unavailable` |
| Recovery scan | Nothing changes | Nothing changes; a version in place whose files differ from its record is reported in `mismatched` and stays | The staging is removed (`discarded`) | The staging is swapped in (`completed`) |

Two publishes of the same asset at the same time: the record step checks the revision, so the later one answers `conflict` and removes its own staging. The files in place are those of the first. A failure that the flow knows (a rejection or a conflict) removes the staging of this operation. Any other failure answers `unknown` with the operation identifier and leaves the staging; the caller asks again with the same identifier, and the recovery scan handles a crash. Recording the published package as a holding of the tenant is the caller's step, with `hold`.

No operation lists the assets of the domain. A reader reads one version record by its key. The recovery scan takes the asset reference of a staging from its meta file. It checks the versions in place from the directories: a version is the package digest of its manifest, so the files of a version directory must give back the digest that the directory name holds; the identity that it reports is the category of the namespace and the name of the directory. The read handler reads at most five rows for one request: the held-capability read takes the domain row, the held-capability index row, the holding, the asset and the selected version. The files are not written with `fsync`. A swap does not remove an older version: its directory stays. The option `afterPackageStep` is a test seam: it runs after the staging step and after the record step, and a throw there stands for a crash at that point.

## Results and lifetime

Mutation operation IDs identify the original request across restarts. A duplicate identical operation returns its original result. Reusing the ID for different command content returns `operation_conflict`. A revision conflict is a durable original rejection. A lost response returns `unknown`; callers recover with the original operation ID rather than inventing a new request.

The SQL provider owns commit durability and receipts. Asset mutation, owner sequence, current pointer and holding changes share its transaction. A success is returned only from a matching committed receipt. An unrecognized receipt remains unknown.

`close` rejects new operations and waits for accepted operations. The caller closes shared storage after every consumer drains.

## Verification responsibility

[Package tests](tests/README.md) exercise public operations with real SQLite Workers, including both holding-removal/setting-write orders. Reopen and lost-reply tests verify ordinary durable recovery. The separate settings-governance suite exercises real Identity, independent targets and Assets through one Settings application. These tests do not certify power-loss behavior, hardware durability or complete product adoption. The composition owner provides those applicable independent acceptance results.


## Source provenance

New holdings and `updateSources` require complete stable source identities. The holding stores this layout. Projection adds the selected owner revision as the current local authority revision. An owner command cannot choose that token. Changing the stable layout advances holding and owner revisions. The Settings participant separately checks the identity binding of stored values. Changing an owner or subject under the same source ID cannot transfer those values.
