// Tool 运行时组的五行（B 段，R2-D66 第 3 项，L-TOOL 事实清单 §3）：一次 `createLocalToolRuntimePlugins` 返回的
// 六个插件分装到五行，每行一个 fiber，全部共用一份记录仓、账本、启动协调器和 driver：
// - `tool-records`：records 插件，提供 `toolCommands`、`toolReads`、`toolStartAuthority`、`toolStartFence`（同提供者
//   组 `tool-start`）。本行在受信存储子树内建 SQL 记录仓与输出保管，交给共享状态；整组的运维者配置也只在
//   本行（bundle 建一次就要全部数值）。会话工作主体（受信）不经本行：入口对象 `toolClock` 安装时把入口自己的
//   受信读口交给共享状态（`entry/tool-runtime-objects.ts`），本行的可见集合不变。
// - `tool-runtime`：门面插件，提供 `toolRuntime`。
// - `tool-executor`：实例宿主与长期执行宿主。实例宿主提供 `toolInstanceHost`，执行宿主以子 fiber 静态 inject 它。
// - `tool-instances`：实例目录，提供 `toolInstances`，inject `toolPublicationAuthority`。
// - `tool-environments`：环境适配，提供 `toolEnvironments`，以 integrator 调用方 inject `executionEnvironment`；
//   本行建执行域的 schema-provider，供环境需求校验，行撤除时关闭。
// 四行等 `tool-records` 建好 bundle 再装；`tool-records` 一直不装时它们停在装载中，不答就绪。
// 已知限制：bundle 每次运行只建一次，实例宿主与执行宿主不能在同一运行里重装（成员抛出，行 FAILED）。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { observeToolLedgerCommit } from '@omne-harness/tool'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { processInstance } from '../telemetry/instance.ts'
import { createToolLifecycleTelemetry } from './telemetry.ts'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'

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
  createSqlToolLedgerStore,
  createSqlToolMaterialStore,
} from '@omne-harness/tool-storage-sql'
import {
  closeEnvironmentSchemaProvider,
  createEnvironmentSchemaProvider,
} from '../../entry/schema-domain.ts'
import { defineRow, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { createReleaseBodySchemas } from '../../entry/tool-body-schemas.ts'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { ensureToolRuntimeBundle } from './bundle.ts'
import { toolRuntimeConfigSchema, type ToolRuntimeConfig } from './config.ts'
import { awaitBundle, toolRuntimeHolder, TOOL_MATERIAL_PROVIDER } from './holder.ts'

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
  const store = createSqlToolLedgerStore(options)
  const sql = Object.freeze({
    store: {
      ...store,
      commit: observeToolLedgerCommit(
        store.commit,
        createToolLifecycleTelemetry(() => ctx.get(telemetryKey, false), processInstance),
      ),
    },
    materials: createSqlToolMaterialStore({
      ...options,
      provider: TOOL_MATERIAL_PROVIDER,
      maxCommandBytes: config.maxCommandBytes,
      maxChunkBytes: config.maxChunkBytes,
    }),
  })
  const holder = toolRuntimeHolder(ctx)
  holder.sql = sql
  ctx.effect(
    () => () => {
      if (holder.sql === sql) holder.sql = null
    },
    'tool-records.sql',
  )
}

const recordsPlugin: Plugin.Object = {
  name: 'tool-records',
  inject: [storageKey, tenantDomainLookupKey, telemetryKey],
  Config: toolRuntimeConfigSchema,
  async apply(ctx: Context, value: unknown) {
    const config = toolRuntimeConfigSchema.parse(value)
    mountSql(ctx, config)
    const holder = toolRuntimeHolder(ctx)
    const body = createReleaseBodySchemas()
    holder.bodySchemas = body.schemas
    ctx.effect(
      () => () => {
        if (holder.bodySchemas === body.schemas) holder.bodySchemas = null
        body.close()
      },
      'tool-records.body-schemas',
    )
    const bundle = ensureToolRuntimeBundle(ctx, config)
    bundle.records.apply(ctx)
  },
}

export const toolRecordsRow = defineRow({
  row: 'tool-records',
  implementation: 'real',
  manifest: {
    provides: [toolCommandsKey, toolReadsKey, toolStartAuthorityKey, toolStartFenceKey],
    injects: [storageKey, tenantDomainLookupKey, telemetryKey],
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

/**
 * 执行宿主行体（业务阶段）：实例宿主装在行 fiber，长期执行宿主装在子 fiber（它静态 inject 本行刚提供的
 * `toolInstanceHost`）。业务停止时关闭 bundle：执行宿主退役、作者执行停止接新；期限内完成答 settled。
 */
async function executorBody(ctx: Context): Promise<RowHandle> {
  const bundle = await awaitBundle(ctx)
  await bundle.instanceHost.apply(ctx)
  const child = ctx.plugin(bundle.executor)
  await child
  let closing: Promise<void> | undefined
  let forwardingUnknown = 0
  return {
    stop: async deadline => {
      closing ??= (async () => {
        const forwarding = toolRuntimeHolder(ctx).toolsForwarding
        if (forwarding !== null) forwardingUnknown = (await forwarding.close()).unknown
        await bundle.close()
      })()
      const timer = monotonicClock.after(deadline - monotonicClock.now())
      const settled = await Promise.race([
        closing.then(
          () => 'settled' as const,
          () => 'failed' as const,
        ),
        timer.promise.then(() => 'deadline' as const),
      ])
      timer.cancel()
      switch (settled) {
        case 'settled':
          return forwardingUnknown === 0
            ? { kind: 'settled' }
            : {
                kind: 'incomplete',
                detail: `${forwardingUnknown} Tools forwarding associations remain unknown`,
              }
        case 'failed':
          return { kind: 'failed', detail: 'the tool runtime did not close cleanly' }
        case 'deadline':
          return { kind: 'incomplete', detail: 'the tool executor is still retiring' }
      }
    },
  }
}

export const toolExecutorRow = defineRow({
  row: 'tool-executor',
  implementation: 'real',
  manifest: {
    provides: [toolInstanceHostKey],
    injects: [toolCommandsKey, toolClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  body: executorBody,
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
