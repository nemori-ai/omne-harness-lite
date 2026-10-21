// One execution's W0 notification window. Streams provide hints; only the original Journal slots,
// snapshot, producer inspection and the original failed read establish progress. Closing this window stops no business work.
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
import type { LoopPorts } from './coordinator.ts'

export async function waitForExecutionChange<P>(
  input: Readonly<{
    ports: LoopPorts<P>
    access: Access<P>
    execution: AgentExecutionId
    expected: ExecutionRevision
    operations: readonly AgentOperationId[]
    waits: readonly Waiting[]
    position: string
    reconciliationDelayMs: number
    signal: AbortSignal
    recheck?: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null
  }>,
): Promise<Outcome<'ready' | 'cancelled', Failure>> {
  const { ports, access, execution, signal } = input
  if (signal.aborted) return succeed('cancelled')
  const now = await ports.clock.now()
  if (signal.aborted) return succeed('cancelled')
  if ('failure' in now) return now
  const at = new Date(Date.parse(now.ok) + input.reconciliationDelayMs)
  if (!Number.isFinite(at.getTime()) || at.getUTCFullYear() > 9999)
    return fail({
      kind: 'unavailable',
      owner: 'agentClock',
      diagnostic: 'check time exceeds the UTC instant range',
    })
  const checkAt = at.toISOString()
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  let wake: (value: Outcome<'ready' | 'cancelled', Failure>) => void = () => {}
  const notified = new Promise<Outcome<'ready' | 'cancelled', Failure>>(resolve => {
    wake = resolve
  })
  const tasks: Promise<void>[] = []
  let timer: Promise<Outcome<'ready' | 'cancelled', Failure>> | null = null
  let timerOutcome: Outcome<'ready' | 'cancelled', Failure> | null = null
  let pumpFailure: Failure | null = null
  const changed = () => wake(succeed('ready'))
  const failed = (error: unknown) => {
    pumpFailure ??= {
      kind: 'unavailable',
      owner: '@omne-harness/agent#defect',
      diagnostic: String(error),
    }
    wake(fail(pumpFailure))
  }
  const run = async (): Promise<Outcome<'ready' | 'cancelled', Failure>> => {
    try {
      const baseline = await ports.journal.load({ ...access, execution })
      if (
        input.operations.length === 0 &&
        'ok' in baseline &&
        baseline.ok.revision !== input.expected
      )
        return succeed('ready')
      if ('failure' in baseline && baseline.failure.kind !== 'unavailable') return baseline
      // Durable replay from this cursor also covers a change before the iterator starts listening.
      if ('ok' in baseline)
        tasks.push(
          (async () => {
            for await (const page of ports.journal.output.events({
              ...access,
              execution,
              after: baseline.ok.output.emittedThrough,
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
      for (const wait of input.waits) {
        if (wait.kind !== 'producer' || wait.pending.kind !== 'model') continue
        const reference = wait.pending.reference
        const route = await ports.models.instances.connect({ ...access, reference })
        if ('failure' in route || route.ok.kind !== 'live') continue
        const handle = route.ok.handle
        tasks.push(
          (async () => {
            for await (const seen of handle.observe({ ...access, signal: controller.signal })) {
              if (controller.signal.aborted || seen.kind === 'ended') return
              if (
                seen.kind === 'changed' ||
                (input.position === 'M1' && seen.value.state.phase === 'settled') ||
                input.position === 'M6'
              ) {
                changed()
                return
              }
            }
          })().catch(failed),
        )
      }
      // Observation consumption starts before these reads. Replay, the initial snapshot and the
      // clock cover the window because these ports provide no registration-ready receipt.
      const latest = await ports.journal.load({ ...access, execution })
      if (input.operations.length === 0 && 'ok' in latest && latest.ok.revision !== input.expected)
        return succeed('ready')
      if ('failure' in latest && latest.failure.kind !== 'unavailable') return latest
      let operationsReady = input.operations.length > 0
      for (const operation of input.operations) {
        const queried = await ports.journal.query({ ...access, execution, operation })
        if ('failure' in queried || queried.ok.kind === 'unknown') operationsReady = false
        if ('failure' in queried && queried.failure.kind !== 'unavailable') return queried
      }
      if (operationsReady && 'ok' in latest) return succeed('ready')
      for (const wait of input.waits) {
        if (wait.kind !== 'producer' || wait.pending.kind !== 'model') continue
        const read = await ports.models.calls.inspect({
          ...access,
          reference: wait.pending.reference,
        })
        if (
          'ok' in read &&
          read.ok.kind === 'found' &&
          (input.position === 'M6' ||
            (input.position === 'M1' && read.ok.state.phase === 'settled'))
        )
          return succeed('ready')
      }
      if ('ok' in latest && input.recheck != null) {
        const rechecked = await input.recheck(latest.ok)
        if ('ok' in rechecked) return succeed('ready')
        if (rechecked.failure.kind !== 'unavailable') return rechecked
      }
      // Install both handlers immediately. A rejecting clock must not remain unobserved while
      // slower stream cleanup runs, including an abort during the reads above.
      timer = ports.clock.waitUntil(checkAt, controller.signal).then(
        result => {
          if ('failure' in result) return result
          return succeed(result.ok === 'elapsed' ? ('ready' as const) : ('cancelled' as const))
        },
        error =>
          fail({
            kind: 'unavailable' as const,
            owner: '@omne-harness/agent#defect',
            diagnostic: String(error),
          }),
      )
      const stop = () => wake(succeed('cancelled'))
      controller.signal.addEventListener('abort', stop, { once: true })
      if (controller.signal.aborted) return succeed('cancelled')
      const result = await Promise.race([notified, timer])
      // A configured zero interval still yields the event loop; it is not a polling default.
      if (input.reconciliationDelayMs === 0 && 'ok' in result && result.ok === 'ready')
        await yieldTurn()
      return result
    } finally {
      signal.removeEventListener('abort', abort)
      controller.abort()
      const settled = await Promise.all([Promise.all(tasks), timer])
      timerOutcome = settled[1]
    }
  }
  const result = await run()
  if (pumpFailure !== null) return fail(pumpFailure)
  const timed: Outcome<'ready' | 'cancelled', Failure> | null = timerOutcome
  if (timed !== null && 'failure' in timed) return timed
  if (signal.aborted && 'ok' in result) return succeed('cancelled')
  return result
}
