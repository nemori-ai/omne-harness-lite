import type { Context } from '@deepseek-ai/cordis'
import type { GoalCalls, GoalDecisions, GoalHistory, GoalSessions } from '@omne-harness/goal'
import type { GoalChangePublisher } from './changes.ts'

/** What the contributing rows of goals mount for the provider: read at each call, absent while a row is not started. */
export type GoalHolder = {
  sessions: GoalSessions | null
  calls: GoalCalls | null
  history: GoalHistory | null
  decisions: GoalDecisions | null
  changes: GoalChangePublisher | null
}

const holders = new WeakMap<Context, GoalHolder>()

export function goalHolder(ctx: Context): GoalHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: GoalHolder = {
    sessions: null,
    calls: null,
    history: null,
    decisions: null,
    changes: null,
  }
  holders.set(root, created)
  return created
}
