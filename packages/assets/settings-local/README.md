# Settings local provider

`@omne-harness/settings-local` provides persistent assignments, original-operation recovery, independent target ownership, and coherent Settings catalog capture through the public SQL storage contract. Its root entry has no Cordis dependency. The pure [Settings package](../settings/README.md) owns declarations, evaluation, change decisions, and query construction. This package supplies local state and coordination.

Independent targets use this package's persistent owner. Asset targets consume [assets-local](../assets-local/README.md) owner facts. Neither declaration registration nor runtime selection creates a target or grants access. Ordinary tenant services verify an issued Identity principal and bind every target to that principal's tenant. Trusted deployment maintenance has a separate capability described below.

Common types and Schemas are exported from [src/index.ts](src/index.ts). Prepared coordination is exported from [src/preparation.ts](src/preparation.ts). Non-type behavior belongs to [SPEC.md](SPEC.md). Read the Chinese [architecture explanation](docs/architecture.md) for module, object, and sequence diagrams, and [Identity coordination](docs/coordination.md) for reservations and recovery.

## Choose and register an assembly

The caller supplies a public `SqlStorage`, a fixed tenant transaction domain, a registered combination, and its manifest digest. Material factories describe participants, migrations, and handlers. The caller must register that combination before admitting requests.

For the catalog composition, combine these materials in one tenant domain:

- `settingsSqlMaterials()` supplies assignment persistence, operation terminals and source write protection.
- `settingsStandaloneMaterials({ settingsGuard: false })` supplies independent targets and their projection fact.
- `settingsCatalogMaterials()` supplies the central target guard and snapshot participant.
- The Asset owner's materials supply `settings.assets-projection`. An assembly without Assets uses `settingsWithoutAssetsMaterials()` instead.

Build one projection command function for that combination. The independent-only form uses real independent ownership and an explicit empty Asset contribution:

```ts
const project = (binding: SettingsProjectionBinding) => [
	standaloneSettingsProjectionCommand(binding),
	settingsWithoutAssetsProjectionCommand(binding),
]
const guards = createSettingsTargetGuards(project)
```

`SettingsProjectionBinding` and these factories come from this package's root entry. With Assets installed, replace the empty contribution with the Asset owner's public projection command. The independent owner has separate mutation and read-only projection participants. Use the command factories rather than hard-coding their IDs. Each owner fact has exactly one producer. The central guard rejects mismatched bindings or duplicate complete targets. Settings never reads Asset or Identity private tables.

