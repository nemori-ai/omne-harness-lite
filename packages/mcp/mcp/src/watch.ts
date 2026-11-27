import type { Access, TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CorrelationKey,
  FollowedTask,
  McpClock,
  McpConfig,
  McpPorts,
  OperationFailure,
  Refusal,
  TaskArrival,
  TaskControl,
  TaskRef,
  TaskWatch,
  TaskWatchConfig,
} from '@omne-harness/mcp-contract'
import type { TaskRow, TaskRowKey } from '@omne-harness/mcp-contract/provider'
import { ask } from './internal/port.ts'
import { tenantTextOf } from './internal/text.ts'

/** Waits `ms`, or less when the signal aborts. */
export type TaskTimer = (ms: number, signal: AbortSignal) => Promise<void>

export type TaskWatchDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  clock: McpClock
  control: TaskControl<P>
  settings: TaskWatchConfig
  timer: TaskTimer
}>

export type ClosableTaskWatch<P> = TaskWatch<P> & Readonly<{ close(): void }>

const UNKNOWN: Refusal = { kind: 'unknown' }
const MAX_DOUBLINGS = 16

const viewOf = (row: TaskRow): FollowedTask => ({
  state: row.state,
  round: row.round,
  ...(row.arrival === undefined ? {} : { arrival: row.arrival }),
})

/** What a failed look says: the peer's own error or an unreadable answer ends the task as not known; the rest is looked at again. */
const endsUnknown = (failure: OperationFailure): boolean =>
  failure.kind === 'error-answer' || failure.kind === 'answer-malformed'

export function createTaskWatch<P, S>(deps: TaskWatchDependencies<P, S>): ClosableTaskWatch<P> {
  const { ports, config, clock, control, settings, timer } = deps
  const live = new Map<string, AbortController>()
  const listeners = new Set<(tenant: TenantId, call: CorrelationKey) => void>()
  let closed = false

  const keyOf = (access: Access<P>, task: TaskRef): TaskRowKey => ({
    tenant: access.tenant,
    principalKey: config.principalKey(access.principal),
    holding: task.ref.holding,
    taskId: task.taskId,
  })
  const textOf = (key: TaskRowKey) =>
    JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.holding, key.taskId])

  async function rowOf(
    key: TaskRowKey,
    task: TaskRef,
  ): Promise<Outcome<TaskRow, OperationFailure>> {
    const read = await ask(() => ports.tasks.read(key), fail('unavailable' as const))
    const row = 'ok' in read ? read.ok : undefined
    return typeof row !== 'object' || row.issuedAt !== task.issuedAt ? fail(UNKNOWN) : succeed(row)
  }

  function tell(tenant: TenantId, call: CorrelationKey): void {
    for (const arrived of listeners)
      try {
        arrived(tenant, call)
      } catch {}
  }

  /** Moves the row on from following; true when nothing is left to look at, false when the store could not be written. */
  async function arrive(key: TaskRowKey, row: TaskRow, arrival: TaskArrival): Promise<boolean> {
    const state = arrival.kind === 'input' ? 'awaiting' : 'arrived'
    const to = { state, round: row.round, arrival } as const
    const from = { state: 'following', round: row.round } as const
    const moved = await ask(() => ports.tasks.move(key, from, to), fail('unavailable' as const))
    if ('failure' in moved) return false
    if (moved.ok === 'moved') tell(key.tenant, row.call)
    return true
  }

  async function look(access: Access<P>, task: TaskRef, row: TaskRow) {
    if (row.expiresAt !== undefined && clock.now().getTime() >= row.expiresAt)
      return { arrival: { kind: 'expired' } as const }
    const report = await control.queryTask(access, task)
    if ('failure' in report)
      return endsUnknown(report.failure) ? { arrival: { kind: 'unknown' } as const } : 'again'
    if (report.ok === 'expired') return { arrival: { kind: 'expired' } as const }
    const { status, inputRequests, pollIntervalMs } = report.ok
    if (status === 'working') return { working: pollIntervalMs }
    if (status === 'input_required')
      return {
        arrival: {
          kind: 'input',
          ...(inputRequests === undefined ? {} : { inputRequests }),
        } as const,
      }
    return { arrival: { kind: 'terminal', status } as const }
  }

  async function follow(access: Access<P>, task: TaskRef, key: TaskRowKey, first: TaskRow) {
    const stop = new AbortController()
    const text = textOf(key)
    live.set(text, stop)
    let row = first
    let doublings = 0
    try {
      while (!stop.signal.aborted) {
        const interval = Math.max(settings.pollFloorMs, row.pollIntervalMs ?? 0)
        const delay = Math.min(interval * 2 ** doublings, Math.max(settings.backoffCapMs, interval))
        await timer(delay, stop.signal)
        if (stop.signal.aborted) return
        const seen = await look(access, task, row)
        if (seen === 'again') doublings = Math.min(doublings + 1, MAX_DOUBLINGS)
        else if ('working' in seen) {
          doublings = 0
          if (seen.working !== undefined) row = { ...row, pollIntervalMs: seen.working }
        } else if (await arrive(key, row, seen.arrival)) return
        else doublings = Math.min(doublings + 1, MAX_DOUBLINGS)
      }
    } finally {
      if (live.get(text) === stop) live.delete(text)
    }
  }

  return {
    async follow(access, task) {
      const key = keyOf(access, task)
      const row = await rowOf(key, task)
      if ('failure' in row) return row
      if (row.ok.state === 'following' && !closed && !live.has(textOf(key)))
        void follow(access, task, key, row.ok).catch(() => undefined)
      return succeed(viewOf(row.ok))
    },
    async drop(access, task, cancel) {
      const key = keyOf(access, task)
      const row = await rowOf(key, task)
      if ('failure' in row) return row
      const { state, round } = row.ok
      if (state !== 'following' && state !== 'awaiting') return succeed('already')
      const moved = await ask(
        () => ports.tasks.move(key, { state, round }, { state: 'dropped', round }),
        fail('unavailable' as const),
      )
      if ('failure' in moved) return fail(UNKNOWN)
      live.get(textOf(key))?.abort()
      if (moved.ok === 'stale') return succeed('already')
      if (cancel) await control.cancelTask(access, task).catch(() => undefined)
      return succeed('dropped')
    },
    async following(tenant) {
      const listed = await ask(() => ports.tasks.following(tenant), fail('unavailable' as const))
      return 'failure' in listed ? listed : succeed(listed.ok.map(item => item.row.call))
    },
    subscribe(arrived) {
      listeners.add(arrived)
      return () => void listeners.delete(arrived)
    },
    close() {
      closed = true
      for (const stop of live.values()) stop.abort()
      live.clear()
    },
  }
}
