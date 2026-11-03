// The `session-ad04` row (B1, R2-D136): the AD-04 history source of session-adapters, two plugins
// from one `createSessionHistorySource` call: the source, which provides the holder parts (K-RQ,
// `contextHolderSources`) and calls `session` as `reader`; and the lower-bound sub-plugin, which
// reads `readWork` as `coordinator`. The heads decoder is `historySessionOf` of session-adapters.
//
// Configuration (data only, from the operator layer): `scopeIndexEntries` and `pageBytes`.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { contextHolderSourcesKey } from '@omne-harness/request-context-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { historySessionOf } from '@omne-harness/session-adapters'
import { createSessionHistorySource } from '@omne-harness/session-adapters/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

/**
 * The heads decoder: `historySessionOf` gives the tenant as its codec text; the holder parts want
 * the minted tenant, so the text is parsed back. Evidence this decoder does not know, or a tenant
 * text the codec does not mint, is `null`: the resolver then answers that the head is unknown.
 */
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
