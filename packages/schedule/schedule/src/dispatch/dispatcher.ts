import type {
  ScheduleCandidate,
  ScheduleInstant,
  ScheduleOwner,
  SchedulePurpose,
} from '@omne-harness/schedule-contract'
import type { ScheduleRecord } from '../management/types.ts'
import { decideAdmission, type AdmissionFacts } from './admission.ts'
import { admissionRefs } from './refs.ts'
import type {
  DispatchCommand,
  DispatchSchedule,
  DispatchState,
  DispatchStore,
  WatchCause,
} from './types.ts'

export type Prediction =
  | Readonly<{ kind: 'ok'; next: ScheduleCandidate | null }>
  | Readonly<{ kind: 'unavailable' }>

export type OwnerStanding =
  | Readonly<{ kind: 'eligible' }>
  | Readonly<{ kind: 'refused' | 'terminal'; reason: string }>
  | Readonly<{ kind: 'unknown' }>

export type DispatcherTime = Readonly<{
  now(): number
  after(delayMs: number, fire: () => void): () => void
  at(epochMs: number, fire: () => void): () => void
}>

export type DispatcherPorts = Readonly<{
  owner: ScheduleOwner
  store: DispatchStore
  /** The first candidate strictly after the instant, under the schedule's current definition and counts. */
  predict(record: ScheduleRecord, afterExclusive: ScheduleInstant): Promise<Prediction>
  /** The carriers the purpose names that this deployment does not have now. */
  missingCarriers(purpose: SchedulePurpose): readonly string[]
  standing(owner: ScheduleOwner): Promise<OwnerStanding>
  time: DispatcherTime
  policy: Readonly<{ intervalMs: number; gapMs: number; roundLimit: number }>
  report?: (error: unknown) => void
}>

export type RoundReport = Readonly<{
  kind: 'done' | 'unavailable'
  refreshed: number
  disposed: number
}>

const admissionIds = (...args: Parameters<typeof admissionRefs>) => {
  const { receiptId, jobId } = admissionRefs(...args)
  return { receiptId, jobId }
}
const iso = (epochMs: number) => new Date(epochMs).toISOString() as ScheduleInstant
const REMINDER_WINDOW_MS = 5 * 60_000
/** A reminder is first accepted in [W, deadline): W plus five minutes, or the next valid slot if that is sooner. */
export function reminderDeadline(
  slot: ScheduleCandidate,
  next: ScheduleCandidate | null,
): ScheduleInstant {
  const window = iso(Date.parse(slot.scheduledAt) + REMINDER_WINDOW_MS)
  return next !== null && next.scheduledAt < window ? next.scheduledAt : window
}
const later = (left: ScheduleInstant | null, right: ScheduleInstant) =>
  left !== null && left > right ? left : right

/** Since when a schedule is watched, from the management change that made its state stale. */
function watching(
  item: DispatchSchedule,
  at: ScheduleInstant,
): Pick<DispatchState, 'watchedFrom' | 'watchedCause'> {
  const { state, latest, record } = item
  if (state !== null && latest?.action === 'resume')
    return { watchedFrom: latest.occurredAt, watchedCause: 'resumed' }
  if (state !== null) return { watchedFrom: state.watchedFrom, watchedCause: state.watchedCause }
  const enabled = latest !== null && (latest.action === 'create' || latest.action === 'promote')
  const cause: WatchCause = enabled && record.activationExclusive !== null ? 'enabled' : 'takeover'
  return {
    watchedFrom: cause === 'enabled' ? (record.activationExclusive as ScheduleInstant) : at,
    watchedCause: cause,
  }
}

async function refreshCommand(
  ports: DispatcherPorts,
  item: DispatchSchedule,
  at: ScheduleInstant,
): Promise<DispatchCommand | null> {
  const { record } = item
  const watched = watching(item, at)
  let next: ScheduleCandidate | null = null
  if (record.view.control === 'active') {
    const after = later(item.state?.disposedThrough ?? null, watched.watchedFrom)
    const predicted = await ports.predict(record, after)
    if (predicted.kind === 'unavailable') return null
    next = predicted.next
  }
  const state: DispatchState = {
    ...watched,
    revision: record.view.revision,
    disposedThrough: item.state?.disposedThrough ?? null,
    next,
    block: item.state?.block ?? null,
  }
  const command: DispatchCommand = {
    kind: 'refresh',
    owner: ports.owner,
    scheduleId: record.view.scheduleId,
    revision: record.view.revision,
    state,
    at,
  }
  return command
}

