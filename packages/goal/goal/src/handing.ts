import {
  batchRequest,
  briefFor,
  delivered,
  evidence,
  sessionOfKey,
  settleArrived,
  takenBack,
  type Batch,
  type GoalRecord,
  type ObservedCall,
} from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'
import { lastWrite } from './judging.ts'
import type { BatchOut, BatchToHand, HandAnswer, PortRead } from './ports.ts'

type Seen = Readonly<{ where: string | null; calls: readonly ObservedCall[] }>
type Commit = (tenant: string, before: GoalRecord | null, next: GoalRecord) => Promise<unknown>
const UNREAD = { kind: 'unavailable' } as const
const unread = () => UNREAD
const reading = <T>(read: () => Promise<PortRead<T>>): Promise<PortRead<T>> =>
  Promise.resolve().then(read).catch(unread)

function outOf(record: GoalRecord, batch: Batch): BatchOut {
  const request = batchRequest(record.state.generation, batch.key)
  const { examiner } = record.examination
  return { session: sessionOfKey(record.session), examiner, request }
}

function toHand(record: GoalRecord, batch: Batch, seen: Seen): BatchToHand {
  const criteria = record.body.criteria
    .filter(entry => batch.criteria.includes(entry.id) && batch.ran[entry.id] === undefined)
    .map(({ id, evidence: by }) => ({ id, evidence: by }))
  const brief = briefFor(record, batch, seen)
  return { ...outOf(record, batch), where: seen.where, brief, criteria }
}

/** What a goal does with the side that examines for it: hands a batch over, asks whether its round is over, and tells it what a write took from it. */
export function createHanding(deps: GoalsDependencies, commit: Commit) {
  const { store, sessions, examining } = deps
  const quiet = () => undefined

  async function seenOf(tenant: string, record: GoalRecord): Promise<Seen | null> {
    const session = sessionOfKey(record.session)
    const [facts, made] = await Promise.all([
      reading(() => sessions.facts(tenant, session)),
      reading(() => deps.history.calls(tenant, session, record.since)),
    ])
    if (facts.kind !== 'read' || made.kind !== 'read') return null
    return { where: facts.value?.where ?? null, calls: made.value }
  }

  /** Where the last write stands and whether a round is going in the session of a goal. Null: not readable now. */
  async function standingOf(tenant: string, record: GoalRecord) {
    const session = sessionOfKey(record.session)
    const [made, running] = await Promise.all([
      reading(() => deps.history.calls(tenant, session, record.since)),
      reading(() => sessions.running(tenant, session)),
    ])
    if (made.kind !== 'read' || running.kind !== 'read') return null
    return { written: lastWrite(made.value), running: running.value }
  }

  async function briefOf(tenant: string, record: GoalRecord, batch: Batch): Promise<string | null> {
    const seen = await seenOf(tenant, record)
    return seen === null ? null : briefFor(record, batch, seen)
  }

  async function untaken(tenant: string, record: GoalRecord, { key }: Batch): Promise<void> {
    const standing = await standingOf(tenant, record)
    if (standing === null) return deps.hints.wake(tenant)
    const step = evidence(record, { key, ...standing, answers: null })
    if (step.kind === 'next') await commit(tenant, record, step.record)
  }

  const letGo = (tenant: string, record: GoalRecord, examiner: string) =>
    Promise.resolve()
      .then(() => examining.close(tenant, { session: sessionOfKey(record.session), examiner }))
      .catch(quiet)

  /** Writes down what became of handing a batch over: taken by a session, or not known. The session of the examiner before is let go of once the write that names the new one stood. */
  async function noted(
    tenant: string,
    record: GoalRecord,
    batch: Batch,
    answer: Exclude<HandAnswer, { kind: 'taking' | 'refused' }>,
  ): Promise<void> {
    const { examiner } = record.examination
    const taken = delivered(record.examination, batch.key, answer.kind)
    const to = answer.kind === 'handed' ? answer.examiner : examiner
    const next = { ...record, examination: { ...taken, examiner: to } }
    const { session, version: expected } = record
    const written = await store.commit(tenant, { session, expected, next })
    const stood = written.kind === 'committed' && written.value.kind !== 'stale'
    if (stood && examiner !== null && to !== examiner) await letGo(tenant, record, examiner)
  }

  async function hand(tenant: string, record: GoalRecord): Promise<void> {
    const { batch } = record.examination
    if (batch === null || batch.delivery === 'handed') return
    const seen = await seenOf(tenant, record)
    if (seen === null) return deps.hints.wake(tenant)
    const unknown = () => ({ kind: 'unknown' }) as const
    const answer = await Promise.resolve()
      .then(() => examining.hand(tenant, toHand(record, batch, seen)))
      .catch(unknown)
    if (answer.kind === 'refused') return untaken(tenant, record, batch)
    if (answer.kind === 'taking') return
    if (answer.kind === 'unknown') deps.hints.wake(tenant)
    await noted(tenant, record, batch, answer)
  }

  /** A batch that was taken: once the round the examining side gave it is over with nothing handed in, what is left of it cannot be told. */
  async function watch(tenant: string, record: GoalRecord): Promise<void> {
    const { batch } = record.examination
    if (batch === null || batch.delivery !== 'handed') return
    const going = () => 'unknown' as const
    const answer = await Promise.resolve()
      .then(() => examining.ended(tenant, outOf(record, batch)))
      .catch(going)
    if (answer === 'ended') await untaken(tenant, record, batch)
  }

  /** Tells the examining side what a write took from it: a batch that went without coming back, and the session it kept for a goal that settled. */
  async function released(tenant: string, before: GoalRecord | null, now: GoalRecord) {
    if (before === null) return
    const back = takenBack(before.examination, now.examination)
    if (back !== null)
      await Promise.resolve()
        .then(() => examining.cancel(tenant, outOf(before, back)))
        .catch(quiet)
    const { examiner } = now.examination
    if (now.state.status === 'settled' && examiner !== null) await letGo(tenant, now, examiner)
  }

  async function settleOwed(tenant: string, record: GoalRecord): Promise<void> {
    if (!record.examination.arrived) return
    const standing = await standingOf(tenant, record)
    const step = standing === null ? null : settleArrived(record, standing)
    if (step === null) return deps.hints.wake(tenant)
    await commit(tenant, record, step.record)
  }

  return { briefOf, standingOf, hand, watch, released, settleOwed }
}
