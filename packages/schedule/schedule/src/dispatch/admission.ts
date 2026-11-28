import type { ScheduleControl, ScheduleOverlap } from '@omne-harness/schedule-contract'

/** What a commit reads under the lock about one due slot of one schedule; prepared once outside, read again inside. */
export type AdmissionFacts = Readonly<{
  slot: Readonly<{ disposed: boolean; earlierPending: boolean }>
  control: ScheduleControl
  /** The definition, control, environment and calendar revisions are the ones the slot was prepared against. */
  basisCurrent: boolean
  counts: Readonly<{
    eligibleConsumed: number
    eligibleLimit: number | null
    jobsAccepted: number
    jobLimit: number | null
  }>
  hasNext: boolean
  dependency:
    | Readonly<{ kind: 'ready' }>
    | Readonly<{ kind: 'blocked' | 'terminal'; reasons: readonly string[] }>
  /** The carriers the work names and this deployment does not have now (executor, publication, return, notification). */
  missingCarriers: readonly string[]
  /** For a reminder: the admission window of the slot has closed. Null for execution. */
  reminderClosed: boolean | null
  standing:
    | Readonly<{ kind: 'eligible' }>
    | Readonly<{ kind: 'refused' | 'terminal'; reason: string }>
  overlap: Readonly<{ unfinished: number; policy: ScheduleOverlap }>
}>

type Written = Readonly<{ exhausts: boolean }>

export type Admission =
  | Readonly<{ kind: 'retreat'; reason: 'disposed' | 'earlier' | 'inactive' }>
  | Readonly<{ kind: 'recompute' }>
  | Readonly<{ kind: 'exhaust' }>
  | Readonly<{ kind: 'invalidate'; reasons: readonly string[] }>
  | Readonly<{ kind: 'block'; reasons: readonly string[] }>
  | (Written & Readonly<{ kind: 'miss'; reason: 'reminder-window' }>)
  | (Written & Readonly<{ kind: 'reject'; reason: string }>)
  | (Written & Readonly<{ kind: 'skip'; reason: 'overlap' }>)
  | (Written & Readonly<{ kind: 'accept'; start: 'ready' | 'waiting'; stopPredecessors: boolean }>)

const reached = (count: number, limit: number | null) => limit !== null && count >= limit

/** Whether a written disposition of this slot uses up the schedule: a limit reached, or no candidate after it. */
function exhausts(facts: AdmissionFacts, accepted: boolean): boolean {
  const { counts } = facts
  return (
    reached(counts.eligibleConsumed + 1, counts.eligibleLimit) ||
    (accepted && reached(counts.jobsAccepted + 1, counts.jobLimit)) ||
    !facts.hasNext
  )
}

/** The disposition of one due slot: the first row of the admission table that holds decides it. */
export function decideAdmission(facts: AdmissionFacts): Admission {
  if (facts.slot.disposed) return { kind: 'retreat', reason: 'disposed' }
  if (facts.slot.earlierPending) return { kind: 'retreat', reason: 'earlier' }
  if (facts.control !== 'active') return { kind: 'retreat', reason: 'inactive' }
  if (!facts.basisCurrent) return { kind: 'recompute' }
  const { counts } = facts
  if (
    reached(counts.jobsAccepted, counts.jobLimit) ||
    reached(counts.eligibleConsumed, counts.eligibleLimit)
  )
    return { kind: 'exhaust' }
  if (facts.dependency.kind === 'terminal')
    return { kind: 'invalidate', reasons: facts.dependency.reasons }
  if (facts.standing.kind === 'terminal')
    return { kind: 'invalidate', reasons: [facts.standing.reason] }
  if (facts.dependency.kind === 'blocked')
    return { kind: 'block', reasons: facts.dependency.reasons }
  if (facts.missingCarriers.length > 0)
    return {
      kind: 'block',
      reasons: facts.missingCarriers.map(carrier => `carrier-missing:${carrier}`),
    }
  if (facts.reminderClosed === true)
    return { kind: 'miss', reason: 'reminder-window', exhausts: exhausts(facts, false) }
  if (facts.standing.kind === 'refused')
    return { kind: 'reject', reason: facts.standing.reason, exhausts: exhausts(facts, false) }
  const { unfinished, policy } = facts.overlap
  if (unfinished > 0 && policy === 'skip')
    return { kind: 'skip', reason: 'overlap', exhausts: exhausts(facts, false) }
  const waits = unfinished > 0 && (policy === 'wait' || policy === 'replace')
  return {
    kind: 'accept',
    start: waits ? 'waiting' : 'ready',
    stopPredecessors: unfinished > 0 && policy === 'replace',
    exhausts: exhausts(facts, true),
  }
}
