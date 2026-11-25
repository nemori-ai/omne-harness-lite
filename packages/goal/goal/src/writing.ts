import {
  isImpliedKey,
  openGap,
  renderBody,
  sessionOfKey,
  type GoalCaller,
  type GoalRecord,
  type GoalRefusal,
  type Outcome,
} from '@omne-harness/goal-contract'
import type { Decided } from './decide.ts'
import type { GoalsDependencies } from './goals.ts'
import { ask, type GoalAction } from './ports.ts'

export type Answer<T> = Outcome<T, GoalRefusal>
export const UNAVAILABLE = { kind: 'basis-unavailable' } as const
export const UNKNOWN = { kind: 'unknown' } as const
export const refused = (reason: GoalRefusal) => ({ kind: 'refused', reason }) as const
export const done = <T>(value: T, recalled = false) => ({ kind: 'done', value, recalled }) as const
/** A decision made on a version somebody else wrote over is made again, this many times at most. */
const ATTEMPTS = 3

/** What every operation of the registry is made of: asking the authority, reading the session, and the write that stands on a version. */
export function createWriting(deps: GoalsDependencies) {
  const { store, sessions } = deps

  async function permitted(caller: GoalCaller, session: string, action: GoalAction) {
    const answer = await ask(deps.authority, caller, session, action)
    if (answer === 'unavailable') return UNAVAILABLE
    return answer === 'denied' ? refused({ kind: 'denied' }) : null
  }

  /** Hands the reminder a record owes to its session, then clears the debt. An unknown send stays owed. */
  async function deliver(tenant: string, record: GoalRecord): Promise<void> {
    if (record.wake === null) return
    const { body, readings, state } = record
    const open = openGap(body, readings, state.rounds)
    const implied = isImpliedKey(record.session)
    const wake = {
      kind: record.wake.kind,
      request: implied ? `implied/${record.wake.request}` : record.wake.request,
      session: sessionOfKey(record.session),
      rendered: renderBody(body),
      open,
      implied,
    }
    const unknown = () => 'unknown' as const
    const answer = await Promise.resolve()
      .then(() => sessions.wake(tenant, wake))
      .catch(unknown)
    if (answer === 'unknown') return deps.hints.wake(tenant)
    const next = { ...record, wake: null }
    await store.commit(tenant, { session: record.session, expected: record.version, next })
  }

  /** Writes a decision on the version it was made on. `stale`: somebody wrote meanwhile, decide again. */
  async function commit(tenant: string, expected: number, next: GoalRecord) {
    const answer = await store.commit(tenant, { session: next.session, expected, next })
    if (answer.kind === 'unknown') return UNKNOWN
    if (answer.kind === 'rolled-back') return UNAVAILABLE
    if (answer.value.kind === 'stale') return 'stale'
    await deliver(tenant, answer.value.record)
    return done(answer.value.record)
  }

  /** Decides on what stands and writes on that version; a version written over meanwhile is decided again. */
  async function settle(
    tenant: string,
    session: string,
    decide: (current: GoalRecord | null) => Promise<Decided | Answer<never> | null>,
  ): Promise<Answer<GoalRecord | null>> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const read = await store.latest(tenant, session)
      if (read.kind === 'unavailable') return UNAVAILABLE
      const decided = await decide(read.value)
      if (decided === null) return done(null)
      if (decided.kind === 'recalled') return done(decided.record, true)
      if (decided.kind === 'unchanged') return done(decided.record)
      if (decided.kind !== 'next') return decided
      const answer = await commit(tenant, read.value?.version ?? 0, decided.record)
      if (answer !== 'stale') return answer
    }
    return UNAVAILABLE
  }

  /** The facts of the session, or the answer that ends the operation when there are none to stand on. */
  async function factsOf(tenant: string, session: string) {
    const facts = await sessions.facts(tenant, session)
    if (facts.kind === 'unavailable') return UNAVAILABLE
    return facts.value === null ? refused({ kind: 'no-such-session' }) : facts.value
  }

  const written = (answer: Answer<GoalRecord | null>): Answer<GoalRecord> =>
    answer.kind === 'done' && answer.value === null ? UNAVAILABLE : (answer as Answer<GoalRecord>)

  return { permitted, settle, factsOf, written, deliver, commit }
}
