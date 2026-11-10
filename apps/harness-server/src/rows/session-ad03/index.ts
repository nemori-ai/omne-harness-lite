import { principalVerifierKey } from '@omne-harness/identity/cordis'
// The `session-ad03` row (B1, R2-D136): the AD-03 holder of session-adapters, three plugins from one
// `createSessionContextHolder` call (they share one index): the holder, which provides the model
// reader eligibility (K-RC); the replay sub-plugin, the only caller of `applyCommit`; and the facts
// sub-plugin, which provides `sessionReplayFacts` and `sessionScopeLookup`. The coordinator
// principal comes from the trusted `sessionWorkPrincipals`; the commit translation is the one over
// the definitions the release adopted, as row `session-ad12` uses.
//
// The `runtimeContextTrust` entry object reads `sessionReplayFacts` of the facts sub-plugin per call
// (B1-GAP-REPLAY-FACTS-LINK closed by SC2 in `src/entry/runtime-context-trust.ts`); the `replayFacts`
// value of this bundle is not handed out.
//
// Configuration (data only, from the operator layer): `scopeIndexEntries` and `pageBytes`.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createSessionContextHolder,
  createSessionContextTranslation,
} from '@omne-harness/session-adapters/cordis'
import {
  sessionKey,
  sessionReplayFactsKey,
  sessionScopeLookupKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { z } from 'zod'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { definitionMappingsKey } from '@omne-harness/server-entry/cordis'
import { sessionModesPrincipalsKey } from '../../entry/session-modes-principals.ts'
import { defaultModesOf } from '../session-conditions/index.ts'
import { SessionModesInstallation, sessionModesInstallationKey } from './modes.ts'
import { adoptedContextDefinitions } from '../../assembly/context-definitions.ts'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

const positive = z.number().int().positive()
export const sessionAd03Config = z.strictObject({
  scopeIndexEntries: positive,
  pageBytes: positive,
})
export type SessionAd03Config = z.output<typeof sessionAd03Config>

const INJECTS = [
  sessionWorkPrincipalsKey,
  sessionModesPrincipalsKey,
  principalVerifierKey,
  runtimeContextKey,
  sessionKey,
  storageKey,
  tenantDomainLookupKey,
  definitionMappingsKey,
]

const plugin: Plugin.Object = {
  name: 'session-ad03',
  inject: INJECTS,
  Config: sessionAd03Config,
  async apply(ctx: Context, config: SessionAd03Config) {
    const coordinator = coordinatorPrincipalsOf(ctx)
    const modes = new SessionModesInstallation(ctx, {
      coordinator,
      principals: ctx[sessionModesPrincipalsKey],
      verifier: ctx[principalVerifierKey],
      defaultModes: defaultModesOf(ctx[definitionMappingsKey]),
      recoverSession: input => bundle.recoverSession(input),
    })
    const bundle = createSessionContextHolder<unknown>({
      coordinator,
      registrationApplied: async ({ tenant, session, keys, ended }) => {
        if (ended || !keys.includes('session.modes')) return
        const refreshed = await modes.refresh(tenant, session)
        if (refreshed.kind !== 'refreshed')
          ctx
            .logger('session-ad03-modes')
            .warn(`confirmed registration refresh answered ${refreshed.kind}`)
      },
      translation: createSessionContextTranslation(adoptedContextDefinitions),
      scopeIndexEntries: config.scopeIndexEntries,
      pageBytes: config.pageBytes,
    })
    await ctx.plugin(bundle.holder)
    await ctx.plugin(bundle.replay)
    await ctx.plugin(bundle.facts)
  },
}

export const sessionAd03Row = defineRow({
  row: 'session-ad03',
  implementation: 'real',
  manifest: {
    provides: [
      runtimeContextReaderEligibilityKey,
      sessionReplayFactsKey,
      sessionScopeLookupKey,
      sessionModesInstallationKey,
    ],
    injects: INJECTS,
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