async function admitCommand(
  ports: DispatcherPorts,
  item: DispatchSchedule,
  at: ScheduleInstant,
): Promise<DispatchCommand | null> {
  const { record, state } = item
  const slot = state?.next
  if (state === null || slot === null || slot === undefined) return null
  const standing = await ports.standing(ports.owner)
  if (standing.kind === 'unknown') return null
  const predicted = await ports.predict(record, slot.scheduledAt)
  if (predicted.kind === 'unavailable') return null
  const { view } = record
  const purpose = view.definition.purpose
  const prepared = {
    hasNext: predicted.next !== null,
    missingCarriers: ports.missingCarriers(purpose),
    reminderClosed:
      purpose.kind === 'reminder' ? at >= reminderDeadline(slot, predicted.next) : null,
    standing,
  } satisfies Pick<AdmissionFacts, 'hasNext' | 'missingCarriers' | 'reminderClosed' | 'standing'>
  const facts: AdmissionFacts = {
    slot: { disposed: false, earlierPending: false },
    control: view.control,
    basisCurrent: state.revision === view.revision,
    counts: {
      eligibleConsumed: view.eligibleConsumed,
      eligibleLimit: view.definition.limits.eligibleLimit,
      jobsAccepted: view.acceptedJobCount,
      jobLimit: view.definition.limits.jobLimit,
    },
    dependency:
      view.standing.kind === 'ready'
        ? { kind: 'ready' }
        : {
            kind: view.standing.kind === 'blocked' ? 'blocked' : 'terminal',
            reasons: view.standing.reasons,
          },
    overlap: { unfinished: item.unfinishedJobs, policy: purpose.overlap },
    ...prepared,
  }
  const decision = decideAdmission(facts)
  if (decision.kind === 'retreat' || decision.kind === 'recompute') return null
  if (
    (decision.kind === 'block' || decision.kind === 'invalidate') &&
    state.block?.kind === (decision.kind === 'block' ? 'blocked' : 'terminal') &&
    state.block.reasons.join('\n') === decision.reasons.join('\n')
  )
    return null
  const command: DispatchCommand = {
    kind: 'admit',
    owner: ports.owner,
    scheduleId: view.scheduleId,
    revision: view.revision,
    slot,
    next: predicted.next,
    prepared,
    decision,
    holding: record.quota,
    ...admissionIds(ports.owner, view.scheduleId, slot.scheduledAt),
    at,
  }
  return command
}

export function createDispatcher(ports: DispatcherPorts) {
  const { store, time, policy } = ports
  let stopping = false
  let inflight: Promise<RoundReport> | undefined
  let cancelWait = (): void => {}
  let cancelHint = (): void => {}

  const committed = async (command: DispatchCommand | null) =>
    command !== null && (await store.commit(command)).kind === 'committed'
  const refresh = async (item: DispatchSchedule, at: ScheduleInstant) =>
    committed(await refreshCommand(ports, item, at))
  const admit = async (item: DispatchSchedule, at: ScheduleInstant) =>
    committed(await admitCommand(ports, item, at))

  async function once(): Promise<RoundReport> {
    let refreshed = 0
    let disposed = 0
    let earliest: ScheduleInstant | null = null
    for (let step = 0; step < policy.roundLimit && !stopping; step += 1) {
      const at = iso(time.now())
      const pending = await store.pending(at, policy.roundLimit)
      if (pending.kind === 'unavailable') return { kind: 'unavailable', refreshed, disposed }
      const { stale, due, active } = pending.value
      earliest = pending.value.earliest
      if (step === 0 && active)
        await store.commit({ kind: 'beat', owner: ports.owner, at, gapMs: policy.gapMs })
      let moved = 0
      for (const item of stale) moved += Number(await refresh(item, at))
      refreshed += moved
      for (const item of due) {
        const done = Number(await admit(item, at))
        disposed += done
        moved += done
      }
      if (moved === 0) break
    }
    if (earliest !== null) hint(earliest)
    return { kind: 'done', refreshed, disposed }
  }

  /** One round: refresh what management changed, then dispose every due slot, each in its own commit. */
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

  return {
    round,
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
