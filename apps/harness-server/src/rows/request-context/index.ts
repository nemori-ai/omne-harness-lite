// The `request-context` row (B1, R2-D136): `RequestContextProvider` of
// `@omne-harness/request-context-cordis` as a child of the row fiber. The provider takes runtime
// objects as options (the accounting ports), so the row builds them in trusted code from the row
// configuration: the accounting limits and, optionally, the serializable strategy selection. The
// accounting ports the release has no production source for are the named gaps of `accounting.ts`;
// they answer `unavailable`, they let nothing through. The trust key is the trusted entry object
// `requestContextTrust`; the row injects it so the child provider sees it.
//
// Configuration (data only; the numbers come from the operator layer, the release writes none):
// `limits` of the accounting inbox, optional `selection` of the two strategies (absent: the initial
// values of the member's default strategies).
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import {
  contextAccountingInboxKey,
  requestContextKey,
  requestContextTrustKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { releaseAccounting } from './accounting.ts'

const positive = z.number().int().positive()

export const requestContextRowConfig = z.strictObject({
  limits: z.strictObject({
    maxTargets: positive,
    maxFactsPerTarget: positive,
    maxRevisionsPerDispatch: positive,
  }),
  selection: z.unknown().optional(),
})

export type RequestContextRowConfig = z.output<typeof requestContextRowConfig>

const plugin: Plugin.Object = {
  name: 'request-context',
  inject: [requestContextTrustKey],
  Config: requestContextRowConfig,
  async apply(ctx: Context, config: RequestContextRowConfig) {
    await ctx.plugin(RequestContextProvider, {
      accounting: releaseAccounting(config.limits),
      ...(config.selection === undefined ? {} : { selection: config.selection as never }),
    })
  },
}

export const requestContextRow = defineRow({
  row: 'request-context',
  implementation: 'real',
  manifest: {
    provides: [requestContextKey, contextAccountingInboxKey],
    injects: [requestContextTrustKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
