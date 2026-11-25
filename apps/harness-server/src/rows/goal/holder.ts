import type { Context } from '@deepseek-ai/cordis'
import type { GoalCalls, GoalCards, GoalSessions } from '@omne-harness/goal'

/** What the contributing rows of goals mount for the provider: read at each call, absent while a row is not started. */
export type GoalHolder = {
  sessions: GoalSessions | null
  cards: GoalCards | null
  calls: GoalCalls | null
}

const holders = new WeakMap<Context, GoalHolder>()

export function goalHolder(ctx: Context): GoalHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: GoalHolder = { sessions: null, cards: null, calls: null }
  holders.set(root, created)
  return created
}
