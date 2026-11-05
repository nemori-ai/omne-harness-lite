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
import { adoptedContextDefinitions } from '../../assembly/context-definitions.ts'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

const positive = z.number().int().positive()
export const sessionAd03Config = z.strictObject({
  scopeIndexEntries: positive,
  pageBytes: positive,
})
export type SessionAd03Config = z.output<typeof sessionAd03Config>

const plugin: Plugin.Object = {
  name: 'session-ad03',
  inject: [sessionWorkPrincipalsKey, runtimeContextKey, sessionKey],
  Config: sessionAd03Config,
  async apply(ctx: Context, config: SessionAd03Config) {
    const bundle = createSessionContextHolder<unknown>({
      coordinator: coordinatorPrincipalsOf(ctx),
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
    provides: [runtimeContextReaderEligibilityKey, sessionReplayFactsKey, sessionScopeLookupKey],
    injects: [sessionWorkPrincipalsKey, runtimeContextKey, sessionKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
