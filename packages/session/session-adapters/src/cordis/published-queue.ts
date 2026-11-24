import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'

const PUBLISHED = 'session-adapters/agent-published'
const INTERPRETED = 'session-adapters/journal-interpreted'
const CONSUMED = 'session-adapters/entries-consumed'

export type PublishedTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

// What else wakes a subscriber besides a write of the Agent records.
export type Wake = 'interpreted' | 'consumed'
const WAKES = { interpreted: INTERPRETED, consumed: CONSUMED } as const

// `work` answers its own failures and must not reject.
export function subscribePublished(
  ctx: Context,
  stopped: () => boolean,
  work: (target: PublishedTarget) => Promise<void>,
  also: readonly Wake[] = [],
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
  const listen = (tenant: TenantId, session: SessionId, execution: AgentExecutionId) =>
    enqueue({ tenant, session, execution })
  ctx.on(PUBLISHED, listen)
  for (const wake of also) ctx.on(WAKES[wake], listen)
  return enqueue
}

function dispatch(
  ctx: Context,
  warn: (line: string) => void,
  name: typeof PUBLISHED | typeof INTERPRETED | typeof CONSUMED,
  { tenant, session, execution }: PublishedTarget,
): void {
  try {
    ctx.parallel(name, tenant, session, execution).catch((error: unknown) => {
      warn(`a listener of ${name} failed: ${String(error)}`)
    })
  } catch (error) {
    warn(`dispatching ${name} failed: ${String(error)}`)
  }
}

export function announcePublished(
  ctx: Context,
  warn: (line: string) => void,
  target: PublishedTarget,
): void {
  dispatch(ctx, warn, PUBLISHED, target)
}

export function announce(
  ctx: Context,
  warn: (line: string) => void,
  wake: Wake,
  target: PublishedTarget,
): void {
  dispatch(ctx, warn, WAKES[wake], target)
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The journal interpretation committed for an execution. A wake-up only: the tool log
     * consumption reads again, and finds what the commit made readable (a call it bound).
     *
     * @mode parallel
     */
    'session-adapters/journal-interpreted'(
      tenant: TenantId,
      session: SessionId,
      execution: AgentExecutionId,
    ): void
    /**
     * A consumption of a received-entries channel committed for an execution. A wake-up only: the
     * journal interpretation reads again, and goes on past an event that waited for a delivery.
     *
     * @mode parallel
     */
    'session-adapters/entries-consumed'(
      tenant: TenantId,
      session: SessionId,
      execution: AgentExecutionId,
    ): void
  }
}
