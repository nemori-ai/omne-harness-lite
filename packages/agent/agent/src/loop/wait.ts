import { setImmediate as yieldTurn } from 'node:timers/promises'
import type {
  Access,
  AgentExecutionId,
  AgentOperationId,
  ExecutionRevision,
  ExecutionSnapshot,
  Failure,
  Waiting,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { producersHolding } from './contact.ts'
import type { LoopPorts } from './coordinator.ts'
import { diagnosticOf } from './diagnostic.ts'
import type { ReconciliationPacer } from './reconciliation.ts'

export type { ReconciliationPacer }

/** The instant `delayMs` after `now`, or unavailable when it leaves the UTC instant range. */
function checkTimeAfter(now: string, delayMs: number): Outcome<string, Failure> {
  const at = new Date(Date.parse(now) + delayMs)
  if (!Number.isFinite(at.getTime()) || at.getUTCFullYear() > 9999)
    return fail({
      kind: 'unavailable',
      owner: 'agentClock',
      diagnostic: 'check time exceeds the UTC instant range',
    })
  return succeed(at.toISOString())
}

/** The revision and the event cursor of one execution that the coordinator knows exactly. */
export type HeldPosition = Readonly<{
  revision: ExecutionRevision
  emittedThrough: string | null
}>

type WaitInput<P> = Readonly<{
  ports: LoopPorts<P>
  access: Access<P>
  execution: AgentExecutionId
  expected: ExecutionRevision
  operations: readonly AgentOperationId[]
  waits: readonly Waiting[]
  position: string
  pacer: ReconciliationPacer
  signal: AbortSignal
  recheck?: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null
  held?: HeldPosition | null
}>
type Woken = Outcome<'ready' | 'cancelled' | 'unheld', Failure>
type Timing = { timer: Promise<Woken> | null }

function armed<P>(
  clock: LoopPorts<P>['clock'],
  checkAt: string,
  signal: AbortSignal,
  due: Woken,
): Promise<Woken> {
  return clock.waitUntil(checkAt, signal).then(
    result => {
      if ('failure' in result) return result
      return result.ok === 'elapsed' ? due : succeed('cancelled' as const)
    },
    error =>
      fail({
        kind: 'unavailable' as const,
        owner: '@omne-harness/agent#defect',
        diagnostic: diagnosticOf(error),
      }),
  )
}

async function sleep<P>(
  input: WaitInput<P>,
  first: Readonly<{ checkAt: string; delayMs: number }>,
  notified: Promise<Woken>,
  signal: AbortSignal,
  timing: Timing,
): Promise<Woken> {
  let { checkAt, delayMs } = first
  for (;;) {
    const due: Woken = succeed('ready')
    const timer = armed(input.ports.clock, checkAt, signal, due)
    timing.timer = timer
    if (signal.aborted) return succeed('cancelled')
    const woken = await Promise.race([notified, timer])
    const timed = woken === due
    if (timed) input.pacer.timerWoke()
    const holding = timed ? await producersHolding(input.ports, input.access, input.waits) : null
    if (holding !== true) {
      if (delayMs === 0 && 'ok' in woken && woken.ok === 'ready') await yieldTurn()
      return holding === false ? succeed('unheld') : woken
    }
    if (delayMs === 0) await yieldTurn()
    delayMs = input.pacer.delayAt(input.expected)
    const now = await input.ports.clock.now()
    if ('failure' in now) return now
    const next = checkTimeAfter(now.ok, delayMs)
    if ('failure' in next) return next
    checkAt = next.ok
  }
}

/**
 * W0 (loop-algorithm W0 row, mechanisms "等待、唤醒与公平"): start the observation of the Journal
 * events, read the execution again, and sleep until an event, the check time or an abort when
 * nothing moved. `held` is the position the coordinator already knows: the observation starts at
 * its cursor and replaces the wait's own first read, so the wait reads the execution once (perf
 * baseline 2.3: at most one complete read per entry into a wait). Without `held`, the wait reads a
 * baseline first.
 */
export async function waitForExecutionChange<P>(input: WaitInput<P>): Promise<Woken> {
  const { ports, access, execution, signal } = input
  if (signal.aborted) return succeed('cancelled')
  const delayMs = input.pacer.delayAt(input.expected)
  const now = await ports.clock.now()
  if (signal.aborted) return succeed('cancelled')
  if ('failure' in now) return now
  const checked = checkTimeAfter(now.ok, delayMs)
  if ('failure' in checked) return checked
  const checkAt = checked.ok
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  let wake: (value: Woken) => void = () => {}
  const notified = new Promise<Woken>(resolve => {
    wake = resolve
  })
  const tasks: Promise<void>[] = []
  const timing: Timing = { timer: null }
  let timerOutcome: Woken | null = null
  let pumpFailure: Failure | null = null
  const changed = () => wake(succeed('ready'))
  const failed = (error: unknown) => {
    pumpFailure ??= {
      kind: 'unavailable',
      owner: '@omne-harness/agent#defect',
      diagnostic: diagnosticOf(error),
    }
    wake(fail(pumpFailure))
  }
  /** The held position, or the baseline read: the wait's start. `null` when the read failed. */
  const start = async (): Promise<Outcome<HeldPosition | null, Failure>> => {
    if (input.held != null) return succeed(input.held)
    const baseline = await ports.journal.load({ ...access, execution })
    if ('ok' in baseline)
      return succeed({
        revision: baseline.ok.revision,
        emittedThrough: baseline.ok.output.emittedThrough,
      })
    return baseline.failure.kind === 'unavailable' ? succeed(null) : baseline
  }
  const run = async (): Promise<Woken> => {
    try {
      const started = await start()
      if ('failure' in started) return started
      const from = started.ok
      if (input.operations.length === 0 && from !== null && from.revision !== input.expected)
        return succeed('ready')
      // Durable replay from this cursor also covers a change before the iterator starts listening.
      if (from !== null)
        tasks.push(
          (async () => {
            for await (const page of ports.journal.output.events({
              ...access,
              execution,
              after: from.emittedThrough,
              signal: controller.signal,
            })) {
              if (controller.signal.aborted) return
              if ('ok' in page && (page.ok.kind === 'gap' || page.ok.events.length > 0)) {
                changed()
                return
              }
            }
          })().catch(failed),
        )
      // Observation consumption starts before this read. Replay, the initial snapshot and the
      // clock cover the window because these ports provide no registration-ready receipt.
      const latest = await ports.journal.load({ ...access, execution })
      if (input.operations.length === 0 && 'ok' in latest && latest.ok.revision !== input.expected)
        return succeed('ready')
      if ('failure' in latest && latest.failure.kind !== 'unavailable') return latest
      let operationsReady = input.operations.length > 0
      for (const operation of input.operations) {
        const queried = await ports.journal.query({ ...access, execution, operation })
        if ('failure' in queried) {
          if (queried.failure.kind !== 'unavailable') return queried
          operationsReady = false
          continue
        }
        switch (queried.ok.kind) {
          case 'committed':
          case 'excluded':
          case 'rejected':
            // Settled, including a durable refusal: the operation no longer holds the wait.
            break
          case 'unknown':
            operationsReady = false
            break
        }
      }
      if (operationsReady && 'ok' in latest) return succeed('ready')
      if ('ok' in latest && input.recheck != null) {
        const rechecked = await input.recheck(latest.ok)
        if ('ok' in rechecked) return succeed('ready')
        if (rechecked.failure.kind !== 'unavailable') return rechecked
      }
      const stop = () => wake(succeed('cancelled'))
      controller.signal.addEventListener('abort', stop, { once: true })
      return await sleep(input, { checkAt, delayMs }, notified, controller.signal, timing)
    } finally {
      signal.removeEventListener('abort', abort)
      controller.abort()
      const settled = await Promise.all([Promise.all(tasks), timing.timer])
      timerOutcome = settled[1]
    }
  }
  const result = await run()
  if (pumpFailure !== null) return fail(pumpFailure)
  const timed: Woken | null = timerOutcome
  if (timed !== null && 'failure' in timed) return timed
  if (signal.aborted && 'ok' in result) return succeed('cancelled')
  return result
}
