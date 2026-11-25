import type { Context } from '@deepseek-ai/cordis'
import type { GoalCards, GoalSessions } from '@omne-harness/goal'

/** What the contributing rows of goals mount for the provider: read at each call, absent while a row is not started. */
export type GoalHolder = { sessions: GoalSessions | null; cards: GoalCards | null }

const holders = new WeakMap<Context, GoalHolder>()

export function goalHolder(ctx: Context): GoalHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: GoalHolder = { sessions: null, cards: null }
  holders.set(root, created)
  return created
}
