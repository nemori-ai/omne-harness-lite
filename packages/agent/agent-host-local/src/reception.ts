// The Model result receiver of the `agent-host` plugin (SPEC "宿主插件", "结果接收"; R2-D237). The
// plugin body builds it from its injected services with `createLocalModelReceiver`, registers it
// with the Model runtime under the Agent's consumer owner (IC-13), and drives its maintenance:
//
// - The receiver state belongs to the host, not to one body: the plugin keeps one per Cordis root,
//   so a body that runs again over new providers hands the same state to the new receiver.
// - The registration is an effect of the plugin fiber, so it ends with the fiber. The ordered stop
//   removes it first, before it quiesces instances: the Model then keeps a later delivery owed
//   (`waiting`, `no-receiver`) instead of pushing it into a host that is stopping.
// - Maintenance. An execution becomes known to the driver when a push of it passed the receiver's
//   `receive-result` check; the access of that push is the access of the runs, and a push that the
//   check refused changes nothing. A new receiver over a state that already holds pending work (a
//   body that runs again) knows the executions of that work, with the access their receptions kept.
//   The first run in this receiver calls `recover` (the account backlog is rebuilt from the
//   `received` entries), later runs call `retry`, as long as the report keeps pending work. The wait
//   between two runs starts at `retryMs` and doubles up to `retryMaxMs`; the clock is `agentClock`.
//   A clock that gives no reading or cannot wait, or a run that throws, is retried after the same
//   backoff on the process timer, so one failure does not end the driving. A `denied` answer ends
//   the driving of that execution with a warning.
// - A run in flight when the driver stops is aborted through its signal; the receiver keeps every
//   accepted commit and every handoff (agent public-api "独立 Model 接收入口").
import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import type {
  Access,
  AgentAccessCheck,
  AgentClock,
  AgentExecutionId,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createLocalModelReceiver,
  type AgentModelReceiver,
  type ModelReceiverDependencies,
  type ModelReceiverState,
} from './index.ts'

/** The reception items of the host configuration (all of them, after the defaults). */
export type ReceptionSettings = Readonly<{
  records: number
  bytes: number
  attachments: number
  inFlight: number
  retryMs: number
  retryMaxMs: number
}>

/** The initial values of the reception items. They are configuration initial values, not limits. */
export const RECEPTION_INITIAL: ReceptionSettings = Object.freeze({
  records: 1024,
  bytes: 64 * 1024 * 1024,
  attachments: 1024,
  inFlight: 32,
  retryMs: 1000,
  retryMaxMs: 60_000,
})

export type Reception = Readonly<{
  receiver: AgentModelReceiver<unknown>
  /** Removes the registration and stops the maintenance. Idempotent. */
  stop(): void
}>

type Log = (level: 'error' | 'warn' | 'info', message: string) => void

type Driven = {
  access: Access<unknown>
  execution: AgentExecutionId
  recovered: boolean
  delay: number
  timer: AbortController | null
}

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

/**
 * Builds the receiver over the injected services of `ctx`, registers it under the Agent consumer
 * owner and starts its maintenance. Throws what `registerResultReceiver` throws, a conflict with a
 * live registration included: that is an assembly error and fails the plugin fiber.
 */
