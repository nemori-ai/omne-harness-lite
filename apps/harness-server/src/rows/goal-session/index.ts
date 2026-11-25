import { createGoalCalls, createGoalSessions, goalInputSources } from '@omne-harness/goal-session'
import { sessionInputSourcesKey, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { GOAL_PRINCIPAL_KEY } from '../../entry/goal-principal.ts'
import { defineRow } from '../../row.ts'
import { GOAL_COMPONENT } from '../authorization/grants.ts'
import { goalHolder } from '../goal/holder.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { sessionCallsOf } from './calls.ts'

/** The side of goals that knows Session: its three input sources and the session port of the provider. */
export const goalSessionRow = defineRow({
  row: 'goal-session',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [sessionKey, sessionInputSourcesKey, GOAL_PRINCIPAL_KEY],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx) {
    const holder = goalHolder(ctx)
    const sessionCalls = sessionCallsOf(ctx, {
      system: ctx.get(GOAL_PRINCIPAL_KEY) as unknown,
      workPrincipals: () => toolRuntimeHolder(ctx).workPrincipals(),
    })
    const sessions = createGoalSessions(sessionCalls)
    const calls = createGoalCalls(sessionCalls)
    ctx.inject([sessionInputSourcesKey], child => {
      for (const source of goalInputSources(GOAL_COMPONENT))
        child[sessionInputSourcesKey].register(source)
    })
    holder.sessions = sessions
    holder.calls = calls
    return {
      async stop() {
        if (holder.sessions === sessions) holder.sessions = null
        if (holder.calls === calls) holder.calls = null
        return { kind: 'settled' }
      },
    }
  },
})
