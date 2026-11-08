import { randomUUID } from 'node:crypto'
import { tenantEquals } from '@omne-harness/legal-identity'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { symbols, type Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SqlStorage, TenantDomainLookup, TenantDomains } from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { createToolHistoryMigration } from '@omne-harness/tool'
import { defaultResultPolicy } from '@omne-harness/tool-contract/provider'
import { createLocalHistoricalDeliveryMaintenance } from '@omne-harness/tool-host-local'
import {
  createSqlToolHistoryCallSource,
  createSqlToolHistoryLedgerStore,
  createSqlToolHistoryCopies,
  createSqlToolHistorySourceReader,
  createSqlToolLedgerStore,
  createSqlToolGuardedHostCommit,
  createSqlToolMaterialStore,
} from '@omne-harness/tool-storage-sql'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY } from '../../entry/tool-history-upgrader.ts'
import { TOOL_READ_ARGUMENTS } from '../../entry/tool-read-budget.ts'
import { systemActionAuthorizationKey } from '../authorization/system-action-service.ts'
import { createToolHistoryAuthority } from '../authorization/tool-history-access.ts'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { toolRuntimeHolder, TOOL_MATERIAL_PROVIDER } from './holder.ts'
import type { ToolRuntimeConfig } from './config.ts'
import { checkToolHistory } from './history-startup.ts'

export const HISTORY_DEPENDENCIES = [
  tenantDomainsKey,
  TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
  TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY,
  systemActionAuthorizationKey,
] as const

export async function checkReleaseToolHistory(
  ctx: Context,
  config: ToolRuntimeConfig,
): Promise<() => boolean> {
  const keys = [storageKey, tenantDomainLookupKey, ...HISTORY_DEPENDENCIES]
  const original = (value: unknown) =>
    typeof value === 'object' && value !== null
      ? (Reflect.get(value, symbols.original) ?? value)
      : value
  const dependencies = keys.map(key => original(ctx.get(key)))
  let active = true
  ctx.effect(
    () => () => {
      active = false
    },
    'tool-records.history',
  )
  const current = () =>
    active &&
    ctx.fiber.uid !== null &&
    keys.every((key, index) => original(ctx.get(key)) === dependencies[index])
  const live = async <T>(work: () => Promise<T>): Promise<T> => {
    if (!current()) throw new Error('tool history dependencies were withdrawn')
    const answer = await work()
    if (!current()) throw new Error('tool history dependencies were withdrawn')
    return answer
  }
  const source = ctx.get(storageKey) as SqlStorage
  const storage: SqlStorage = {
    registerCombination: request => live(() => source.registerCombination(request)),
    commit: (request, options) => live(() => source.commit(request, options)),
    query: request => live(() => source.query(request)),
    read: (request, options) => live(() => source.read(request, options)),
  }
  const directory = ctx.get(tenantDomainLookupKey) as TenantDomainLookup
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind !== 'manifest') throw new Error('tool history storage manifest is unavailable')
  const options = {
    storage,
    domains: directory,
    combination: { combinationVersion: config.combinationVersion, manifestDigest: manifest.digest },
  }
  const authority = createToolHistoryAuthority(() =>
    current() ? ctx.get(systemActionAuthorizationKey) : undefined,
  )
  const materialOptions = {
    ...options,
    provider: TOOL_MATERIAL_PROVIDER,
    maxCommandBytes: config.maxCommandBytes,
    maxChunkBytes: config.maxChunkBytes,
  }
  const migration = createToolHistoryMigration({
    adoption: {
      owner: '@omne-harness/harness-server',
      name: 'tool-history-upgrade',
      revision: '1',
      digest: 'sha256:tool-history-upgrade/1',
    },
    store: createSqlToolHistoryLedgerStore(options),
    authority,
    copies: createSqlToolHistoryCopies(options),
    sourceReader: createSqlToolHistorySourceReader(options),
    materials: {
      provider: TOOL_MATERIAL_PROVIDER,
      store: createSqlToolMaterialStore(materialOptions),
      clock: toolRuntimeHolder(ctx).materialClock,
    },
    resultPolicy: defaultResultPolicy,
    configuration: { ...config.configuration, readResultArguments: TOOL_READ_ARGUMENTS },
  })
  const domains = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
  const scanner = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
  const answer = await checkToolHistory({
    ...(config.history.mode === 'upgrade'
      ? {
          upgrade: {
            attempts: config.configuration.ledgerCommitAttempts,
            operation() {
              const operation = decodeToolOperationId(randomUUID())
              if ('failure' in operation) throw new Error('invalid generated upgrade operation')
              return operation.ok
            },
            interpretations(access) {
              return (
                config.history.interpretations.find(entry => {
                  const tenant = tenantCodec.parse(entry.tenant)
                  return (
                    tenant.ok &&
                    tenantEquals(tenant.value, access.tenant) &&
                    entry.call === access.call
                  )
                })?.values ?? []
              )
            },
          },
        }
      : {}),
    current,
    principal: ctx.get(TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY),
    migration,
    calls: createSqlToolHistoryCallSource(options),
    host: createLocalHistoricalDeliveryMaintenance({
      store: createSqlToolLedgerStore(options),
      guarded: createSqlToolGuardedHostCommit(options),
      authority,
      commitAttempts: config.configuration.ledgerCommitAttempts,
    }),
    async enumerate() {
      const answer = await live(() => domains.enumerate({ principal: scanner }))
      if (answer.kind !== 'ready')
        return fail({
          kind: 'unavailable',
          dependency: 'tool-history-startup',
          diagnostic: 'tenant inventory is unavailable',
        })
      const tenants = []
      for (const entry of answer.entries) {
        const tenant = tenantCodec.parse(entry.tenant)
        if (!tenant.ok)
          return fail({
            kind: 'unavailable',
            dependency: 'tool-history-startup',
            diagnostic: 'tenant inventory is invalid',
          })
        tenants.push(tenant.value)
      }
      return succeed(tenants)
    },
  })
  if ('failure' in answer)
    throw new Error(`tool-records: historical startup refused (${answer.failure.kind})`)
  return current
}
