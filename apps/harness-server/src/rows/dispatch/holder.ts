import type { Context } from '@deepseek-ai/cordis'
import type { ContextCopies, DispatchSessions, ReportWaits } from '@omne-harness/dispatch'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Turn } from '../tenant-assets/turn.ts'

/** What the contributing rows of dispatch mount for the provider: read at each call, absent while a row is not started. */
export type DispatchHolder = {
  sessions: DispatchSessions | null
  waits: ReportWaits | null
  copies: ContextCopies | null
  /** The turn a dispatching session reads its workspace by; undefined when the session cannot be read. */
  turns: DispatcherTurns | null
}

export type DispatcherTurns = (
  tenant: TenantId,
  session: string,
) => Promise<Turn | null | undefined>

const holders = new WeakMap<Context, DispatchHolder>()

export function dispatchHolder(ctx: Context): DispatchHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: DispatchHolder = { sessions: null, waits: null, copies: null, turns: null }
  holders.set(root, created)
  return created
}
