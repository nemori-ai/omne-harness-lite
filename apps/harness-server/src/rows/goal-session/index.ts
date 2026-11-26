import { goalCheckingKey } from '@omne-harness/goal-cordis-contract/cordis'
import {
  createGoalCalls,
  createGoalHistory,
  createGoalSessions,
  createSessionExamining,
  goalInputSources,
} from '@omne-harness/goal-session'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { sessionInputSourcesKey, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { GOAL_PRINCIPAL_KEY } from '../../entry/goal-principal.ts'
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { defineRow } from '../../row.ts'
import { GOAL_COMPONENT } from '../authorization/grants.ts'
import { goalHolder } from '../goal/holder.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { sessionCallsOf } from './calls.ts'
import { examinerCallsOf } from './examiner-calls.ts'
import { createExamining } from './examining.ts'
import { shellRunner } from './rerun.ts'
import { describeCall } from './observed.ts'

/** How long one command run again may take before it is stopped. */
const RERUN_TIMEOUT_MS = 600_000

/** The side of goals that knows Session: its input sources, the session port of the provider, and the examining side. */
export const goalSessionRow = defineRow({
  row: 'goal-session',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [sessionKey, sessionInputSourcesKey, definitionMappingsKey, GOAL_PRINCIPAL_KEY],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx) {
    const holder = goalHolder(ctx)
    const system = ctx.get(GOAL_PRINCIPAL_KEY) as unknown
    const sessionCalls = sessionCallsOf(ctx, {
      system,
      workPrincipals: () => toolRuntimeHolder(ctx).workPrincipals(),
    })
    const workPrincipals = () => toolRuntimeHolder(ctx).workPrincipals()
    const settingsOf = async (tenant: string) => (await holder.examination?.(tenant)) ?? null
    const examiner = async (tenant: TenantId) => {
      const text = tenantCodec.encode(tenant)
      return text.ok ? (await settingsOf(text.value))?.examiner : undefined
    }
    const examinerPorts = { system, workPrincipals, examiner }
    const examinerCalls = examinerCallsOf(ctx, examinerPorts, sessionCalls.reminderWith)
    const examining = createExamining({
      rerun: { runner: shellRunner, timeoutMs: RERUN_TIMEOUT_MS },
      system,
      checking: () => ctx.get(goalCheckingKey),
      report: error => ctx.logger('goal-session').warn(error),
      sessions: createSessionExamining(
        { ...sessionCalls, ...examinerCalls },
        {
          now: () =>
            /* wall-clock: operation-timing -- how long ago a batch went to an examining session */ performance.now(),
          wait: ms => new Promise(resolve => void setTimeout(resolve, ms).unref()),
          limitMs: async tenant => {
            const set = await settingsOf(tenant)
            return set === null ? null : set.minutes * 60_000
          },
        },
      ),
    })
    const sessions = createGoalSessions(sessionCalls)
    const calls = createGoalCalls(sessionCalls)
    const history = createGoalHistory(sessionCalls, describeCall)
    ctx.inject([sessionInputSourcesKey], child => {
      for (const source of goalInputSources(GOAL_COMPONENT))
        child[sessionInputSourcesKey].register(source)
    })
    holder.sessions = sessions
    holder.calls = calls
    holder.history = history
    holder.examining = examining
    return {
      async stop() {
        if (holder.sessions === sessions) holder.sessions = null
        if (holder.calls === calls) holder.calls = null
        if (holder.history === history) holder.history = null
        if (holder.examining === examining) holder.examining = null
        return { kind: 'settled' }
      },
    }
  },
})
