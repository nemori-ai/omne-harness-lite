import {
  compactedNote,
  impliedBody,
  impliedKey,
  impliedRecord,
  observe,
  pausedNote,
  sessionOfKey,
  type Check,
  type CheckAnswer,
  type GoalCaller,
  type GoalChecking,
  type GoalRecord,
  type ObservedAt,
} from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'
import { createJudging, lastWrite } from './judging.ts'
import type { Driven } from './sessions-port.ts'
import { createWriting, done, UNAVAILABLE, type Answer } from './writing.ts'

/** An observation made on a goal somebody changed meanwhile is made again, this many times at most. */
const OBSERVATIONS = 3
const PASS: CheckAnswer = { kind: 'pass' }

const atOf = ({ state }: GoalRecord, written: string): ObservedAt => ({
  generation: state.generation,
  revision: state.revision,
  rounds: state.rounds,
  written,
})

function answered(record: GoalRecord): CheckAnswer {
  const answer = record.observed?.answer ?? 'pass'
  if (answer === 'tell') return { kind: 'tell', note: pausedNote(record) ?? '' }
  return answer === 'continue' ? { kind: 'continue' } : PASS
}

export function createObserving(
  deps: GoalsDependencies,
): Pick<GoalChecking, 'observe' | 'compacted'> {
  const { store } = deps
  const { permitted, deliver, commit } = createWriting(deps)
  const judge = createJudging(deps)

  /** Judges the goal as it stands and writes what that comes to. `again`: somebody changed it meanwhile. */
  async function judged(
    caller: GoalCaller,
    record: GoalRecord,
    call: string,
  ): Promise<Answer<CheckAnswer> | 'again'> {
    const found = await judge(caller, record)
    if (found === null) return UNAVAILABLE
    const made = await deps.history.calls(caller.tenant, sessionOfKey(record.session), record.since)
    if (made.kind === 'unavailable') return UNAVAILABLE
    const { decided, findings } = found
    const at = atOf(record, found.written)
    const step = observe(record, { call, at, written: lastWrite(made.value), decided, findings })
    if (step.kind === 'pass') return done(PASS)
    if (step.kind === 'reobserve') return 'again'
    const written = await commit(caller.tenant, record.version, step.record)
    if (written === 'stale') return 'again'
    return written.kind === 'done' ? done(answered(written.value)) : written
  }

  /** The goal the session implies for the round in progress, begun when the round has none yet. Null: the session implies none. */
  async function impliedOf(
    tenant: string,
    session: string,
  ): Promise<Answer<GoalRecord | null> | 'again'> {
    const [facts, kept] = await Promise.all([
      deps.sessions.facts(tenant, session),
      store.latest(tenant, impliedKey(session)),
    ])
    if (facts.kind === 'unavailable' || kept.kind === 'unavailable') return UNAVAILABLE
    const drive = facts.value?.drive ?? null
    if (drive === null) return done(null)
    return kept.value?.since === drive.since
      ? done(kept.value)
      : begun(tenant, session, drive, kept.value)
  }

  /** Begins the implied goal of a round over the one of the round before. Null: the input has no words to judge by. */
  async function begun(
    tenant: string,
    session: string,
    drive: Driven,
    before: GoalRecord | null,
  ): Promise<Answer<GoalRecord | null> | 'again'> {
    const body = impliedBody(drive.text)
    if (body === null) return done(null)
    const start = { session, body, since: drive.since, at: deps.clock.now() }
    const written = await commit(tenant, before?.version ?? 0, impliedRecord(before, start))
    return written === 'stale' ? 'again' : written
  }

  /** One look at the goal under a key for a round about to end. `none`: no goal in progress stands under it. */
  async function looked(
    caller: GoalCaller,
    check: Check,
    record: GoalRecord | null,
  ): Promise<Answer<CheckAnswer> | 'again' | 'none'> {
    if (record?.observed?.call === check.call) {
      await deliver(caller.tenant, record)
      return done(answered(record), true)
    }
    if (check.candidate === 'failed') return done(PASS)
    if (record?.state.status === 'paused') return done(PASS)
    if (record?.state.status !== 'active') return 'none'
    return judged(caller, record, check.call)
  }

  /** One check on what stands now: the goal of the session, or else the one it implies. */
  async function checked(caller: GoalCaller, check: Check): Promise<Answer<CheckAnswer> | 'again'> {
    const read = await store.latest(caller.tenant, check.session)
    if (read.kind === 'unavailable') return UNAVAILABLE
    const own = await looked(caller, check, read.value)
    if (own !== 'none') return own
    const implied = await impliedOf(caller.tenant, check.session)
    if (implied === 'again' || implied.kind !== 'done') return implied
    const answer = await looked(caller, check, implied.value)
    return answer === 'none' ? done(PASS) : answer
  }

  return {
    async observe(caller, check: Check) {
      const stop = await permitted(caller, check.session, 'observe')
      if (stop !== null) return stop
      for (let attempt = 0; attempt < OBSERVATIONS; attempt += 1) {
        const answer = await checked(caller, check)
        if (answer !== 'again') return answer
      }
      return UNAVAILABLE
    },

    async compacted(caller, session) {
      const stop = await permitted(caller, session, 'observe')
      if (stop !== null) return stop
      const read = await store.latest(caller.tenant, session)
      if (read.kind === 'unavailable') return UNAVAILABLE
      return done(read.value === null ? null : compactedNote(read.value))
    },
  }
}
