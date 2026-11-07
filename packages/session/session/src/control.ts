import {
  deriveDriveOperation,
  type AgentDrivePort,
  type ControlProgress,
  type ProducerRef,
  type RunId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'
import type { SessionFaces } from '@omne-harness/session-contract'

export type ControlPropagation = Readonly<{ trigger(ref: SessionRef): void }>
type Replay = {
  phase: 'send' | 'query' | 'stopped'
  attempts: number
  running: boolean
}

type Next = 'wait' | 'again' | 'stop'
type ControlRequest = Parameters<AgentDrivePort['control']>[0]
/** What one round decided while holding the session lane: finish, or make this one outbound call. */
type Round =
  | Readonly<{ kind: 'done'; next: Next }>
  | Readonly<{ kind: 'call'; port: AgentDrivePort; request: ControlRequest }>

const only = <T>(items: readonly T[]): T | null => (items.length === 1 ? (items[0] ?? null) : null)

function cancelRunExecution(snapshot: WorkSnapshot, target: ControlProgress['target'], run: RunId) {
  if (target.kind !== 'run' || target.run !== run) return null
  const executions = snapshot.executions?.filter(item => item.run === run) ?? []
  return only(executions)?.execution.execution ?? null
}

function producerExecution(
  snapshot: WorkSnapshot,
  target: ControlProgress['target'],
  producer: ProducerRef,
) {
  if (
    target.kind !== 'producer' ||
    target.producer.kind !== producer.kind ||
    target.producer.call !== producer.call
  )
    return null
  const binding = only(
    snapshot.consumptions.filter(
      item =>
        item.binding.producer.kind === producer.kind &&
        item.binding.producer.call === producer.call,
    ),
  )
  const initiating = binding?.binding.initiatingAttempt ?? null
  if (initiating === null) return null
  const attempt = only(
    snapshot.historyIndex?.attempts.filter(item => item.attempt === initiating) ?? [],
  )
  if (attempt === null) return null
  const execution = only(snapshot.executions?.filter(item => item.run === attempt.run) ?? [])
  return execution?.execution.execution === attempt.execution ? attempt.execution : null
}

/** The execution the control's original Run ran on; null unless the history names exactly one. */
function originalExecution(snapshot: WorkSnapshot, progress: ControlProgress): string | null {
  if (progress.intent.kind !== 'control') return null
  const intent = progress.intent.value
  if (intent.kind === 'cancel-run') return cancelRunExecution(snapshot, progress.target, intent.run)
  if (intent.kind === 'stop-call' || intent.kind === 'background-tool')
    return producerExecution(snapshot, progress.target, intent.producer)
  return null
}

export function createControlPropagation<P>(
  input: Readonly<{
    dependencies: SessionDependencies<P>
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    coordinator: SessionFaces<P>
  }>,
): ControlPropagation {
  const { dependencies, lifecycle, policy, scheduling, coordinator } = input
  const replays = new Map<string, Replay>()
  const discoveries = new Map<string, { again: boolean }>()
  const read = async (ref: SessionRef): Promise<WorkSnapshot | null> => {
    const principal = await scheduling.principal('coordinator', ref)
    if (lifecycle.closed || 'failure' in principal) return null
    const snapshot = await coordinator.work.readWork({ principal: principal.ok, ...ref })
    return lifecycle.closed || 'failure' in snapshot ? null : snapshot.ok
  }
  const drive = (): AgentDrivePort | null => {
    try {
      return dependencies.agentDrive.current()
    } catch {
      return null
    }
  }
  const replayKey = (ref: SessionRef, operation: ControlProgress['operation']): string =>
    `${sessionKey(ref)}\u0000${operation}`
  const CLOSED = Symbol('closed')
  /** The outbound call cannot be cancelled; at close the result is dropped and the call left to end. */
  const untilClosed = <T>(work: Promise<T>): Promise<T | typeof CLOSED> =>
    new Promise((resolve, reject) => {
      const closed = (): void => resolve(CLOSED)
      if (lifecycle.signal.aborted) closed()
      lifecycle.signal.addEventListener('abort', closed, { once: true })
      const settle = (done: () => void): void => {
        lifecycle.signal.removeEventListener('abort', closed)
        done()
      }
      work.then(
        value => settle(() => resolve(value)),
        (error: unknown) => settle(() => reject(error)),
      )
    })
  /** Reads and judges under the session lane; the outbound call itself is left to `exchange`. */
  const plan = async (
    ref: SessionRef,
    operation: ControlProgress['operation'],
    replay: Replay,
  ): Promise<Round> => {
    const stop = { kind: 'done', next: 'stop' } as const
    const snapshot = await read(ref)
    if (snapshot === null) return stop
    const progress = snapshot.controls.find(item => item.operation === operation)
    if (progress?.state !== 'propagating') {
      if (progress !== undefined) replays.delete(replayKey(ref, operation))
      return stop
    }
    if (progress.intent.kind !== 'control') return stop
    const execution = originalExecution(snapshot, progress)
    if (execution === null) return stop
    const port = drive()
    replay.attempts += 1
    if (port === null || lifecycle.closed) return { kind: 'done', next: 'wait' }
    const request = {
      ...ref,
      execution,
      operation: deriveDriveOperation({ kind: 'control', execution, control: progress.operation }),
      control: progress.operation,
      intent: progress.intent.value,
    }
    return { kind: 'call', port, request }
  }
  // One round is one outbound step: a send, or a query of the earlier send. A send that ended
  // unknown is queried in the same round, so the smallest budget still asks before giving up.
  const exchange = async (
    round: Extract<Round, { kind: 'call' }>,
    replay: Replay,
  ): Promise<Next> => {
    const { port, request } = round
    if (lifecycle.closed) return 'stop'
    const asked = async (): Promise<Next> => {
      const answer = await untilClosed(
        port.query({
          tenant: request.tenant,
          session: request.session,
          execution: request.execution,
          operation: request.operation,
        }),
      )
      if (answer === CLOSED) return 'stop'
      if ('failure' in answer || answer.ok === 'unknown') {
        replay.phase = 'query'
        return 'wait'
      }
      if (answer.ok === 'committed') {
        replay.phase = 'stopped'
        return 'stop'
      }
      replay.phase = 'send'
      return 'again'
    }
    try {
      if (replay.phase === 'query') return await asked()
      const answer = await untilClosed(port.control(request))
      if (answer === CLOSED) return 'stop'
      if ('ok' in answer) return 'wait'
      if (answer.failure.kind === 'commit-unknown') {
        replay.phase = 'query'
        return lifecycle.closed ? 'stop' : await asked()
      }
      if (answer.failure.kind === 'busy' || answer.failure.kind === 'unavailable') return 'wait'
      replay.phase = 'stopped'
      return 'stop'
    } catch {
      return 'wait'
    }
  }
  const step = async (
    ref: SessionRef,
    operation: ControlProgress['operation'],
    replay: Replay,
  ): Promise<Next> => {
    let round: Round = { kind: 'done', next: 'stop' }
    await scheduling.serial(sessionKey(ref), async () => {
      round = await plan(ref, operation, replay)
    })
    return round.kind === 'done' ? round.next : exchange(round, replay)
  }
  const launch = (ref: SessionRef, progress: ControlProgress): void => {
    const key = replayKey(ref, progress.operation)
    let replay = replays.get(key)
    if (replay === undefined) {
      replay = { phase: 'send', attempts: 0, running: false }
      replays.set(key, replay)
    }
    if (
      replay.running ||
      replay.phase === 'stopped' ||
      replay.attempts >= policy.controlReplay.maxReplays
    )
      return
    replay.running = true
    const state = replay
    lifecycle.spawn(async () => {
      try {
        while (!lifecycle.closed && state.attempts < policy.controlReplay.maxReplays) {
          const next = await step(ref, progress.operation, state)
          if (next === 'stop') return
          if (
            next === 'wait' &&
            (await scheduling.wait(policy.controlReplay.intervalMs)) !== 'elapsed'
          )
            return
        }
      } finally {
        state.running = false
      }
    })
  }
  /** A control that left `propagating` needs no replay record; one still running drops its own. */
  const settle = (ref: SessionRef, progress: ControlProgress): void => {
    const key = replayKey(ref, progress.operation)
    if (replays.get(key)?.running !== true) replays.delete(key)
  }
  return {
    trigger: ref => {
      if (lifecycle.closed) return
      const key = sessionKey(ref)
      const existing = discoveries.get(key)
      if (existing !== undefined) {
        existing.again = true
        return
      }
      const discovery = { again: false }
      discoveries.set(key, discovery)
      lifecycle.spawn(async () => {
        try {
          do {
            discovery.again = false
            const snapshot = await read(ref)
            if (snapshot !== null)
              for (const progress of snapshot.controls)
                if (progress.state === 'propagating') launch(ref, progress)
                else settle(ref, progress)
          } while (discovery.again && !lifecycle.closed)
        } finally {
          discoveries.delete(key)
        }
      })
    },
  }
}
