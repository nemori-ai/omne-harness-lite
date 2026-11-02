import {
  deriveDriveOperation,
  type AgentDrivePort,
  type ControlProgress,
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

function originalExecution(snapshot: WorkSnapshot, progress: ControlProgress): string | null {
  if (progress.intent.kind !== 'control') return null
  const intent = progress.intent.value
  const target = progress.target
  if (intent.kind === 'cancel-run') {
    if (target.kind !== 'run' || target.run !== intent.run) return null
    const executions = snapshot.executions?.filter(item => item.run === target.run) ?? []
    return executions.length === 1 ? (executions[0]?.execution.execution ?? null) : null
  }
  if (intent.kind !== 'stop-call' && intent.kind !== 'background-tool') return null
  if (
    target.kind !== 'producer' ||
    target.producer.kind !== intent.producer.kind ||
    target.producer.call !== intent.producer.call
  )
    return null
  const bindings = snapshot.consumptions.filter(
    item =>
      item.binding.producer.kind === target.producer.kind &&
      item.binding.producer.call === target.producer.call,
  )
  const [binding] = bindings
  if (bindings.length !== 1 || binding === undefined || binding.binding.initiatingAttempt === null)
    return null
  const attempts =
    snapshot.historyIndex?.attempts.filter(
      item => item.attempt === binding.binding.initiatingAttempt,
    ) ?? []
  const [attempt] = attempts
  if (attempts.length !== 1 || attempt === undefined) return null
  const executions = snapshot.executions?.filter(item => item.run === attempt.run) ?? []
  const [execution] = executions
  if (executions.length !== 1 || execution?.execution.execution !== attempt.execution) return null
  return attempt.execution
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
  const step = async (
    ref: SessionRef,
    operation: ControlProgress['operation'],
    replay: Replay,
  ): Promise<'wait' | 'again' | 'stop'> => {
    const snapshot = await read(ref)
    if (snapshot === null) return 'stop'
    const progress = snapshot.controls.find(
      item => item.operation === operation && item.state === 'propagating',
    )
    if (progress === undefined || progress.intent.kind !== 'control') return 'stop'
    const execution = originalExecution(snapshot, progress)
    if (execution === null) return 'stop'
    const port = drive()
    replay.attempts += 1
    if (port === null || lifecycle.closed) return 'wait'
    const target = {
      ...ref,
      execution,
      operation: deriveDriveOperation({ kind: 'control', execution, control: progress.operation }),
    }
    try {
      if (replay.phase === 'query') {
        const answer = await port.query(target)
        if ('failure' in answer || answer.ok === 'unknown') return 'wait'
        if (answer.ok === 'committed') {
          replay.phase = 'stopped'
          return 'stop'
        }
        replay.phase = 'send'
        return 'again'
      }
      const answer = await port.control({
        ...target,
        control: progress.operation,
        intent: progress.intent.value,
      })
      if ('ok' in answer) return 'wait'
      if (answer.failure.kind === 'commit-unknown') {
        replay.phase = 'query'
        return 'again'
      }
      if (answer.failure.kind === 'busy' || answer.failure.kind === 'unavailable') return 'wait'
      replay.phase = 'stopped'
      return 'stop'
    } catch {
      return 'wait'
    }
  }
  const launch = (ref: SessionRef, progress: ControlProgress): void => {
    const key = `${sessionKey(ref)}\u0000${progress.operation}`
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
          let next: 'wait' | 'again' | 'stop' = 'stop'
          await scheduling.serial(sessionKey(ref), async () => {
            next = await step(ref, progress.operation, state)
          })
          if (next === 'stop') return
          if (next === 'wait' && !(await scheduling.wait(policy.controlReplay.intervalMs))) return
        }
      } finally {
        state.running = false
      }
    })
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
          } while (discovery.again && !lifecycle.closed)
        } finally {
          discoveries.delete(key)
        }
      })
    },
  }
}
