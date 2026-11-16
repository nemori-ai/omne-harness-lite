import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import {
  contextAccountingInboxKey,
  contextHolderSourcesKey,
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
    const logger = ctx.logger('request-context')
    const accounting = releaseAccounting(config.limits, {
      readVerifier: () => ctx.get(principalVerifierKey) as PrincipalVerifier | undefined,
      readHolder: () => ctx.get(contextHolderSourcesKey),
      diagnose: diagnostic => logger.warn(diagnostic),
      trace: diagnostic => logger.debug(diagnostic),
    })
    await ctx.plugin(RequestContextProvider, {
      accounting,
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
