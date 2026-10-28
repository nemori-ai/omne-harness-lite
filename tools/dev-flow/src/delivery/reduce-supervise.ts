import type { WaveIdentity } from './collaboration-records.ts'
import { utcTime, uuid } from './collaboration-values.ts'
import { InputError } from './protocol.ts'
import { superviseJournal } from './reduce-supervise-journal.ts'
import { parseReduceSignal, reducePhases, signalKinds } from './reduce-supervise-values.ts'

export type ReduceSignal = {
  signalKind: (typeof signalKinds)[number]
  identity: string
  phase: (typeof reducePhases)[number]
  eventCursor: string | null
  observed: string
  evidence: unknown[]
  reasonCode: string
}
export type SuperviseInput = {
  context: WaveIdentity
  owner: string
  epoch: string
  operationId: string
  journalRoot: string
  phase: ReduceSignal['phase']
  deadline: string
  timeoutMs?: number
  healthIntervalMs?: number
  runIntervalMs?: number
  signal?: AbortSignal
}
export type SupervisePorts = {
  /** Attach before the initial reconcile. Notifications are hints only. */
  subscribe: (
    notify: (cursor: string | null) => void,
    fail: (error: unknown) => void,
  ) => { close: () => void }
  reconcile: () => Promise<ReduceSignal[]>
  health: () => Promise<ReduceSignal[]>
  /** Only registered, still-active runs. Implementations remove completed runs immediately. */
  pollActiveRuns: () => Promise<ReduceSignal[]>
  deadline: () => Promise<ReduceSignal[]>
  now?: () => number
  stop?: () => void
}
export type SuperviseResult = {
  schemaVersion: 1
  operation: 'supervise'
  status: 'actionable' | 'timeout' | 'cancelled'
  repo: string
  operationId: string
  evidence: unknown[]
  diagnostics: string[]
  pending: { id: string; signal: ReduceSignal }[]
  resume: {
    operationId: string
    context: WaveIdentity
    owner: string
    epoch: string
    phase: ReduceSignal['phase']
  }
}

/** Collection never advances request, wave or control state. The owner explicitly acknowledges facts. */
export function superviseReduce(
  input: SuperviseInput,
  ports: SupervisePorts,
): Promise<SuperviseResult> {
  uuid(input.operationId, 'operationId')
  uuid(input.epoch, 'epoch')
  const deadline = Date.parse(utcTime(input.deadline, 'deadline'))
  const healthMs = input.healthIntervalMs ?? 5000,
    runMs = input.runIntervalMs ?? 10_000
  if (
    ![healthMs, runMs, input.timeoutMs ?? 1].every(
      value => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647,
    )
  )
    throw new InputError('reduce-supervise-interval-invalid')
  const journal = superviseJournal(input),
    now = ports.now ?? Date.now
  return new Promise((resolve, reject) => {
    let closed = false
    const running = new Set<keyof typeof probes>(),
      pending = new Set<keyof typeof probes>()
    const probes = {
      reconcile: ports.reconcile,
      health: ports.health,
      runs: ports.pollActiveRuns,
      deadline: ports.deadline,
    }
    let subscription: ReturnType<SupervisePorts['subscribe']> | undefined
    let cursor: string | null = null
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const result = (status: SuperviseResult['status']): SuperviseResult => ({
      schemaVersion: 1,
      operation: 'supervise',
      status,
      repo: input.context.repo,
      operationId: input.operationId,
      evidence: journal.pending().flatMap(item => item.signal.evidence),
      diagnostics: [],
      pending: journal.pending(),
      resume: {
        operationId: input.operationId,
        context: input.context,
        owner: input.owner,
        epoch: input.epoch,
        phase: input.phase,
      },
    })
    function cleanup(): unknown[] {
      closed = true
      for (const timer of timers) clearTimeout(timer)
      const errors: unknown[] = []
      for (const dispose of [
        () => subscription?.close(),
        () => ports.stop?.(),
        () => input.signal?.removeEventListener('abort', cancel),
      ]) {
        try {
          dispose()
        } catch (error) {
          errors.push(error)
        }
      }
      return errors
    }
    function fail(error: unknown) {
      if (closed) return
      const errors = cleanup()
      reject(
        errors.length === 0
          ? error
          : new AggregateError([error, ...errors], 'reduce-supervise-cleanup-failed'),
      )
    }
    function finish(status: SuperviseResult['status']) {
      if (closed) return
      let output: SuperviseResult
      try {
        output = result(status)
      } catch (error) {
        fail(error)
        return
      }
      const errors = cleanup()
      if (errors.length > 0) reject(new AggregateError(errors, 'reduce-supervise-cleanup-failed'))
      else resolve(output)
    }
    function cancel() {
      finish('cancelled')
    }
    function probe(kind: keyof typeof probes) {
      if (closed) return
      if (running.has(kind)) {
        pending.add(kind)
        return
      }
      running.add(kind)
      void Promise.resolve()
        .then(() => (closed ? [] : probes[kind]()))
        .then(signals => {
          if (closed) return
          for (const raw of signals) {
            const signal = parseReduceSignal(raw)
            journal.add({
              ...signal,
              phase: input.phase,
              eventCursor: signal.eventCursor ?? cursor,
            })
          }
          if (journal.pending().length > 0) queueMicrotask(() => finish('actionable'))
        })
        .catch(fail)
        .finally(() => {
          running.delete(kind)
          if (pending.delete(kind)) probe(kind)
        })
    }
    function recurring(ms: number, mark: () => void) {
      let timer: ReturnType<typeof setTimeout>
      const tick = () => {
        timers.delete(timer)
        if (closed) return
        mark()
        timer = setTimeout(tick, ms)
        timers.add(timer)
      }
      timer = setTimeout(tick, ms)
      timers.add(timer)
    }
    try {
      subscription = ports.subscribe(value => {
        cursor = value
        probe('reconcile')
      }, fail)
      if (closed) {
        subscription.close()
        return
      }
      input.signal?.addEventListener('abort', cancel, { once: true })
      if (input.signal?.aborted) {
        cancel()
        return
      }
      if (journal.pending().length > 0) {
        finish('actionable')
        return
      }
      recurring(healthMs, () => {
        probe('health')
      })
      recurring(runMs, () => {
        probe('runs')
      })
      function deadlineTimer() {
        const timer = setTimeout(
          () => {
            timers.delete(timer)
            if (closed) return
            if (now() >= deadline) probe('deadline')
            else deadlineTimer()
          },
          Math.min(Math.max(0, deadline - now()), 2_147_483_647),
        )
        timers.add(timer)
      }
      deadlineTimer()
      if (input.timeoutMs !== undefined)
        timers.add(setTimeout(() => finish('timeout'), input.timeoutMs))
      probe('reconcile')
      probe('health')
      probe('runs')
    } catch (error) {
      fail(error)
    }
  })
}

export function acknowledgeReduceSignal(input: SuperviseInput, id: string, evidence: string): void {
  superviseJournal(input).acknowledge(id, evidence)
}
