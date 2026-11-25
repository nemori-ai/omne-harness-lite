import type {
  ScheduleCandidate,
  ScheduleInstant,
  ScheduleOwner,
  ScheduleJobExecutor,
  SchedulePurpose,
  ScheduleWork,
} from '@omne-harness/schedule-contract'
import type { ScheduleRecord } from '../management/types.ts'
import { decideAdmission, type AdmissionFacts } from './admission.ts'
import { classifyMissed, missCause, type MissCause } from './classify.ts'
import { admissionRefs } from './refs.ts'
import type {
  DispatchCommand,
  DispatchPending,
  DispatchSchedule,
  DispatchState,
  DispatchStore,
  WatchCause,
} from './types.ts'

export type Prediction =
  | Readonly<{ kind: 'ok'; next: ScheduleCandidate | null }>
  | Readonly<{ kind: 'unavailable' }>
export type PredictionPage =
  | Readonly<{ kind: 'ok'; candidates: readonly ScheduleCandidate[]; complete: boolean }>
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
  /** Up to `count` candidates strictly after the instant; `counted` eligible slots lie at or before it. */
  predict(
    record: ScheduleRecord,
    afterExclusive: ScheduleInstant,
    count: number,
    counted: number,
  ): Promise<PredictionPage>
  /** The carriers the purpose names that this deployment does not have now. */
  missingCarriers(purpose: SchedulePurpose): readonly string[]
  standing(owner: ScheduleOwner): Promise<OwnerStanding>
  executor(work: ScheduleWork): ScheduleJobExecutor | undefined
  time: DispatcherTime
  policy: Readonly<{ intervalMs: number; gapMs: number; roundLimit: number; classifyPages: number }>
  report?: (error: unknown) => void
  /** Told after each committed dispatch command: what readers see of Jobs and history may have changed. */
  changed?: () => void
}>

const PAGE = 100
const REMINDER_WINDOW_MS = 5 * 60_000
export const iso = (epochMs: number) => new Date(epochMs).toISOString() as ScheduleInstant
const before = (at: ScheduleInstant) => iso(Date.parse(at) - 1)
const later = (left: ScheduleInstant | null, right: ScheduleInstant) =>
  left !== null && left > right ? left : right

/** A reminder is first accepted in [W, deadline): W plus five minutes, or the next valid slot if that is sooner. */
export function reminderDeadline(
  slot: ScheduleCandidate,
  next: ScheduleCandidate | null,
): ScheduleInstant {
  const window = iso(Date.parse(slot.scheduledAt) + REMINDER_WINDOW_MS)
  return next !== null && next.scheduledAt < window ? next.scheduledAt : window
}

async function nextAfter(
  ports: DispatcherPorts,
  record: ScheduleRecord,
  after: ScheduleInstant,
  counted: number,
): Promise<Prediction> {
  const page = await ports.predict(record, after, 1, counted)
  if (page.kind === 'unavailable') return page
  const [next] = page.candidates
  if (next !== undefined) return { kind: 'ok', next }
  return page.complete ? { kind: 'ok', next: null } : { kind: 'unavailable' }
}

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

function disposal(state: DispatchState | null, watchedFrom: ScheduleInstant) {
  if (state === null) return { after: watchedFrom, queued: 0 }
  return { after: state.disposedThrough ?? state.watchedFrom, queued: state.selected.length }
}

export async function refreshCommand(
  ports: DispatcherPorts,
  item: DispatchSchedule,
  at: ScheduleInstant,
): Promise<DispatchCommand | null> {
  const { record } = item
  const watched = watching(item, at)
  let next: ScheduleCandidate | null = null
  if (record.view.control === 'active') {
    const { after, queued } = disposal(item.state, watched.watchedFrom)
    const predicted = await nextAfter(ports, record, after, record.view.eligibleConsumed + queued)
    if (predicted.kind === 'unavailable') return null
    next = predicted.next
  }
  const state: DispatchState = {
    ...watched,
    revision: record.view.revision,
    disposedThrough: item.state?.disposedThrough ?? null,
    next,
    block: item.state?.block ?? null,
    selected: item.state?.selected ?? [],
    counting: item.state?.counting ?? null,
  }
  return {
    kind: 'refresh',
    owner: ports.owner,
    scheduleId: record.view.scheduleId,
    revision: record.view.revision,
    state,
    at,
  }
}

/** The watch start of a schedule: the later of its own start and the start of the scope's unbroken heartbeat. */
export const watchStart = (state: DispatchState, watch: DispatchPending['watch']) =>
  later(watch?.watchFrom ?? null, state.watchedFrom)

