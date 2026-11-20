import { principalVerifierKey } from '@omne-harness/identity/cordis'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  runtimeContextKey,
  runtimeContextReaderEligibilityKey,
  runtimeContextTenantScopeKey,
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
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { sessionModesPrincipalsKey } from '../../entry/session-modes-principals.ts'
import { defaultModesOf } from '../session-conditions/index.ts'
import { SessionModesInstallation, sessionModesInstallationKey } from './modes.ts'
import { SessionWorkingDirectory, sessionWorkingDirectoryKey } from './working-directory.ts'
import { workspaceTargets } from '../session-access/workspace-targets.ts'
import { adoptedContextDefinitions } from '../../assembly/context-definitions.ts'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

const positive = z.number().int().positive()
export const sessionAd03Config = z.strictObject({
  scopeIndexEntries: positive,
  pageBytes: positive,
  /** Where a session with no workspace attached works: the real path of the server's directory. */
  defaultDirectory: z.string().min(1),
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
      // Runtime Context must know both blocks of a session before a reader of its scope reads:
      // a block it does not know reads as no value at all, not as a required one that is missing.
      recoverSession: async input => {
        if ((await directory.ensure(input.tenant)).kind !== 'ready') return { kind: 'unavailable' }
        return bundle.recoverSession(input)
      },
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
      // A Session scope hangs under the tenant-level scope while that scope has a holder.
      parentScope: tenant => ctx.get(runtimeContextTenantScopeKey)?.scopeOf(tenant),
      scopeIndexEntries: config.scopeIndexEntries,
      pageBytes: config.pageBytes,
    })
    const directory = new SessionWorkingDirectory(ctx, {
      defaultDirectory: config.defaultDirectory,
      targets: () => workspaceTargets(ctx),
      recover: input => bundle.recoverSession(input),
      principals: ctx[sessionModesPrincipalsKey],
      runtime: ctx[runtimeContextKey],
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
      sessionWorkingDirectoryKey,
    ],
    injects: INJECTS,
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
