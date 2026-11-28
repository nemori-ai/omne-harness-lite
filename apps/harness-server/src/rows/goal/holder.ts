import type { Context } from '@deepseek-ai/cordis'
import type {
  GoalCalls,
  GoalDecisions,
  GoalExamining,
  GoalHistory,
  GoalSessions,
} from '@omne-harness/goal'
import type { ExaminationSettings } from '@omne-harness/goal-local'
import type { GoalChangePublisher } from './changes.ts'

/** What the contributing rows of goals mount for the provider: read at each call, absent while a row is not started. */
export type GoalHolder = {
  sessions: GoalSessions | null
  calls: GoalCalls | null
  history: GoalHistory | null
  decisions: GoalDecisions | null
  examining: GoalExamining | null
  changes: GoalChangePublisher | null
  /** What a tenant set of examinations, read at each use; null from it when that cannot be read. */
  examination: ((tenant: string) => Promise<ExaminationSettings | null>) | null
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
    examining: null,
    changes: null,
    examination: null,
  }
  holders.set(root, created)
  return created
}
