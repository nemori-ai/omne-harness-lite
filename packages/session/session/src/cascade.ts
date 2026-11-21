import {
  deriveSessionOperation,
  type ProducerFact,
  type RecoveryTask,
  type SessionFaces,
  type SessionFailure,
} from '@omne-harness/session-contract'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'

export type CascadeDrive = Readonly<{ trigger(ref: SessionRef): void }>
type Task = Extract<RecoveryTask, { kind: 'cascade' }>
type Answer = 'archived' | 'later' | Readonly<{ refused: string }>
type Fact = Extract<ProducerFact, { kind: 'cascade' }>

/** A child that says no for good. Every other failure says nothing of the archive: the same drive is made again. */
const REFUSALS: ReadonlySet<SessionFailure['kind']> = new Set(['denied', 'invalid', 'not-found'])
const refusalOf = (failure: SessionFailure): Answer =>
  REFUSALS.has(failure.kind) ? { refused: failure.kind } : 'later'

/** Drives the cascade tasks an archived session saved: each child is archived under the identity its task fixes. */
export function createCascadeDrive<P>(
  input: Readonly<{
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    maintainer: SessionFaces<P>
  }>,
): CascadeDrive {
  const { lifecycle, policy, scheduling, maintainer } = input
  const running = new Map<string, { again: boolean }>()
  const drives = new Map<string, number>()

  const open = async (ref: SessionRef): Promise<readonly Task[]> => {
    const principal = await scheduling.principal('maintainer', ref)
    if (lifecycle.closed || 'failure' in principal) return []
    const snapshot = await maintainer.work.readWork({ principal: principal.ok, ...ref })
    if ('failure' in snapshot) return []
    return snapshot.ok.tasks.filter(
      (task): task is Task => task.kind === 'cascade' && task.state !== 'denied',
    )
  }

  /** The child is asked under the identity of the task, then read: only a child read as archived counts as archived. */
  const ask = async (parent: SessionRef, task: Task): Promise<Readonly<[Answer, Fact]>> => {
    const child = { tenant: parent.tenant, session: task.child }
    const fact = {
      kind: 'cascade',
      child: task.child,
      childOperation: task.childOperation,
    } as const
    const principal = await scheduling.principal('maintainer', child)
    if ('failure' in principal)
      return [refusalOf(principal.failure), { ...fact, source: task.basis }]
    const access = { principal: principal.ok, ...child }
    const asked = await maintainer.work.control({
      ...access,
      operation: task.childOperation,
      intent: task.intent,
    })
    const now = await maintainer.work.readWork(access)
    if ('ok' in now && now.ok.lifecycle === 'archived')
      return ['archived', { ...fact, source: now.ok.source }]
    return [
      'failure' in asked ? refusalOf(asked.failure) : 'later',
      { ...fact, source: task.basis },
    ]
  }

  const record = async (parent: SessionRef, fact: Fact): Promise<void> => {
    const principal = await scheduling.principal('maintainer', parent)
    if ('failure' in principal) return
    const operation = deriveSessionOperation({ kind: 'fact', fact })
    await maintainer.reconciliation.receive({
      principal: principal.ok,
      ...parent,
      operation,
      fact,
    })
  }

  const round = async (parent: SessionRef): Promise<boolean> => {
    let left = false
    for (const task of await open(parent)) {
      const key = `${sessionKey(parent)}\u0000${task.childOperation}`
      const made = drives.get(key) ?? 0
      if (made >= policy.cascade.maxDrives || lifecycle.closed) continue
      drives.set(key, made + 1)
      const [answer, fact] = await ask(parent, task)
      if (answer === 'later') left = true
      else {
        await record(
          parent,
          answer === 'archived' ? fact : { ...fact, refusal: { reason: answer.refused } },
        )
        drives.delete(key)
      }
    }
    return left
  }

  const run = async (parent: SessionRef, state: { again: boolean }): Promise<void> => {
    for (;;) {
      state.again = false
      const left = await round(parent).catch(() => true)
      if (lifecycle.closed || (!left && !state.again)) return
      if (state.again) continue
      const waited = await scheduling.wait(policy.cascade.intervalMs, lifecycle.signal)
      if (waited !== 'elapsed') return
    }
  }

  return {
    trigger(ref) {
      const key = sessionKey(ref)
      const state = running.get(key)
      if (state !== undefined) {
        state.again = true
        return
      }
      const started = { again: false }
      running.set(key, started)
      void run(ref, started).finally(() => running.delete(key))
    },
  }
}
