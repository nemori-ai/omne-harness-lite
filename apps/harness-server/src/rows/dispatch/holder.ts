import type { Context } from '@deepseek-ai/cordis'
import type { ContextCopies, DispatchSessions, ReportWaits } from '@omne-harness/dispatch'

/** What the contributing rows of dispatch mount for the provider: read at each call, absent while a row is not started. */
export type DispatchHolder = {
  sessions: DispatchSessions | null
  waits: ReportWaits | null
  copies: ContextCopies | null
}

const holders = new WeakMap<Context, DispatchHolder>()

export function dispatchHolder(ctx: Context): DispatchHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: DispatchHolder = { sessions: null, waits: null, copies: null }
  holders.set(root, created)
  return created
}
