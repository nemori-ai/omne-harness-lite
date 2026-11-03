// Tool 运行时组的五行（B 段，R2-D66 第 3 项，L-TOOL 事实清单 §3）：一次 `createLocalToolRuntimePlugins` 返回的
// 六个插件分装到五行，每行一个 fiber，全部共用一份记录仓、账本、启动协调器和 driver：
// - `tool-records`：records 插件，提供 `toolCommands`、`toolReads`、`toolStartAuthority`、`toolStartFence`（同提供者
//   组 `tool-start`）。本行在受信存储子树内建 SQL 记录仓、输出保管与守护提交，交给共享状态；整组的运维者配置也只在
//   本行（bundle 建一次就要全部数值）。会话工作主体（受信，按调用现取）也由本行交给共享状态，供恢复时重签。
// - `tool-runtime`：门面插件，提供 `toolRuntime`。
// - `tool-executor`：实例宿主与长期执行宿主。实例宿主提供 `toolInstanceHost`，执行宿主以子 fiber 静态 inject 它。
// - `tool-instances`：实例目录，提供 `toolInstances`，inject `toolPublicationAuthority`。
// - `tool-environments`：环境适配，提供 `toolEnvironments`，以 integrator 调用方 inject `executionEnvironment`；
//   本行建执行域的 schema-provider，供环境需求校验，行撤除时关闭。
// 四行等 `tool-records` 建好 bundle 再装；`tool-records` 一直不装时它们停在装载中，不答就绪。
// 已知限制：bundle 每次运行只建一次，实例宿主与执行宿主不能在同一运行里重装（成员抛出，行 FAILED）。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { Principal } from '@omne-harness/identity'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import { sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  toolClockKey,
  toolCommandsKey,
  toolEnvironmentsKey,
  toolInstanceHostKey,
  toolInstancesKey,
  toolPublicationAuthorityKey,
  toolReadsKey,
  toolRuntimeKey,
  toolStartAuthorityKey,
  toolStartFenceKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createSqlToolGuardedHostCommit,
  createSqlToolLedgerStore,
  createSqlToolOutputCustody,
} from '@omne-harness/tool-storage-sql'
import {
  closeEnvironmentSchemaProvider,
  createEnvironmentSchemaProvider,
} from '../../entry/schema-domain.ts'
import { defineRow } from '../../row.ts'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { ensureToolRuntimeBundle } from './bundle.ts'
import { toolRuntimeConfigSchema, type ToolRuntimeConfig } from './config.ts'
import { awaitBundle, toolRuntimeHolder } from './holder.ts'

const INTEGRATOR = { [executionEnvironmentKey]: { caller: 'integrator' as const } }

/** `tool-records` 在受信存储子树里建 SQL 端口并交给共享状态；行撤除时收回。 */
function mountSql(ctx: Context, config: ToolRuntimeConfig): void {
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(
      `tool-records: the session composite is not registrable: ${manifest.diagnostic}`,
    )
  // The row's static inject guarantees both names are ACTIVE when the body runs.
  const storage = ctx.get(storageKey) as SqlStorage
  const domains = ctx.get(tenantDomainLookupKey) as TenantDomainLookup
  const options = {
    storage,
    domains,
    combination: { combinationVersion: config.combinationVersion, manifestDigest: manifest.digest },
  }
  const sql = Object.freeze({
    store: createSqlToolLedgerStore<ToolMessageContentBlock>(options),
    custody: createSqlToolOutputCustody<unknown>({
      ...options,
      maxCommandBytes: config.maxCommandBytes,
      maxChunkBytes: config.maxChunkBytes,
    }),
    guarded: createSqlToolGuardedHostCommit(options),
  })
  const holder = toolRuntimeHolder(ctx)
  const work = (): SessionWorkPrincipals<Principal> | undefined => ctx.get(sessionWorkPrincipalsKey)
  holder.sql = sql
  holder.workPrincipals = work
  ctx.effect(
    () => () => {
      if (holder.sql === sql) holder.sql = null
      if (holder.workPrincipals === work) holder.workPrincipals = () => undefined
    },
    'tool-records.sql',
  )
}

const recordsPlugin: Plugin.Object = {
  name: 'tool-records',
  inject: [storageKey, tenantDomainLookupKey],
  Config: toolRuntimeConfigSchema,
  apply(ctx: Context, value: unknown) {
    const config = toolRuntimeConfigSchema.parse(value)
    mountSql(ctx, config)
    const bundle = ensureToolRuntimeBundle(ctx, config)
    bundle.records.apply(ctx)
  },
}

export const toolRecordsRow = defineRow({
  row: 'tool-records',
  implementation: 'real',
  manifest: {
    provides: [toolCommandsKey, toolReadsKey, toolStartAuthorityKey, toolStartFenceKey],
    injects: [storageKey, tenantDomainLookupKey],
    sameProviderGroup: 'tool-start',
  },
  lifecycle: { kind: 'none' },
  plugin: recordsPlugin,
})

export const toolRuntimeRow = defineRow({
  row: 'tool-runtime',
  implementation: 'real',
  manifest: {
    provides: [toolRuntimeKey],
    injects: [toolCommandsKey, toolReadsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'tool-runtime',
    inject: [toolCommandsKey, toolReadsKey],
    async apply(ctx: Context) {
      const bundle = await awaitBundle(ctx)
      bundle.runtime.apply(ctx)
    },
  },
})

export const toolExecutorRow = defineRow({
  row: 'tool-executor',
  implementation: 'real',
  manifest: {
    provides: [toolInstanceHostKey],
    injects: [toolCommandsKey, toolClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'tool-executor',
    inject: [toolCommandsKey, toolClockKey],
    async apply(ctx: Context) {
      const bundle = await awaitBundle(ctx)
      await bundle.instanceHost.apply(ctx)
      // The long-term executor statically injects the instance host this row just provided.
      ctx.plugin(bundle.executor)
    },
  },
})

export const toolInstancesRow = defineRow({
  row: 'tool-instances',
  implementation: 'real',
  manifest: {
    provides: [toolInstancesKey],
    injects: [toolPublicationAuthorityKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'tool-instances',
    inject: [toolPublicationAuthorityKey],
    async apply(ctx: Context) {
      const bundle = await awaitBundle(ctx)
      bundle.instances.apply(ctx)
    },
  },
})

const environmentsPlugin: Plugin.Object = {
  name: 'tool-environments',
  inject: INTEGRATOR,
  async apply(ctx: Context) {
    const bundle = await awaitBundle(ctx)
    const holder = toolRuntimeHolder(ctx)
    const provider = createEnvironmentSchemaProvider()
    holder.schemaProvider = provider
    ctx.effect(
      () => () => {
        if (holder.schemaProvider === provider) holder.schemaProvider = null
        closeEnvironmentSchemaProvider(provider)
      },
      'tool-environments.schema-provider',
    )
    bundle.environments.apply(ctx)
  },
}

export const toolEnvironmentsRow = defineRow({
  row: 'tool-environments',
  implementation: 'real',
  manifest: {
    provides: [toolEnvironmentsKey],
    injects: [executionEnvironmentKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: environmentsPlugin,
})
