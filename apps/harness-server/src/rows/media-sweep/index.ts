import type { Context } from '@deepseek-ai/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { z } from 'zod'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { sweepEveryTenant } from './sweep.ts'

export const mediaSweepConfig = z.strictObject({
  intervalMs: z.number().int().min(1000).max(2_147_483_647).default(60_000),
  limit: z.number().int().min(1).max(1000).default(100),
})

const INJECTS = [mediaKey, tenantDomainsKey, TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY]

/** The maintainer of media: at the start and then at each beat, every tenant is swept once. */
export const mediaSweepRow = defineRow({
  row: 'media-sweep',
  implementation: 'real',
  manifest: { provides: [], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media-sweep',
    inject: INJECTS,
    Config: mediaSweepConfig,
    apply(ctx: Context, raw: unknown) {
      const { intervalMs, limit } = mediaSweepConfig.parse(raw)
      const logger = ctx.logger('media-sweep')
      const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
      const scanner: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
      let running = false
      const beat = () => {
        if (running) return
        running = true
        void sweepEveryTenant({
          custody: () => ctx.get(mediaKey)?.custody,
          listing: () => directory.enumerate({ principal: scanner }),
          limit,
          warn: message => logger.warn(message),
        }).finally(() => {
          running = false
        })
      }
      ctx.effect(() => {
        const first = setTimeout(beat, 0)
        const timer = setInterval(beat, intervalMs)
        timer.unref()
        return () => {
          clearTimeout(first)
          clearInterval(timer)
        }
      }, 'media-sweep.beat')
    },
  },
})
