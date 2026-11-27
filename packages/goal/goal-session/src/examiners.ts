import { createHash } from 'node:crypto'
import type { BatchOut, GoalExamining, GoalHistory, HandAnswer } from '@omne-harness/goal'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  sourceRequestIdentities,
  type SessionFailure,
  type SessionId,
  type SessionOperationId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { reminderInput } from './inputs.ts'
import type { ExaminerCalls, SessionCalls } from './ports.ts'
import { GOAL_SOURCES } from './sources.ts'

const FAMILY = 'goal-session/1'
const UNAVAILABLE = { kind: 'unavailable' } as const
const GONE = new Set<SessionFailure['kind']>(['archived', 'frozen', 'denied', 'not-found'])
/** An examining session is used again for the next batch of its goal within this long of the last one: its prompt cache is still warm. */
export const EXAMINER_REUSE_MS = 15 * 60_000

const operation = (what: string, parts: readonly string[]) =>
  `sop_${createHash('sha256')
    .update(JSON.stringify([`${FAMILY}:${what}`, ...parts]))
    .digest('hex')}` as SessionOperationId

function requestOf(tenant: TenantId, batch: Pick<BatchOut, 'session' | 'request'>) {
  const request = `${batch.session}/${batch.request}`
  return { tenant, source: GOAL_SOURCES.examine, request }
}

type At = Readonly<{ tenant: TenantId; session: SessionId }>
type Standing = 'gone' | 'quiet' | Readonly<{ run: string | null; initial: readonly string[] }>
/** Where an examining session stands. `quiet`: no run going, no input waiting, no call in the background, so nothing more comes of it. */
export function examinerStanding(work: WorkSnapshot | null): Standing {
  if (work === null || work.lifecycle === 'frozen' || work.lifecycle === 'archived') return 'gone'
  if (work.run.kind === 'active') return { run: work.run.run, initial: work.run.initial }
  const still = work.pending.length === 0 && (work.backgroundPlaceholders ?? []).length === 0
  return still ? 'quiet' : { run: null, initial: [] }
}

/** How often, and how many times, a session to be archived is looked at while its round is still going. */
export const CLOSE_WAIT_MS = 2_000
export const CLOSE_LOOKS = 60

export type ExaminerOptions = Readonly<{
  now(): number
  wait(ms: number): Promise<void>
  limitMs(tenant: string): Promise<number | null>
  /** The tool calls of a session from a moment of its history on: the calls an examination can cite are read through it. */
  history: Pick<GoalHistory, 'calls'>
  reuseMs?: number
}>
export type SessionExamining = GoalExamining & Readonly<{ idle(): Promise<void> }>

