// The `tool-body-sweep` row: the application schedules the Tool sweep over the due index of every
// tenant (spec C5). The Tool runtime reclaims; this row only gives it the clock, the interval and
// the batch limit, and stops it at shutdown.
import { z } from 'zod'
import { observeToolLedgerCommit, createToolSweep } from '@omne-harness/tool'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import type { SqlStorage, TenantDomainLookup, TenantDomains } from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { createSqlToolBodyStore, createSqlToolLedgerStore } from '@omne-harness/tool-storage-sql'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { processInstance } from '../telemetry/instance.ts'
import { createBodySweep } from '../tool-runtime/body-sweep.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { startSweepRunner } from '../tool-runtime/sweep-runner.ts'
import { createToolLifecycleTelemetry } from '../tool-runtime/telemetry.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export const toolBodySweepConfig = z.strictObject({
  combinationVersion: z.string().min(1).max(1024),
  ledgerCommitAttempts: positive,
  intervalMs: z.number().int().min(1).max(2_147_483_647),
  limit: z.number().int().min(1).max(1000),
})

export const toolBodySweepRow = defineRow({
  row: 'tool-body-sweep',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      telemetryKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  Config: toolBodySweepConfig,
  async body(ctx, raw) {
    const config = toolBodySweepConfig.parse(raw)
    const manifest = compositeManifestDigest(storageCatalog())
    if (manifest.kind === 'invalid') throw new Error('tool body sweep: invalid storage manifest')
    const options = {
      storage: ctx.get(storageKey) as SqlStorage,
      domains: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
      combination: {
        combinationVersion: config.combinationVersion,
        manifestDigest: manifest.digest,
      },
    }
    const holder = toolRuntimeHolder(ctx)
    const store = createSqlToolLedgerStore(options)
    const { bodyPermitKey: permitKey, bodyClock: clock } = holder
    const sweep = createToolSweep(
      {
        ...store,
        commit: observeToolLedgerCommit(
          store.commit,
          createToolLifecycleTelemetry(() => ctx.get(telemetryKey, false), processInstance),
        ),
      },
      { store: createSqlToolBodyStore({ ...options, permitKey, clock }), permitKey, clock },
      config.ledgerCommitAttempts,
    )
    const schedule = createBodySweep({
      domains: ctx.get(tenantDomainsKey) as TenantDomains<unknown>,
      scanner: ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY),
      clock,
      sweep: sweep.sweep,
      limit: config.limit,
    })
    const logger = ctx.logger('tool-body-sweep')
    const runner = startSweepRunner({
      sweep: schedule,
      clock: monotonicClock,
      intervalMs: config.intervalMs,
      report(result) {
        if ('failure' in result) logger.warn('body sweep step failed: %s', result.failure.kind)
        else if (result.ok.failures > 0)
          logger.warn('body sweep step failures: %d', result.ok.failures)
      },
    })
    void runner.done.catch(() => logger.warn('body sweep runner failed'))
    ctx.effect(
      () => () =>
        runner.close().catch(() => {
          logger.warn('body sweep close failed')
        }),
      'tool-body-sweep.close',
    )
    return {
      async stop(deadline) {
        const closing = runner.close().then(
          () => ({ kind: 'settled' as const }),
          () => ({ kind: 'failed' as const, detail: 'body sweep close failed' }),
        )
        const timer = monotonicClock.after(deadline - monotonicClock.now())
        try {
          return await Promise.race([
            closing,
            timer.promise.then(() => ({
              kind: 'incomplete' as const,
              detail: 'body sweep is still draining',
            })),
          ])
        } finally {
          timer.cancel()
        }
      },
    }
  },
})
