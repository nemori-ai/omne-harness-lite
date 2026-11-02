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
 * answers its own failures; it must not reject.
 */
export function subscribePublished(
  ctx: Context,
  stopped: () => boolean,
  work: (target: PublishedTarget) => Promise<void>,
): void {
  const queues = new Map<string, Promise<void>>()
  ctx.on(PUBLISHED, (tenant, session, execution) => {
    if (stopped()) return
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return
    const key = JSON.stringify([text.value, session])
    const next = (queues.get(key) ?? Promise.resolve()).then(() =>
      work({ tenant, session, execution }),
    )
    queues.set(key, next)
    void next.finally(() => {
      if (queues.get(key) === next) queues.delete(key)
    })
  })
}
