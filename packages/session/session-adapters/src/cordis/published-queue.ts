// The subscription that AD-02 and AD-05 share: each `session-adapters/agent-published` event names
// a tenant, a session and an execution, and the work for it runs after the earlier work of the same
// session, so one session is never handled by two calls at once. The event is a wake-up only; what
// the work reads and commits is the work's own affair.
import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'

const PUBLISHED = 'session-adapters/agent-published'

/** The execution one event names. */
export type PublishedTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

/**
 * Runs `work` for every published event, one session at a time and in the order the events came.
 * An event after `stopped()` turned true, and one whose tenant has no text, start nothing. `work`
 * answers its own failures; it must not reject. The answer puts more work for a target at the end
 * of the same session's queue: `run` defaults to `work`, so a caller can come back to a target
 * later without holding the queue in the meantime.
 */
export function subscribePublished(
  ctx: Context,
  stopped: () => boolean,
  work: (target: PublishedTarget) => Promise<void>,
): (target: PublishedTarget, run?: () => Promise<void>) => void {
  const queues = new Map<string, Promise<void>>()
  const enqueue = (target: PublishedTarget, run = () => work(target)): void => {
    if (stopped()) return
    const text = tenantCodec.encode(target.tenant)
    if (!text.ok) return
    const key = JSON.stringify([text.value, target.session])
    const next = (queues.get(key) ?? Promise.resolve()).then(() => (stopped() ? undefined : run()))
    queues.set(key, next)
    void next.finally(() => {
      if (queues.get(key) === next) queues.delete(key)
    })
  }
  ctx.on(PUBLISHED, (tenant, session, execution) => enqueue({ tenant, session, execution }))
  return enqueue
}

/** Sends the event without waiting for its listeners; what they throw goes to `warn`. */
export function announcePublished(
  ctx: Context,
  warn: (line: string) => void,
  { tenant, session, execution }: PublishedTarget,
): void {
  try {
    ctx.parallel(PUBLISHED, tenant, session, execution).catch((error: unknown) => {
      warn(`a listener of ${PUBLISHED} failed: ${String(error)}`)
    })
  } catch (error) {
    warn(`dispatching ${PUBLISHED} failed: ${String(error)}`)
  }
}
