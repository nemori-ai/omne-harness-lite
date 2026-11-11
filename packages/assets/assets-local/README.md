# assets-local

This package persists published asset bodies and tenant holdings through the SQL storage Worker. It provides current asset facts to Settings in the same transaction as a setting change. The [behavior contract](SPEC.md) describes the supported scope. The [internal design](docs/internals.md) explains storage ownership and recovery.

`createAssetsLocal` is a trusted deployment or target-owner capability. Do not expose it as a tenant settings service. The caller owns the `SqlStorage` lifetime and supplies category contracts through `categories`. Publication derives Settings declarations from the fixed body through that category contract. Callers cannot supply a separate Settings declaration.

## Use

Import the package by its public name:

```ts
import {
  assetsSettingsProjectionCommand,
  assetsSqlMaterials,
  createAssetsLocal,
} from '@omne-harness/assets-local'
```

Combine `assetsSqlMaterials()` with the consumer's SQL materials. Register the resulting combination before creating the owner with `{ storage, domain, combinationVersion, manifestDigest, categories }`. The domain must be a tenant domain.

A consumer calls `assetsSettingsProjectionCommand(binding)` and consumes `settings.assets-projection` through the public Settings projection schema.

The owner supports these operations:

- `readAsset` returns the current asset publication revision and latest-version reference, or explicit absence. Use its `revision` for a conditional publication; `ownerRevision` is a different sequence.
- `publish` takes an `operationId`, `assetRef`, `pinned` body and `expectedRevision`. Use revision `0` for the first version.
- `hold` takes a fresh `holdingRef`, tenant `scopeRef`, `assetRef`, version selection, ordered source identities and grants. A successful new holding has revision `1`.
- `changeHolding` takes the holding identity, `expectedRevision` and one change: `remove`, `setEnabled`, `selectVersion`, `updateSources` or `updateGrants`. `setEnabled` carries an `enabled` boolean.
- `readHolding` returns the holding and its selected version. Removed holdings return `selected: null`.
- `readVersion` returns an immutable published version.
- `getOperation` retrieves the original result by operation ID, including after a lost reply.
- `close` stops admission and drains accepted calls. It leaves the shared storage open.

Disabled holdings keep their values and remain visible in management. Runtime capture refuses them. Enabling changes the current owner revision and requires a new current read. A removed holding cannot be enabled again.

Types are exported from [src/index.ts](src/index.ts). [Tests](tests/README.md) contain complete SQLite combination examples.

## Supported boundary

This package implements durable owner facts and Settings guards. It does not implement general asset governance, distribution, sharing, organization creation, Identity principal verification or Assembly adoption. The composition owner must authorize callers before invoking the trusted capability. Runtime target selection remains the consumer's responsibility.

## Verification

Run `pnpm run build`, `pnpm run typecheck` and `pnpm run test:fast` in this directory. Tests use real SQLite Workers. They do not require an external service.
