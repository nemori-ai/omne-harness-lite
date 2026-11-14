import type { Context, Plugin } from '@deepseek-ai/cordis'
import { observeToolLedgerCommit } from '@omne-harness/tool'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { processInstance } from '../telemetry/instance.ts'
import { createToolLifecycleTelemetry } from './telemetry.ts'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { SystemPrincipal } from '@omne-harness/identity'
import type { SqlStorage, TenantDomainLookup, TenantDomains } from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'

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
  createSqlToolBodyStore,
  createSqlToolConditionalCommit,
  createSqlToolLedgerStore,
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
import { mountToolHitl } from '../tool-hitl/mount.ts'
import { ensureToolRuntimeBundle, type ToolLostContact } from './bundle.ts'
import { toolRuntimeConfigSchema, type ToolRuntimeConfig } from './config.ts'
import { awaitBundle, toolRuntimeHolder } from './holder.ts'
import {
  ToolInvocationQualificationService,
  toolInvocationQualificationKey,
} from './source-qualification.ts'

const INTEGRATOR = { [executionEnvironmentKey]: { caller: 'integrator' as const } }

function mountSql(ctx: Context, config: ToolRuntimeConfig): void {
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(
      `tool-records: the session composite is not registrable: ${manifest.diagnostic}`,
    )
  const storage = ctx.get(storageKey) as SqlStorage
  const domains = ctx.get(tenantDomainLookupKey) as TenantDomainLookup
  const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
  const scanner = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY) as SystemPrincipal
  const options = {
    storage,
    domains,
    combination: { combinationVersion: config.combinationVersion, manifestDigest: manifest.digest },
  }
  const store = createSqlToolLedgerStore({
    ...options,
    tenants: () => directory.enumerate({ principal: scanner }),
  })
  const holder = toolRuntimeHolder(ctx)
  const { bodyPermitKey: permitKey, bodyClock: clock } = holder
  const sql = Object.freeze({
    store: {
      ...store,
      commit: observeToolLedgerCommit(
        store.commit,
        createToolLifecycleTelemetry(() => ctx.get(telemetryKey, false), processInstance),
      ),
    },
    bodies: { store: createSqlToolBodyStore({ ...options, permitKey, clock }), permitKey, clock },
    conditional: createSqlToolConditionalCommit(options),
  })
  holder.sql = sql
  mountToolHitl(ctx, options)
  ctx.effect(
    () => () => {
      if (holder.sql === sql) holder.sql = null
    },
    'tool-records.sql',
  )
}

export type ToolRecordsRowInput = Readonly<{ lostContact?: ToolLostContact }>

const recordsPluginOf = (input: ToolRecordsRowInput): Plugin.Object => ({
  name: 'tool-records',
  inject: [
    storageKey,
    tenantDomainLookupKey,
    tenantDomainsKey,
    TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
    telemetryKey,
  ],
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
    const bundle = ensureToolRuntimeBundle(ctx, config, input.lostContact)
    bundle.records.apply(ctx)
    new ToolInvocationQualificationService(ctx, bundle.qualification)
  },
})

export function createToolRecordsRow(input: ToolRecordsRowInput = {}) {
  return defineRow({
    row: 'tool-records',
    implementation: 'real',
    manifest: {
      provides: [
        toolCommandsKey,
        toolReadsKey,
        toolStartAuthorityKey,
        toolStartFenceKey,
        toolInvocationQualificationKey,
      ],
      injects: [
        storageKey,
        tenantDomainLookupKey,
        tenantDomainsKey,
        TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
        telemetryKey,
      ],
      sameProviderGroup: 'tool-start',
    },
    lifecycle: { kind: 'none' },
    plugin: recordsPluginOf(input),
  })
}

export const toolRecordsRow = createToolRecordsRow()

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
    await ctx.plugin(bundle.maintenance)
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
