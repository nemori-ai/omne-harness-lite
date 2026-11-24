import type { Context, Plugin } from '@deepseek-ai/cordis'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import {
  requestContextKey,
  requestContextTrustKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

export const requestContextRowConfig = z.strictObject({
  selection: z.unknown().optional(),
})

export type RequestContextRowConfig = z.output<typeof requestContextRowConfig>

const plugin: Plugin.Object = {
  name: 'request-context',
  inject: [requestContextTrustKey],
  Config: requestContextRowConfig,
  async apply(ctx: Context, config: RequestContextRowConfig) {
    await ctx.plugin(
      RequestContextProvider,
      config.selection === undefined ? {} : { selection: config.selection as never },
    )
  },
}

export const requestContextRow = defineRow({
  row: 'request-context',
  implementation: 'real',
  manifest: {
    provides: [requestContextKey],
    injects: [requestContextTrustKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