/** A stretch nobody watched: counted page by page within the round's budget, then disposed in one commit. */
async function classifyCommand(
  ports: DispatcherPorts,
  item: DispatchSchedule,
  state: DispatchState,
  watch: DispatchPending['watch'],
  at: ScheduleInstant,
): Promise<DispatchCommand | null> {
  const { record } = item
  const { view } = record
  const first = state.next
  if (first === null) return null
  const through = state.counting?.through ?? watchStart(state, watch)
  const cause: MissCause | string =
    state.counting?.cause ??
    missCause(watch?.watchFrom ?? state.watchedFrom, state.watchedFrom, state.watchedCause)
  const counted: ScheduleCandidate[] = []
  let after = before(first.scheduledAt)
  let reached = false
  for (let page = 0; page < ports.policy.classifyPages; page += 1) {
    const result = await ports.predict(record, after, PAGE, view.eligibleConsumed + counted.length)
    if (result.kind === 'unavailable') return null
    reached = result.candidates.some(candidate => candidate.scheduledAt >= through)
    counted.push(...result.candidates.filter(candidate => candidate.scheduledAt < through))
    if (reached) break
    if (result.candidates.length < PAGE) {
      reached = result.complete
      break
    }
    after = result.candidates.at(-1)?.scheduledAt ?? after
  }
  const limit = view.definition.limits.eligibleLimit
  const remaining = limit === null ? counted.length : Math.max(0, limit - view.eligibleConsumed)
  const stretch = counted.slice(0, remaining)
  const overBudget = !reached && stretch.length === counted.length
  const once = view.definition.recurrence.kind === 'once'
  const chosen =
    overBudget || state.counting !== null
      ? { selected: [], reason: 'over-budget' }
      : classifyMissed(view.definition.purpose, once, cause as MissCause, stretch)
  const more = overBudget && limit !== null
  const resume = more ? (stretch.at(-1)?.scheduledAt ?? before(through)) : before(through)
  const predicted = await nextAfter(ports, record, resume, view.eligibleConsumed + stretch.length)
  if (predicted.kind === 'unavailable') return null
  const notCounted = overBudget && limit === null
  const consumed = notCounted ? 0 : stretch.length - chosen.selected.length
  const exhausts =
    chosen.selected.length === 0 &&
    ((limit !== null && view.eligibleConsumed + consumed >= limit) || predicted.next === null)
  return {
    kind: 'classify',
    owner: ports.owner,
    scheduleId: view.scheduleId,
    revision: view.revision,
    from: state.disposedThrough,
    through,
    cause,
    reason: chosen.reason,
    counted: notCounted ? null : stretch,
    selected: chosen.selected,
    more,
    next: predicted.next,
    exhausts,
    holding: record.quota,
    at,
  }
}

export async function admitCommand(
  ports: DispatcherPorts,
  item: DispatchSchedule,
  watch: DispatchPending['watch'],
  at: ScheduleInstant,
): Promise<DispatchCommand | null> {
  const { record, state } = item
  if (state === null) return null
  const queued = state.selected[0]
  const due = state.next
  if (
    queued === undefined &&
    due !== null &&
    state.block === null &&
    (state.counting !== null || due.scheduledAt < watchStart(state, watch))
  )
    return classifyCommand(ports, item, state, watch, at)
  const slot = queued ?? due
  if (slot === null) return null
  const standing = await ports.standing(ports.owner)
  if (standing.kind === 'unknown') return null
  let next = state.next
  if (queued === undefined) {
    const predicted = await nextAfter(
      ports,
      record,
      slot.scheduledAt,
      record.view.eligibleConsumed + 1,
    )
    if (predicted.kind === 'unavailable') return null
    next = predicted.next
  }
  const { view } = record
  const purpose = view.definition.purpose
  const prepared = {
    hasNext: state.selected.length > 1 || next !== null,
    missingCarriers: ports.missingCarriers(purpose),
    reminderClosed: purpose.kind === 'reminder' ? at >= reminderDeadline(slot, next) : null,
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
  const blocking = decision.kind === 'block' || decision.kind === 'invalidate'
  if (blocking) {
    const kind = decision.kind === 'block' ? 'blocked' : 'terminal'
    if (
      state.block?.kind === kind &&
      state.block.reasons.join('\n') === decision.reasons.join('\n')
    )
      return null
  } else if (state.block !== null) {
    const recovered: DispatchState = {
      ...state,
      block: null,
      watchedFrom: at,
      watchedCause: 'recovered',
    }
    return {
      kind: 'refresh',
      owner: ports.owner,
      scheduleId: view.scheduleId,
      revision: view.revision,
      state: recovered,
      at,
    }
  }
  const { receiptId, jobId } = admissionRefs(ports.owner, view.scheduleId, slot.scheduledAt)
  return {
    kind: 'admit',
    owner: ports.owner,
    scheduleId: view.scheduleId,
    revision: view.revision,
    slot,
    next,
    prepared,
    decision,
    holding: record.quota,
    receiptId,
    jobId,
    at,
  }
}
