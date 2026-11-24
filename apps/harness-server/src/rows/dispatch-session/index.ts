import {
  createContextCopies,
  createDispatchSessions,
  dispatchInputSources,
} from '@omne-harness/dispatch-session'
import { sessionInputSourcesKey, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { DISPATCH_PRINCIPAL_KEY } from '../../entry/dispatch-principal.ts'
import { defineRow } from '../../row.ts'
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { DISPATCH_COMPONENT } from '../authorization/grants.ts'
import { dispatchHolder } from '../dispatch/holder.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import type { SessionId } from '@omne-harness/session-contract'
import { lastTurnOf } from '../tenant-assets/turn.ts'
import { sessionCallsOf } from './calls.ts'

/** Dispatch's side that knows Session: its three input sources, the session port and the context copies of the provider. */
export const dispatchSessionRow = defineRow({
  row: 'dispatch-session',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [
      sessionKey,
      sessionInputSourcesKey,
      definitionMappingsKey,
      sessionModesInstallationKey,
      DISPATCH_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx) {
    const holder = dispatchHolder(ctx)
    const calls = sessionCallsOf(ctx, {
      system: ctx.get(DISPATCH_PRINCIPAL_KEY) as unknown,
      workPrincipals: () => toolRuntimeHolder(ctx).workPrincipals(),
    })
    const sessions = createDispatchSessions(calls)
    const copies = createContextCopies(calls)
    ctx.inject([sessionInputSourcesKey], child => {
      for (const source of dispatchInputSources(DISPATCH_COMPONENT))
        child[sessionInputSourcesKey].register(source)
    })
    holder.sessions = sessions
    holder.copies = copies
    holder.turns = (tenant, session) => lastTurnOf(ctx, tenant, session as SessionId)
    return {
      async stop() {
        if (holder.sessions === sessions) holder.sessions = null
        if (holder.copies === copies) holder.copies = null
        holder.turns = null
        return { kind: 'settled' }
      },
    }
  },
})
