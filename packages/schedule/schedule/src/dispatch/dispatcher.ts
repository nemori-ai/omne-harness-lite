import type { ScheduleInstant } from '@omne-harness/schedule-contract'
import { coordinateJob } from './coordinate.ts'
import { admitCommand, iso, refreshCommand, type DispatcherPorts } from './prepare.ts'
import type { ScheduleJobId, ScheduleWork } from '@omne-harness/schedule-contract'
import { advanceJob, type JobFacts } from './job.ts'
import { directJobId } from './refs.ts'
import type { DispatchCommand } from './types.ts'

export type CancelAnswer =
  | Readonly<{ kind: 'changed' | 'unchanged'; facts: JobFacts }>
  | Readonly<{ kind: 'absent' | 'unknown' }>
export type DirectAnswer =
  | Readonly<{ kind: 'started'; jobId: ScheduleJobId; replayed: boolean }>
  | Readonly<{ kind: 'unknown' | 'conflict'; jobId: ScheduleJobId }>

export {
  reminderDeadline,
  type DispatcherPorts,
  type DispatcherTime,
  type OwnerStanding,
  type Prediction,
  type PredictionPage,
} from './prepare.ts'

export type RoundReport = Readonly<{
  kind: 'done' | 'unavailable'
  refreshed: number
  disposed: number
}>

/** The store as the dispatcher uses it: readers hear of each committed change, the heartbeat aside. */
function telling(ports: DispatcherPorts): DispatcherPorts['store'] {
  const { store, changed } = ports
  if (changed === undefined) return store
  return {
    ...store,
    async commit(command) {
      const result = await store.commit(command)
      if (result.kind === 'committed' && command.kind !== 'beat') changed()
      return result
    },
  }
}

export function createDispatcher(ports: DispatcherPorts) {
  const { time, policy } = ports
  const store = telling(ports)
  let stopping = false
  let inflight: Promise<RoundReport> | undefined
  let cancelWait = (): void => {}
  let cancelHint = (): void => {}

  const committed = async (command: DispatchCommand | null) =>
    command !== null && (await store.commit(command)).kind === 'committed'

  /** One round: the heartbeat first, then what management changed, then every due slot, each in its own commit. */
  async function once(): Promise<RoundReport> {
    let refreshed = 0
    let disposed = 0
    let earliest: ScheduleInstant | null = null
    await store.commit({
      kind: 'beat',
      owner: ports.owner,
      at: iso(time.now()),
      gapMs: policy.gapMs,
    })
    for (let step = 0; step < policy.roundLimit && !stopping; step += 1) {
      const at = iso(time.now())
      const pending = await store.pending(at, policy.roundLimit)
      if (pending.kind === 'unavailable') return { kind: 'unavailable', refreshed, disposed }
      const { stale, due, watch, jobs } = pending.value
      earliest = pending.value.earliest
      let moved = 0
      for (const item of stale)
        moved += Number(await committed(await refreshCommand(ports, item, at)))
      refreshed += moved
      for (const item of due) {
        const done = Number(await committed(await admitCommand(ports, item, watch, at)))
        disposed += done
        moved += done
      }
      const coordination = { owner: ports.owner, executor: ports.executor, commit: committed }
      for (const job of jobs) moved += await coordinateJob(coordination, job, at)
      if (moved === 0) break
    }
    if (earliest !== null) hint(earliest)
    return { kind: 'done', refreshed, disposed }
  }

  function round(): Promise<RoundReport> {
    if (stopping) return Promise.resolve({ kind: 'done', refreshed: 0, disposed: 0 })
    inflight ??= once().finally(() => {
      inflight = undefined
    })
    return inflight
  }

  /** A wall-clock hint for the next due slot; the periodic round stays the authority. */
  function hint(at: ScheduleInstant): void {
    cancelHint()
    if (stopping) return
    cancelHint = time.at(Date.parse(at), () => void round().catch(error => ports.report?.(error)))
  }

  function arm(): void {
    if (stopping) return
    cancelWait = time.after(policy.intervalMs, () => {
      void round()
        .catch(error => ports.report?.(error))
        .finally(arm)
    })
  }

  /** Cancels one Job: before its start it never starts; once started a stop is asked; a concluded Job keeps its outcome. */
  async function cancel(jobId: ScheduleJobId, operation?: string): Promise<CancelAnswer> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const read = await store.job(jobId)
      if (read.kind === 'unavailable') return { kind: 'unknown' }
      if (read.value === null) return { kind: 'absent' }
      const job = read.value
      const step = advanceJob(job.facts, { kind: 'cancel' })
      if (step.kind !== 'move') return { kind: 'unchanged', facts: job.facts }
      const result = await store.commit({
        kind: 'step',
        owner: ports.owner,
        jobId,
        revision: job.revision,
        event: { kind: 'cancel' },
        next: step.next,
        at: iso(time.now()),
        ...(operation === undefined ? {} : { operation }),
      })
      if (result.kind === 'committed') return { kind: 'changed', facts: step.next }
      if (result.kind === 'unknown') return { kind: 'unknown' }
    }
    return { kind: 'unknown' }
  }

  /** Starts a Job outside any schedule: no slot, no count; the same key answers the same Job. */
  async function startDirect(
    work: ScheduleWork,
    key: string,
    by: 'human' | 'agent' | 'system' = 'system',
  ): Promise<DirectAnswer> {
    const jobId = directJobId(ports.owner, key)
    const result = await store.commit({
      kind: 'direct',
      owner: ports.owner,
      jobId,
      work,
      at: iso(time.now()),
      by,
    })
    if (result.kind === 'committed') return { kind: 'started', jobId, replayed: result.replayed }
    return { kind: result.kind === 'stale' ? 'conflict' : 'unknown', jobId }
  }

  return {
    round,
    cancel,
    startDirect,
    start(): void {
      void round()
        .catch(error => ports.report?.(error))
        .finally(arm)
    },
    async close(): Promise<void> {
      stopping = true
      cancelWait()
      cancelHint()
      await inflight?.catch(() => undefined)
    },
  }
}