export function startReception(
  input: Readonly<{
    ctx: Context
    state: ModelReceiverState<unknown>
    settings: ReceptionSettings
    log: Log
  }>,
): Reception {
  const { ctx, state, settings, log } = input
  const clock: AgentClock = ctx.agentClock
  const driven = new Map<string, Driven>()
  const stopping = new AbortController()
  let stopped = false

  const keyOf = (access: Access<unknown>, execution: AgentExecutionId): string | undefined => {
    const tenant = tenantCodec.encode(access.tenant)
    return tenant.ok ? JSON.stringify([tenant.value, execution]) : undefined
  }

  /** A push of `execution` passed `receive-result` with `access`: drive its maintenance with it. */
  function known(access: Access<unknown>, execution: AgentExecutionId): void {
    if (stopped) return
    const key = keyOf(access, execution)
    if (key === undefined) return
    const entry = driven.get(key)
    if (entry !== undefined) {
      entry.access = access
      return
    }
    const fresh: Driven = {
      access,
      execution,
      recovered: false,
      delay: settings.retryMs,
      timer: null,
    }
    driven.set(key, fresh)
    schedule(key, fresh)
  }

  /** The next wait of `entry`: twice the last one, never above `retryMaxMs`. */
  function backoff(entry: Driven): void {
    entry.delay = Math.min(entry.delay * 2, settings.retryMaxMs)
  }

  /** One wait and one run. Answers why the driving failed this time, or undefined. */
  async function attempt(
    key: string,
    entry: Driven,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const now = await clock.now()
    if ('failure' in now) return `agentClock gave no reading (${now.failure.kind})`
    const at = new Date(Date.parse(now.ok) + entry.delay).toISOString()
    const waited = await clock.waitUntil(at, signal)
    if ('failure' in waited) return `agentClock could not wait (${waited.failure.kind})`
    if (waited.ok !== 'elapsed' || signal.aborted) return undefined
    await run(key, entry, signal)
    return undefined
  }

  function schedule(key: string, entry: Driven): void {
    if (stopped) return
    const timer = new AbortController()
    entry.timer = timer
    const end = () => timer.abort()
    stopping.signal.addEventListener('abort', end, { once: true })
    void (async () => {
      let failed: string | undefined
      try {
        failed = await attempt(key, entry, timer.signal)
      } catch (error) {
        failed = `the run threw: ${describe(error)}`
      } finally {
        stopping.signal.removeEventListener('abort', end)
      }
      if (failed === undefined || stopped || entry.timer !== timer) return
      // The clock cannot pace this wait, so the process timer does; the entry stays driven.
      log('error', `reception: the maintenance of ${entry.execution} failed: ${failed}; it retries`)
      backoff(entry)
      try {
        await sleep(entry.delay, undefined, { signal: timer.signal, ref: false })
      } catch {
        return
      }
      if (!stopped && entry.timer === timer) schedule(key, entry)
    })()
  }

  async function run(key: string, entry: Driven, signal: AbortSignal): Promise<void> {
    const call = entry.recovered ? receiver.retry : receiver.recover
    const answer = await call({ access: entry.access, execution: entry.execution, signal })
    if (stopped || signal.aborted) return
    if ('ok' in answer) {
      entry.recovered = true
      if (answer.ok.pending === 0) {
        driven.delete(key)
        return
      }
    } else if (answer.failure.kind === 'denied') {
      log('warn', `reception: the maintenance of ${entry.execution} was denied; it stops`)
      driven.delete(key)
      return
    }
    backoff(entry)
    schedule(key, entry)
  }

  /** The executions whose work this state still holds, with the access their receptions kept. */
  function adopt(): void {
    for (const item of state.outbound.values())
      if (item.kind === 'pending') known(item.access, item.target.execution)
    for (const reception of state.receptions.values())
      if (reception.commit.kind === 'unknown') known(reception.access, reception.target.execution)
  }

  // The receiver checks `receive-result` on the original execution before it reads or writes. An
  // allowed answer is the admission of the push, and only that makes its access the driver's.
  const access: AgentAccessCheck<unknown> = {
    async check(request) {
      const answer = await ctx.agentAccessCheck.check(request)
      if (
        answer.kind === 'allowed' &&
        request.operation === 'receive-result' &&
        request.target.kind === 'execution'
      )
        known(request.access, request.target.execution)
      return answer
    },
  }
  const models: ModelReceiverDependencies<unknown>['models'] = {
    inspect: query => ctx.modelRuntime.calls.inspect(query),
    dispatches: query => ctx.modelRuntime.calls.dispatches(query),
  }
  const capacity = Object.freeze({
    records: settings.records,
    bytes: settings.bytes,
    attachments: settings.attachments,
    inFlight: settings.inFlight,
  })
  const built = createLocalModelReceiver<unknown>(
    {
      provider: {
        journal: ctx.agentJournal,
        entries: ctx.agentJournalEntries,
        materials: ctx.agentMaterials,
        received: ctx.agentReceivedCommits,
      },
      access,
      targets: ctx.agentModelReceptionTargets,
      outlet: ctx.agentAccountOutlet,
      models,
      capacity: () => capacity,
    },
    state,
  )
  // `agentReceivedCommits` is a provided service, never null, so the factory supports it.
  if ('failure' in built) throw new Error('agent-host: the received commits port is unsupported')
  const receiver = built.ok
  const removal = ctx.modelRuntime.registerResultReceiver(AGENT_CONSUMER_OWNER, receiver)
  adopt()
  log('info', `reception: the Model result receiver is registered under ${AGENT_CONSUMER_OWNER}`)

  return {
    receiver,
    stop() {
      if (stopped) return
      stopped = true
      removal()
      stopping.abort()
      for (const entry of driven.values()) entry.timer?.abort()
      driven.clear()
    },
  }
}
