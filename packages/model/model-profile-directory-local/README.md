# Model profile directory

The current directory consumes adopted `capability.model-profile-directory/v5` and `data.model-profile/v5` under D100, through the [current provider projection](../../../.meta_harness/design/realization/packages/model/model-profile-directory/v5-current-design.md). It owns the durable catalog, append-only configuration revision facts, official manifest state and tenant credential bindings.

The definition package `@omne-harness-lite/model-profile-directory` owns the pure judgments and service protocols. This provider root exports its configuration types. `./cordis` contains the two Cordis plugins and schemas; `./migrations` contains `modelProfileDirectoryMigrations`; restricted `./tx-reads` contains `createCredentialBindingReader`. The authoritative directory exists as a service.

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
import { modelProfileDirectoryPlugin } from '@omne-harness-lite/model-profile-directory-local/cordis'
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
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' }, maxRequestBytes: { status: 'unknown' },
    },
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
  const changed = await catalog.updateProfile(tenant, created.ref, { replace: {
    maxInputTokens: 4096,
    upstreamInputLimits: { maxInputTokens: { status: 'limited', value: 4096 }, maxRequestBytes: { status: 'unknown' } },
  } })
  assert.ok('profile' in changed)
  assert.equal(changed.profile.maxInputTokens, 4096)
  assert.deepEqual(changed.profile.upstreamInputLimits.maxInputTokens, { status: 'limited', value: 4096 })
  assert.deepEqual(await catalog.updateProfile(tenant, created.ref, { replace: {
    upstreamInputLimits: { maxInputTokens: { status: 'limited', value: 3000 } },
  } }), { failure: 'invalidInput', reason: 'malformed' })
  assert.deepEqual(await catalog.readProfile(tenant, created.ref), changed)
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

An old stored row missing either required upstream fact is unreadable as the current format: `readProfile` returns `unavailable`, and a visible old row makes the entire `listProfiles` call unavailable. The directory leaves those bytes and configuration history unchanged. Changed upstream facts, caps or modalities use one complete row write; a clock reading earlier than the old `updatedAt` returns `unavailable` without writing or advancing manifest state. The directory does not upgrade or infer missing facts.

Trusted assembly composes storage migrations before service activation. No table is created by the plugins, and the directory performs no legacy profile conversion. The reader closure locks the actual tenant binding in a live unit and is executed only by CCL or P-1r.

```typescript
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory-local/migrations'
import { composeMigrations } from '@omne-harness-lite/storage'
import type { AtomicStorage, MigrationFragment } from '@omne-harness-lite/storage'

export function trustedAssemblyInputs(storage: AtomicStorage, otherOwnerMigrations: readonly MigrationFragment[]) {
  const migrations = composeMigrations([...otherOwnerMigrations, ...modelProfileDirectoryMigrations])
  const readCredentialBindingIn = createCredentialBindingReader(storage)
  // Pass this real closure to the unique CCL component. Bootstrap never executes it.
  return { migrations, readCredentialBindingIn }
}
```

P-1r borrows only the actual CCL reader. It requires the same `AtomicStorage`, provides only `credentialLookup`, and owns neither CCL nor its close capability. The required `boundCredentialReplicaReader` service exposes the actual CCL reader. The optional `factoryModelCredential` service is looked up on each request and used only for an unbound official profile. Plugin configuration contains data only. An existing tenant binding never falls back. `value` contains owned nonempty bytes; this package does not assume UTF-8.

```typescript
import type { Context } from '@deepseek-ai/cordis'
import { localCredentialLookupPlugin } from '@omne-harness-lite/model-profile-directory-local/cordis'
// Trusted assembly has already installed BoundCredentialReplicaReaderService.

export async function mountLocalLookup(ctx: Context) {
  return await ctx.plugin(localCredentialLookupPlugin, {
    mode: 'localCredentialOnly',
  })
}
```

Tests exercise temporary SQLite files, two connections, genuine Cordis providers and the public memberships standing result. Their trusted rows and unused account/login fixture ports do not establish real authentication. Root assembly owns the real CCL/bootstrap/symbol-guard integration. PostgreSQL, full outpost/center synchronization and generic CCL operations are not verified here. Provider disposal closes admission and waits admitted methods, retaining facts and leaving borrowed resources open. Diagnostics contain bounded operation/phase/outcome facts, excluding values, references and secrets.
