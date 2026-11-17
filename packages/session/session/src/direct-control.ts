import {
  controlRoutes,
  type ControlProgress,
  type DirectCallControl,
  type SessionCallControl,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { Current } from './dependencies.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'

/** Sends the controls of backgrounded calls to Tool by reference; nobody waits on those calls. */
export type DirectControl = Readonly<{
  launch(ref: SessionRef, snapshot: WorkSnapshot, progress: ControlProgress): void
  forget(ref: SessionRef, operation: ControlProgress['operation']): void
}>

type Send = { attempts: number; running: boolean; done: boolean }

const AGAIN: ReadonlySet<string> = new Set(['unavailable', 'commit-unknown'])

export function createDirectControl<P>(
  input: Readonly<{
    port: Current<SessionCallControl>
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
  }>,
): DirectControl {
  const { port, lifecycle, policy, scheduling } = input
  const sends = new Map<string, Send>()
  const prefix = (ref: SessionRef, operation: string) =>
    `${sessionKey(ref)}\u0000${operation}\u0000`

  const once = async (
    ref: SessionRef,
    progress: ControlProgress,
    target: DirectCallControl,
  ): Promise<'done' | 'again'> => {
    let current: SessionCallControl | null
    try {
      current = port.current()
    } catch {
      current = null
    }
    if (current === null || lifecycle.closed) return 'again'
    try {
      const answer = await current.control({
        tenant: ref.tenant,
        session: ref.session,
        control: progress.operation,
        producer: target.producer,
        intent: target.intent,
      })
      return 'ok' in answer || !AGAIN.has(answer.failure.kind) ? 'done' : 'again'
    } catch {
      return 'again'
    }
  }

  const run = (ref: SessionRef, progress: ControlProgress, target: DirectCallControl, send: Send) =>
    lifecycle.spawn(async () => {
      try {
        while (!lifecycle.closed && send.attempts < policy.controlReplay.maxReplays) {
          send.attempts += 1
          if ((await once(ref, progress, target)) === 'done') {
            send.done = true
            return
          }
          if ((await scheduling.wait(policy.controlReplay.intervalMs)) !== 'elapsed') return
        }
      } finally {
        send.running = false
      }
    })

  return {
    launch: (ref, snapshot, progress) => {
      for (const target of controlRoutes(snapshot, progress).direct) {
        const key = `${prefix(ref, progress.operation)}${target.producer.call}\u0000${target.intent}`
        let send = sends.get(key)
        if (send === undefined) {
          send = { attempts: 0, running: false, done: false }
          sends.set(key, send)
        }
        if (send.running || send.done || send.attempts >= policy.controlReplay.maxReplays) continue
        send.running = true
        run(ref, progress, target, send)
      }
    },
    forget: (ref, operation) => {
      const start = prefix(ref, operation)
      for (const [key, send] of sends) if (key.startsWith(start) && !send.running) sends.delete(key)
    },
  }
}
