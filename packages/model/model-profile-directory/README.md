# Model profile directory

Adopted `capability.model-profile-directory/v3` and `data.model-profile/v3`, implemented through the [D075 provider projection](../../../.meta_harness/design/realization/packages/model/model-profile-directory/v3-design.md). This package owns the durable catalog, append-only configuration revision facts, official manifest state and tenant credential bindings.

The root export contains five pure judgments and service/configuration types. `./plugin` contains the two Cordis plugins and schemas; `./migrations` contains `modelProfileDirectoryMigrations`; restricted `./tx-reads` contains `createCredentialBindingReader`. The authoritative directory exists as a service.

The examples below consume authenticated tenant identities and already assembled storage, clock and real memberships. They do not create identities or prove login provenance. The declaration binding may be saved before its implementation is registered; runtime invocation must still acquire the exact version.

Use the pure judgments without Cordis:

```typescript
import assert from 'node:assert/strict'
import { scopeChain, winningRow, configEligibility, credentialSlot } from '@omne-harness-lite/model-profile-directory'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'
import type { TenantId } from '@omne-harness-lite/identity-values'

export function choose(rows: readonly ProfileRow[], tenant: TenantId) {
  assert.deepEqual(scopeChain(tenant).map(scope => scope.layer), ['tenant', 'organization', 'factory'])
  assert.equal(configEligibility(tenant, { layer: 'tenant', tenant }, { standing: 'effective', role: 'member' }), 'eligible')
  assert.deepEqual(credentialSlot(undefined, 'custom', true), { present: false })
  return winningRow(rows, 'demo/model', rows.map(row => row.profile.routeName))
}
```

Mount the manager after `storage`, `clock` and `memberships` are ACTIVE. Mode is required. `management` provides `modelCatalog`; `singleProcessCatalog` also provides `modelCatalogRead`. `developmentBaseFaces` preserves a development shape whose credential value service explicitly returns `unavailable` because center resolution is outside this delivery.

```typescript
import type { Context } from '@deepseek-ai/cordis'
import { modelProfileDirectoryPlugin } from '@omne-harness-lite/model-profile-directory/plugin'
import type { OfficialManifest } from '@omne-harness-lite/model-profile-directory'

export async function mountDirectory(ctx: Context, officialManifest: OfficialManifest) {
  return await ctx.plugin(modelProfileDirectoryPlugin, {
    faceMode: 'singleProcessCatalog',
    officialManifest,
  })
}
```

Manage custom profiles and tenant bindings through the real service. Patches replace whole members; `remove: ['parameters']` removes only that optional member. `adaptation` is never removed or patched partially. Withdrawal keeps identity and configuration history, and emits once after commit; relist preserves the row.

```typescript
import assert from 'node:assert/strict'
import type { ModelCatalog } from '@omne-harness-lite/model-profile-directory'
import type { TenantId } from '@omne-harness-lite/identity-values'

export async function manageModels(catalog: ModelCatalog, tenant: TenantId) {
  const scope = { layer: 'tenant', tenant } as const
  const created = await catalog.registerProfile(tenant, scope, {
    routeName: 'demo/model', origin: 'custom', providers: ['provider-a'], allowFallback: false,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 8192, maxOutputTokens: 2048, inputConstraints: {},
    adaptation: {
      implementation: { name: 'publisher-implementation', revision: 'impl-1' },
      definition: { modelId: 'demo/model', revision: 'definition-1' },
      configuration: { revision: 'configuration-1', values: {} },
    },
  })
  assert.ok('profile' in created)
  const revised = await catalog.updateProfile(tenant, created.ref, { replace: { allowFallback: true } })
  assert.ok('profile' in revised)
  assert.equal(revised.profile.updatedAt, created.profile.updatedAt)
  assert.deepEqual(await catalog.readProfile(tenant, created.ref), revised)
  const rows = await catalog.listProfiles(tenant)
  assert.ok(Array.isArray(rows))
  await catalog.withdrawProfile(tenant, created.ref)
  await catalog.relistProfile(tenant, created.ref)
  const bound = await catalog.bindCredential(tenant, tenant, 'trusted-source-reference')
  assert.ok('boundAt' in bound)
  assert.deepEqual(await catalog.credentialPresent(tenant, 'custom'), {
    present: true, scope: { layer: 'tenant', tenant }, boundAt: bound.boundAt,
  })
  assert.deepEqual(await catalog.unbindCredential(tenant, tenant), { tenant, present: false })
  return rows
}
```

Trusted assembly composes migrations before service activation. No table is created by the plugins. A v2 profile lacking adaptation must receive an authorized v3 migration decision; this package does not invent a binding. The reader closure locks the actual tenant binding in a live unit and is executed only by CCL or P-1r.

```typescript
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory/migrations'
import { composeMigrations } from '@omne-harness-lite/storage'
import type { AtomicStorage, MigrationFragment } from '@omne-harness-lite/storage'

export function trustedAssemblyInputs(storage: AtomicStorage, otherOwnerMigrations: readonly MigrationFragment[]) {
  const migrations = composeMigrations([...otherOwnerMigrations, ...modelProfileDirectoryMigrations])
  const readCredentialBindingIn = createCredentialBindingReader(storage)
  // Pass this real closure to the unique CCL component. Bootstrap never executes it.
  return { migrations, readCredentialBindingIn }
}
```

P-1r borrows only the actual CCL reader. It requires the same `AtomicStorage`, provides only `credentialLookup`, and owns neither CCL nor its close capability. Optional `factoryCredential` is a current-value closure, used only for an unbound official profile. An existing tenant binding never falls back. `value` contains owned nonempty bytes; this package does not assume UTF-8.

```typescript
import type { Context } from '@deepseek-ai/cordis'
import { localCredentialLookupPlugin } from '@omne-harness-lite/model-profile-directory/plugin'
import type { LocalCredentialLookupConfig } from '@omne-harness-lite/model-profile-directory'

export async function mountLocalLookup(ctx: Context, readBoundReplicaIn: LocalCredentialLookupConfig['readBoundReplicaIn']) {
  return await ctx.plugin(localCredentialLookupPlugin, {
    mode: 'localCredentialOnly', readBoundReplicaIn,
  })
}
```

Tests exercise temporary SQLite files, two connections, genuine Cordis providers and the public memberships standing result. Their trusted rows and unused account/login fixture ports do not establish real authentication. Root assembly owns the real CCL/bootstrap/symbol-guard integration. PostgreSQL, full outpost/center synchronization and generic CCL operations are not verified here. Provider disposal closes admission and waits admitted methods, retaining facts and leaving borrowed resources open. Diagnostics contain bounded operation/phase/outcome facts, excluding values, references and secrets.
