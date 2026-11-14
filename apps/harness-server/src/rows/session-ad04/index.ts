import type { Context, Plugin } from '@deepseek-ai/cordis'
import { contextHolderSourcesKey } from '@omne-harness/request-context-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { historySessionOf } from '@omne-harness/session-adapters'
import { createSessionHistorySource } from '@omne-harness/session-adapters/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

function sessionHeadOf(evidence: Parameters<typeof historySessionOf>[0]) {
  const head = historySessionOf(evidence)
  if (head === null) return null
  const tenant = tenantCodec.parse(head.tenant)
  return tenant.ok ? { tenant: tenant.value, session: head.session } : null
}

const positive = z.number().int().positive()
export const sessionAd04Config = z.strictObject({
  scopeIndexEntries: positive,
  pageBytes: positive,
})
export type SessionAd04Config = z.output<typeof sessionAd04Config>

const plugin: Plugin.Object = {
  name: 'session-ad04',
  inject: [sessionKey],
  Config: sessionAd04Config,
  async apply(ctx: Context, config: SessionAd04Config) {
    const bundle = createSessionHistorySource({
      heads: { sessionOf: sessionHeadOf },
      scopeIndexEntries: config.scopeIndexEntries,
      pageBytes: config.pageBytes,
    })
    await ctx.plugin(bundle.lowerBound)
    await ctx.plugin(bundle.source)
  },
}

export const sessionAd04Row = defineRow({
  row: 'session-ad04',
  implementation: 'real',
  manifest: {
    provides: [contextHolderSourcesKey],
    injects: [sessionKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