For persistence without a catalog, `createSettingsSqlBackend` accepts a trusted `access` adapter and a same-transaction `guards` participant. `standaloneSettingsGuards` with default `settingsStandaloneMaterials()` supports the independent owner directly. Do not combine that direct guard producer with the central guard producer. Custom owner guards must implement the [fact protocol](SPEC.md#target-qualification).

## Prepared command service

The `@omne-harness/settings-local/preparation` entry provides the accepted prepare/commit/cancel/query protocol. `createSettingsPreparationBackend` accepts trusted assembly adapters. `createIdentityQualifiedSettingsPreparation` connects Identity verification, current tenant standing and actual reservations. Its system-domain form also requires organization-settings-manage; the target owner must still authorize the organization and action.

Give ordinary clients only the returned `service`. Register `control.destination` with Identity's trusted resolver. `control.close()` rejects new calls and drains accepted calls; it does not close the shared SqlStorage or erase durable pending work. Do not expose construction adapters or recovery control as client commands.

Register four fixed phase combinations from `settingsPreparationMaterials()` and the exported participant sets. Ready and commit also require the application's actual current-fact producers. Use these materials instead of the direct persistence writer set; registering both would claim the same tables twice. The constructor accepts fixed registration references, never participant choices from a client request.

```ts
const prepared = await backend.service.prepareChange(principal, command)
if (prepared.kind === 'prepared') {
  const result = await backend.service.commitChange(principal, {
    requestId: command.requestId,
    preparation: prepared.preparation,
  })
}
```

The preparation reference is not authority. Every call rechecks caller access, and commit consumes fresh transaction facts. `getOperation` only reads. An unknown reply retains the original operation identity. A confirmed SQL rollback seals that attempt before an explicit reprepare; an unknown SQL result does not permit that cleanup. Neither path rewrites expectedRevision or silently invents a replacement business operation.

Application consumers still use the direct command route below. Switching them requires the actual current and organization-source adapters, replacement of the old write route, and draining its old reservations. The library factory does not establish that migration or full application acceptance. See [prepared coordination](SPEC.md#protected-preparation-coordinator) for the behavioral contract.

## Provide a shared organization source

Use `createIdentityQualifiedSettingsSources` from the preparation entry for organization reads. Construct it with the fixed `system.settings` domain, owner disclosure adapter and a trusted destination router. Route both `recognize` and `seal` to the prepared destination's `control.sourceDestination`; ordinary clients cannot supply a resolver. Register `settingsSqlMaterials({ sourceCapture: true })` in the source database. The source snapshot and retention participants form its fixed source combination.

Pass the source provider's `service` as the prepared backend's `sources` port. It reserves an immutable source snapshot and settles only after a matching destination terminal. The control port exposes bounded hold recovery, pending-source-update enumeration and close/drain. Continue pages until `after` is null, even when a page contains fewer than the requested number of items. Source control belongs to trusted deployment and recovery code.

The provider does not decide organization policy precedence or complete application assembly. Those responsibilities remain with the actual current-fact producer and the organization's Settings owner. See [source reservation provider](SPEC.md#source-reservation-provider) for guarantees and remaining integration scope.

## Provide tenant services

1. Provision independent targets with `createStandaloneSettingsOwner`. Its `mutate` and `getOperation` are trusted owner capabilities. They are not tenant setting commands.
2. Create a pure Settings registry and register live declarations. Registration represents declaration availability only.
3. Create `createSettingsCatalog` with the fixed deployment, registry, Identity verifier and reservations, projection commands, clock, and cursor lifetime. Its `access` adapter can authorize the persistence backend against current target facts.
4. Use `createIdentityQualifiedSettings` from `@omne-harness/settings-local/identity` for ordinary tenant writes and storage reads. Supply Identity's public verifier, standing source, and reservation service. Install `createSettingsStandingDestination` only in Identity's trusted recovery resolver.
5. Pass the catalog to Settings `createSettingsQueries`, and the qualified backend to `createSettingsCommands`. The complete assembly is illustrated by [catalog-world.ts](tests/catalog-world.ts); its test setup is not a production deployment configuration.

Management views discover qualified targets even when they have no runtime selection. Runtime views require a trusted `SettingsSelectionSource`. `createSettingsSelections` provides bounded, expiring in-memory selections tied to a verified principal and deployment. Selection records express consumer intent. They do not authorize targets or prove that Assembly or an executor adopted the settings.

Each catalog page reauthorizes and captures owner facts plus Settings state in a fresh tenant transaction. A transient Identity reservation protects qualification during that capture. Registry generations are checked before and after capture. An unavailable declaration produces a partial management catalog; evaluation and runtime reads require completeness. Old cursors fail when the captured basis changes or its expiry epoch advances. The catalog retains the maximum observed wall-clock value, so an observed expiry cannot revive after clock rollback. Restart changes the catalog incarnation and invalidates its old cursors.

Releasing a registry contribution preserves assignments and changes read availability. It does not atomically remove write authorization. Retire the independent target or remove/change the Asset holding through its owner to invalidate target authority. See [SPEC.md](SPEC.md#declaration-availability-and-target-invalidation).

## Maintain stored assignments

`createSettingsMaintenance` is a trusted deployment-owner capability. Keep it outside ordinary tenant, tool, HTTP, and SDK handlers. It deliberately uses the fixed `maintenance/<ownerRef>` identity without tenant qualification reservations. Possession and routing of this capability are the deployment owner's responsibility.

Its `rebase` requires exact old and new definition references, the expected assignment revision, and a retain/discard choice for every stored assignment. It consumes current facts from the same target owner and commits state, operation recovery, changes, and terminal together. It does not migrate values by matching display names. Retained values must validate against the new declaration and sources. Mismatched old state stays unavailable to catalog evaluation until an explicit compatible rebase succeeds. A held source reservation or pending source update blocks direct rebase with `basis_changed`. The same protection applies to assignments and independent-target mutations. Catalog reads and original committed receipts remain available. This is not a tenant authorization extension.

## Recover and close

`unknown` means the result is undetermined. Recover with the same target, principal, and `operationId`; do not allocate a replacement operation. A changed semantic payload under that identity returns `operation_conflict`. `requestId` identifies only the transport attempt. Storage reads and operation lookups recheck access, so later revocation can deny readback without undoing a historical success.

Backend and catalog `close()` stop admission and drain accepted work. The shared SQL provider and Identity service remain caller-owned. Close local services before their shared dependencies. Close the registry and selection holder explicitly. Unsettled Identity reservations remain durable recovery work; closing a service does not release them.

## Runtime and verification limits

Node.js 24 or newer is required. SQL engine, Worker execution, transactions, and durability behavior come from the public [SQL contract](../../storage/sql-contract/SPEC.md) and selected provider. The package adds no private cross-owner table access, background expiry timer, unbounded snapshot cache, or automatic SQL receipt garbage collection. Configure storage admission and retention through that provider's public contract.

Ordinary secret assignment commands are unsupported. Catalogs expose safe declaration metadata and an absent value for secret items, not secret plaintext. Receipts and changes contain no assignment values.

Run the package build before tests because Worker fixtures import built modules:

```sh
pnpm --filter @omne-harness/settings-local run build
pnpm --filter @omne-harness/settings-local run typecheck
pnpm --filter @omne-harness/settings-local run test:fast
```

[tests/README.md](tests/README.md) separates guard-fixture conformity, real Identity coordination, independent ownership, catalog coverage, and the Asset-owned three-domain suite. These tests do not establish final UI delivery, a tools or Cordis plugin, Calendar adoption, remote authentication, physical power-loss recovery, independent acceptance, or system integration.

## Maintenance entry points

Change assignment semantics in Settings first, then update persistence and its conformity tests. Change target existence, declarations, versions, or sources in the actual target owner and its invalidation writers. Change capture bindings in [projection.ts](src/projection.ts) together with both owner producers and the catalog tests. Keep the public behavior, assembly instructions, diagrams, and test guide aligned when those boundaries change.

For a source update, use `control.recoverSource(source, page)` to drain only the affected source. Continue through returned cursors and retry unavailable items in a later scan from null. A prepared source update with outstanding holds returns rejected/unavailable and remains pending. Retry its original preparation after settlement; the final business transaction still checks the exact gate and current authority.
