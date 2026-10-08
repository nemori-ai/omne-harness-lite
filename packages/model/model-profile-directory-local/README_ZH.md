# 模型档案目录

当前目录按 D100 消费已采用的 `capability.model-profile-directory/v5`、`data.model-profile/v5`，沿[Public behavior](SPEC.md)实施。包拥有耐久目录、只追加的配置修订事实、官方清单状态和租户凭据绑定。

定义包 `@omne-harness-lite/model-profile-directory` 拥有纯判断和服务协议。本提供者根入口导出配置类型；`./cordis` 导出两个 Cordis 插件及配置 Schema；`./migrations` 导出 `modelProfileDirectoryMigrations`；受限 `./tx-reads` 导出 `createCredentialBindingReader`。权威目录以服务面存在。

下面例子消费已经认证的租户身份及装配好的 storage、clock 和真实 memberships，不建立身份或证明登录来源。结构合法的绑定可先于实现注册保存；调用运行时仍须取得精确版本。

纯判断可独立使用，不需要 Cordis：

```typescript
import assert from 'node:assert/strict'
import {
  scopeChain,
  winningRow,
  configEligibility,
  credentialSlot,
} from '@omne-harness-lite/model-profile-directory'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'
import type { TenantId } from '@omne-harness-lite/identity-values'

export function choose(rows: readonly ProfileRow[], tenant: TenantId) {
  assert.deepEqual(
    scopeChain(tenant).map(scope => scope.layer),
    ['tenant', 'organization', 'factory'],
  )
  assert.equal(
    configEligibility(
      tenant,
      { layer: 'tenant', tenant },
      { standing: 'effective', role: 'member' },
    ),
    'eligible',
  )
  assert.deepEqual(credentialSlot(undefined, 'custom', true), { present: false })
  return winningRow(
    rows,
    'demo/model',
    rows.map(row => row.profile.routeName),
  )
}
```

storage、clock、memberships ACTIVE 后装目录管理插件。模式必填：management 仅提供 modelCatalog；singleProcessCatalog 还提供 modelCatalogRead；developmentBaseFaces 保留开发形状，因中心解值未交付，取值明确答 unavailable。

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

通过真实服务管理自建档案和租户绑定。patch 整项替换；remove: ['parameters'] 只去掉该可缺席成员。adaptation 不可删除或嵌套局部修改。撤回保留身份与历史，提交后通知一次；恢复在册保留原行。

```typescript
import assert from 'node:assert/strict'
import type { ModelCatalog } from '@omne-harness-lite/model-profile-directory'
import type { TenantId } from '@omne-harness-lite/identity-values'

export async function manageModels(catalog: ModelCatalog, tenant: TenantId) {
  const scope = { layer: 'tenant', tenant } as const
  const created = await catalog.registerProfile(tenant, scope, {
    routeName: 'demo/model',
    origin: 'custom',
    providers: ['provider-a'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 8192,
    maxOutputTokens: 2048,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    adaptation: {
      implementation: { name: 'publisher-implementation', revision: 'impl-1' },
      definition: { modelId: 'demo/model', revision: 'definition-1' },
      configuration: { revision: 'configuration-1', values: {} },
    },
  })
  assert.ok('profile' in created)
  const revised = await catalog.updateProfile(tenant, created.ref, {
    replace: { allowFallback: true },
  })
  assert.ok('profile' in revised)
  assert.equal(revised.profile.updatedAt, created.profile.updatedAt)
  const changed = await catalog.updateProfile(tenant, created.ref, {
    replace: {
      maxInputTokens: 4096,
      upstreamInputLimits: {
        maxInputTokens: { status: 'limited', value: 4096 },
        maxRequestBytes: { status: 'unknown' },
      },
    },
  })
  assert.ok('profile' in changed)
  assert.equal(changed.profile.maxInputTokens, 4096)
  assert.deepEqual(changed.profile.upstreamInputLimits.maxInputTokens, {
    status: 'limited',
    value: 4096,
  })
  assert.deepEqual(
    await catalog.updateProfile(tenant, created.ref, {
      replace: {
        upstreamInputLimits: { maxInputTokens: { status: 'limited', value: 3000 } },
      },
    }),
    { failure: 'invalidInput', reason: 'malformed' },
  )
  assert.deepEqual(await catalog.readProfile(tenant, created.ref), changed)
  const rows = await catalog.listProfiles(tenant)
  assert.ok(Array.isArray(rows))
  await catalog.withdrawProfile(tenant, created.ref)
  await catalog.relistProfile(tenant, created.ref)
  const bound = await catalog.bindCredential(tenant, tenant, 'trusted-source-reference')
  assert.ok('boundAt' in bound)
  assert.deepEqual(await catalog.credentialPresent(tenant, 'custom'), {
    present: true,
    scope: { layer: 'tenant', tenant },
    boundAt: bound.boundAt,
  })
  assert.deepEqual(await catalog.unbindCredential(tenant, tenant), { tenant, present: false })
  return rows
}
```

旧行缺少必需的上游事实时，当前格式的 `readProfile` 返回 `unavailable`；可见的旧行使整次 `listProfiles` 返回 `unavailable`，原字节及配置历史不变。上游事实、cap 或模态变化按完整行写入；时钟早于原 `updatedAt` 时返回 `unavailable`，档案及清单状态不推进。本目录不推断缺失事实，也不自动升级旧数据。

可信装配在提供服务前合成存储迁移，插件不私建表，目录也不执行旧档案转换。reader 闭包在有效单元里锁实际租户绑定，仅由 CCL 或 P-1r 执行。

```typescript
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory-local/migrations'
import { composeMigrations } from '@omne-harness-lite/storage'
import type { AtomicStorage, MigrationFragment } from '@omne-harness-lite/storage'

export function trustedAssemblyInputs(
  storage: AtomicStorage,
  otherOwnerMigrations: readonly MigrationFragment[],
) {
  const migrations = composeMigrations([
    ...otherOwnerMigrations,
    ...modelProfileDirectoryMigrations,
  ])
  const readCredentialBindingIn = createCredentialBindingReader(storage)
  // Pass this real closure to the unique CCL component. Bootstrap never executes it.
  return { migrations, readCredentialBindingIn }
}
```

P-1r 只借用实际 CCL 读取闭包，使用同一个 AtomicStorage，只提供 credentialLookup，不持有 CCL 或 close 权限。必需的 boundCredentialReplicaReader 服务承载实际 CCL 读口。可选 factoryModelCredential 服务在每次请求时查询，仅供无绑定的官方档案使用。插件配置只含数据；已有租户绑定从不回落。value 是自有非空字节，本包不假设 UTF-8。

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

测试覆盖临时 SQLite 文件、双连接、真实 Cordis 提供者及公开 memberships standing 答复；可信测试行和未调用的账号/登录替身不证明真实认证。真实 CCL、bootstrap 与 symbol guard 联验归 root 装配。这里没有 PostgreSQL、完整据点/中心同步和 CCL generic 操作验证。撤除先停止准入再等实际在途方法，保留事实、不关闭借用资源。诊断只记有界操作/阶段/结果，不包含配置值、引用或秘密。
