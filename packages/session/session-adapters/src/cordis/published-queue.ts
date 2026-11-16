import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'

const PUBLISHED = 'session-adapters/agent-published'

export type PublishedTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

// `work` answers its own failures and must not reject.
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
