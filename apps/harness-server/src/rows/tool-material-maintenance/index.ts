import { z } from 'zod'
import type { SqlStorage, TenantDomainLookup, TenantDomains } from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import {
  createLocalToolMaterialClock,
  createLocalToolMaterialMaintenance,
} from '@omne-harness/tool-host-local'
import {
  createSqlToolLedgerStore,
  createSqlToolMaterialStore,
  createSqlToolMaterialMaintenanceSource,
} from '@omne-harness/tool-storage-sql'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY } from '../../entry/tool-material-maintainer.ts'
import { defineRow } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { createToolMaterialMaintenanceAccess } from '../authorization/tool-material-access.ts'
import { systemActionAuthorizationKey } from '../authorization/system-action-service.ts'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { TOOL_MATERIAL_PROVIDER } from '../tool-runtime/holder.ts'
import { createMaterialMaintenanceSweep } from '../tool-runtime/material-maintenance-sweep.ts'
import { startMaterialMaintenanceRunner } from '../tool-runtime/material-maintenance-runner.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export const toolMaterialMaintenanceConfig = z.strictObject({
  combinationVersion: z.string().min(1).max(1024),
  maxCommandBytes: positive,
  maxChunkBytes: positive,
  ledgerCommitAttempts: positive,
  intervalMs: z.number().int().min(1).max(2_147_483_647),
  pageSize: z.number().int().min(1).max(128),
})

export const toolMaterialMaintenanceRow = defineRow({
  row: 'tool-material-maintenance',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      tenantDomainsKey,
      systemActionAuthorizationKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  Config: toolMaterialMaintenanceConfig,
  async body(ctx, raw) {
    const config = toolMaterialMaintenanceConfig.parse(raw)
    const manifest = compositeManifestDigest(storageCatalog())
    if (manifest.kind === 'invalid')
      throw new Error('tool material maintenance: invalid storage manifest')
    const options = {
      storage: ctx.get(storageKey) as SqlStorage,
      domains: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
      combination: {
        combinationVersion: config.combinationVersion,
        manifestDigest: manifest.digest,
      },
    }
    const clock = createLocalToolMaterialClock({
      wallMs: () => /* wall-clock: clock-source -- Tool material expiry input */ Date.now(),
      monotonicMs: monotonicClock.now,
    })
    const access = createToolMaterialMaintenanceAccess(() => ctx.get(systemActionAuthorizationKey))
    const maintenance = createLocalToolMaterialMaintenance({
      store: createSqlToolLedgerStore(options),
      materials: {
        clock,
        store: createSqlToolMaterialStore({
          ...options,
          provider: TOOL_MATERIAL_PROVIDER,
          maxCommandBytes: config.maxCommandBytes,
          maxChunkBytes: config.maxChunkBytes,
        }),
      },
      access,
      source: createSqlToolMaterialMaintenanceSource(options),
      scanAccess: { qualify: access.qualifyScan },
      ledgerCommitAttempts: config.ledgerCommitAttempts,
    })
    const sweep = createMaterialMaintenanceSweep({
      domains: ctx.get(tenantDomainsKey) as TenantDomains<unknown>,
      scanner: ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY),
      maintainer: ctx.get(TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY),
      clock,
      maintenance,
      pageSize: config.pageSize,
    })
    const logger = ctx.logger('tool-material-maintenance')
    const runner = startMaterialMaintenanceRunner({
      sweep,
      clock: monotonicClock,
      intervalMs: config.intervalMs,
      report(result) {
        if ('failure' in result)
          logger.warn('material maintenance step failed: %s', result.failure.kind)
        else if (result.ok.failures > 0)
          logger.warn('material maintenance step failures: %d', result.ok.failures)
      },
    })
    void runner.done.catch(() => logger.warn('material maintenance runner failed'))
    ctx.effect(
      () => () =>
        runner.close().catch(() => {
          logger.warn('material maintenance close failed')
        }),
      'tool-material-maintenance.close',
    )
    return {
      async stop(deadline) {
        const closing = runner.close().then(
          () => ({ kind: 'settled' as const }),
          () => ({ kind: 'failed' as const, detail: 'material maintenance close failed' }),
        )
        const timer = monotonicClock.after(deadline - monotonicClock.now())
        try {
          return await Promise.race([
            closing,
            timer.promise.then(() => ({
              kind: 'incomplete' as const,
              detail: 'material maintenance is still draining',
            })),
          ])
        } finally {
          timer.cancel()
        }
      },
    }
  },
})