/** The side of goals that examines in a session of its own: it creates that session, sends it the brief of a batch as a system reminder, and reads what became of the round. */
export function createSessionExamining(
  calls: SessionCalls & ExaminerCalls,
  options: ExaminerOptions,
): SessionExamining {
  const reuseMs = options.reuseMs ?? EXAMINER_REUSE_MS
  const lastHanded = new Map<string, number>()
  const closing = new Set<Promise<void>>()
  const legalOf = (tenant: string) => {
    const parsed = tenantCodec.parse(tenant)
    return parsed.ok ? parsed.value : undefined
  }
  const warm = (examiner: string | null): examiner is string => {
    const last = lastHanded.get(examiner ?? '') ?? Number.NEGATIVE_INFINITY
    return options.now() - last < reuseMs
  }

  async function send(
    tenant: TenantId,
    session: SessionId,
    batch: Parameters<GoalExamining['hand']>[1],
  ) {
    const ids = sourceRequestIdentities({ ...requestOf(tenant, batch), session })
    const value = reminderInput('examine', ids.input, batch.brief)
    const answer = await calls
      .accept({ tenant, session, operation: ids.accept, value })
      .catch(() => 'unknown' as const)
    if (answer === 'unknown') return 'unknown'
    if ('ok' in answer) return 'sent'
    return GONE.has(answer.failure.kind) ? 'gone' : 'unknown'
  }

  async function inNew(
    tenant: TenantId,
    batch: Parameters<GoalExamining['hand']>[1],
  ): Promise<HandAnswer> {
    const ids = sourceRequestIdentities(requestOf(tenant, batch))
    const at = { tenant, session: ids.session }
    const beside = batch.session as SessionId
    const created = await calls
      .create({ ...at, operation: ids.create, beside })
      .catch(() => 'unknown' as const)
    if (created === 'unknown') return { kind: 'unknown' }
    if (!('ok' in created))
      return {
        kind:
          GONE.has(created.failure.kind) || created.failure.kind === 'invalid'
            ? 'refused'
            : 'unknown',
      }
    const sent = await send(tenant, ids.session, batch)
    if (sent === 'sent') lastHanded.set(ids.session, options.now())
    return sent === 'sent'
      ? { kind: 'handed', examiner: ids.session }
      : { kind: sent === 'gone' ? 'refused' : 'unknown' }
  }

  async function standingOf(tenant: string, examiner: string) {
    const legal = legalOf(tenant)
    if (legal === undefined) return 'gone' as const
    const at = { tenant: legal, session: examiner as SessionId }
    const work = await calls.work(at).catch(() => UNAVAILABLE)
    return work.kind === 'read' ? { at, standing: examinerStanding(work.value) } : null
  }

  async function archived(tenant: string, at: At) {
    for (let look = 0; look < CLOSE_LOOKS; look += 1) {
      const work = await calls.work(at).catch(() => UNAVAILABLE)
      const standing = work.kind === 'read' ? examinerStanding(work.value) : 'gone'
      if (standing === 'gone') return
      if (standing === 'quiet') break
      await options.wait(CLOSE_WAIT_MS)
    }
    await calls.archive({ ...at, operation: operation('archive', [tenant, at.session]) })
  }

  /** Stops the round of an examination that took longer than the tenant allows. From then on it is over, with nothing handed in. */
  async function expired(tenant: string, batch: BatchOut, at: At, run: string | null) {
    const began = lastHanded.get(at.session) ?? options.now()
    lastHanded.set(at.session, began)
    const limit = await options.limitMs(tenant).catch(() => null)
    if (run === null || limit === null || options.now() - began <= limit) return
    const name = operation('expire', [tenant, at.session, batch.request])
    await calls.cancelRun({ ...at, operation: name, run })
  }

  return {
    async idle() {
      while (closing.size > 0) await Promise.all(closing)
    },

    async hand(tenant, batch) {
      const legal = legalOf(tenant)
      if (legal === undefined) return { kind: 'refused' }
      if (!warm(batch.examiner)) return inNew(legal, batch)
      const sent = await send(legal, batch.examiner as SessionId, batch)
      if (sent === 'gone') return inNew(legal, batch)
      if (sent === 'unknown') return { kind: 'unknown' }
      lastHanded.set(batch.examiner, options.now())
      return { kind: 'handed', examiner: batch.examiner }
    },

    async calls(tenant, examiner, request) {
      const legal = legalOf(tenant)
      if (legal === undefined) return { kind: 'read', value: [] }
      const at = { tenant: legal, session: examiner as SessionId }
      const brief = await calls
        .reminderWith({ ...at, line: `Batch: ${request}` })
        .catch(() => UNAVAILABLE)
      if (brief.kind !== 'read') return UNAVAILABLE
      if (brief.value === null) return { kind: 'read', value: [] }
      return options.history.calls(tenant, examiner, brief.value).catch(() => UNAVAILABLE)
    },

    async ended(tenant, batch) {
      if (batch.examiner === null) return 'unknown'
      const found = await standingOf(tenant, batch.examiner)
      if (found === null) return 'unknown'
      if (found === 'gone' || typeof found.standing === 'string') return 'ended'
      await expired(tenant, batch, found.at, found.standing.run)
      return 'going'
    },

    async cancel(tenant, batch) {
      if (batch.examiner === null) return
      const found = await standingOf(tenant, batch.examiner)
      if (found === null || found === 'gone' || typeof found.standing === 'string') return
      const { run, initial } = found.standing
      const session = found.at.session
      const brief = sourceRequestIdentities({ ...requestOf(found.at.tenant, batch), session }).input
      if (run === null || !initial.includes(brief)) return
      const name = operation('cancel', [tenant, session, batch.request])
      await calls.cancelRun({ ...found.at, operation: name, run })
    },

    async close(tenant, { examiner }) {
      const legal = legalOf(tenant)
      lastHanded.delete(examiner)
      if (legal === undefined) return
      const at = { tenant: legal, session: examiner as SessionId }
      const work = archived(tenant, at).catch(() => undefined)
      const over = work.finally(() => void closing.delete(over))
      closing.add(over)
    },
  }
}
