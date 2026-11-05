// The maintenance driver of one result receiver of the `agent-host` plugin (SPEC "结果接收",
// R2-D250). The Model receiver (`reception.ts`) and the Tool receiver (`tool-reception.ts`) each
// own one; the driver knows only the two maintenance calls of its receiver.
//
// - An execution becomes known when a push of it passed the receiver's `receive-result` check; the
//   access of that push is the access of the runs. A refused push changes nothing.
// - The first run in this driver calls `recover`, later runs call `retry`, as long as the report
//   keeps pending work. The wait between two runs starts at `retryMs` and doubles up to
//   `retryMaxMs`; the clock is `agentClock`. A clock that gives no reading or cannot wait, or a run
//   that throws, is retried after the same backoff on the process timer, so one failure does not
//   end the driving. A `denied` answer ends the driving of that execution with a warning.
// - A run in flight when the driver stops is aborted through its signal; the receiver keeps every
//   accepted commit and every handoff.
import { setTimeout as sleep } from 'node:timers/promises'
import type {
  Access,
  AgentAccessCheck,
  AgentClock,
  AgentExecutionId,
  Reply,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'

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

export type Log = (level: 'error' | 'warn' | 'info', message: string) => void

type Maintenance = Readonly<{
  access: Access<unknown>
  execution: AgentExecutionId
  signal: AbortSignal
}>

/** The two maintenance calls of a receiver, read when a run starts. */
export type Maintained = Readonly<{
  recover(input: Maintenance): Reply<Readonly<{ pending: number }>>
  retry(input: Maintenance): Reply<Readonly<{ pending: number }>>
}>

export type ReceptionDriver = Readonly<{
  /** A push of `execution` passed `receive-result` with `access`: drive its maintenance with it. */
  known(access: Access<unknown>, execution: AgentExecutionId): void
  /** The access check that makes every allowed `receive-result` known to this driver. */
  admitting(check: AgentAccessCheck<unknown>): AgentAccessCheck<unknown>
  /** Ends every wait and run. Idempotent. */
  stop(): void
}>

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

export function createReceptionDriver(
  input: Readonly<{
    clock: AgentClock
    settings: ReceptionSettings
    log: Log
    /** The receiver, named in the log lines (`reception` or `tool reception`). */
    label: string
    receiver: () => Maintained
  }>,
): ReceptionDriver {
  const { clock, settings, log, label } = input
  const driven = new Map<string, Driven>()
  const stopping = new AbortController()
  let stopped = false

  const keyOf = (access: Access<unknown>, execution: AgentExecutionId): string | undefined => {
    const tenant = tenantCodec.encode(access.tenant)
    return tenant.ok ? JSON.stringify([tenant.value, execution]) : undefined
  }

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
      log('error', `${label}: the maintenance of ${entry.execution} failed: ${failed}; it retries`)
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
    const receiver = input.receiver()
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
      log('warn', `${label}: the maintenance of ${entry.execution} was denied; it stops`)
      driven.delete(key)
      return
    }
    backoff(entry)
    schedule(key, entry)
  }

  // The receiver checks `receive-result` on the original execution before it reads or writes. An
  // allowed answer is the admission of the push, and only that makes its access the driver's.
  const admitting = (check: AgentAccessCheck<unknown>): AgentAccessCheck<unknown> => ({
    async check(request) {
      const answer = await check.check(request)
      if (
        answer.kind === 'allowed' &&
        request.operation === 'receive-result' &&
        request.target.kind === 'execution'
      )
        known(request.access, request.target.execution)
      return answer
    },
  })

  return {
    known,
    admitting,
    stop() {
      if (stopped) return
      stopped = true
      stopping.abort()
      for (const entry of driven.values()) entry.timer?.abort()
      driven.clear()
    },
  }
}
