import {
  compactedNote,
  measuredOf,
  observe,
  packJudge,
  pausedNote,
  readJudge,
  validReply,
  type Check,
  type CheckAnswer,
  type GoalCaller,
  type GoalChecking,
  type GoalRecord,
  type JudgeConfig,
  type JudgeMaterial,
  type JudgeReply,
  type JudgeRequest,
  type MetricId,
  type ObservedAt,
  type ObservedCall,
  type Packed,
} from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'
import { createWriting, done, UNAVAILABLE, type Answer } from './writing.ts'

/** A request that got no whole answer is asked again as a new call, this many times at most. */
export const DECISION_RETRIES = 2
/** An observation made on a goal somebody changed meanwhile is made again, this many times at most. */
const OBSERVATIONS = 3
const PASS: CheckAnswer = { kind: 'pass' }

const atOf = ({ state }: GoalRecord): ObservedAt => ({
  generation: state.generation,
  revision: state.revision,
  rounds: state.rounds,
})

function answered(record: GoalRecord): CheckAnswer {
  const answer = record.observed?.answer ?? 'pass'
  if (answer === 'tell') return { kind: 'tell', note: pausedNote(record) ?? '' }
  return answer === 'continue' ? { kind: 'continue' } : PASS
}

function numbers(body: GoalRecord['body'], calls: readonly ObservedCall[]) {
  const measured = measuredOf(body, calls)
  const entries = Object.entries(measured).map(([id, read]) => [id, read?.value])
  return Object.fromEntries(entries) as Partial<Record<MetricId, number>>
}

export function createObserving(deps: GoalsDependencies): GoalChecking {
  const { store } = deps
  const { permitted, deliver, commit } = createWriting(deps)

  /** One request, asked until it has a whole answer: each asking is a new call with its own identity. */
  async function asked(
    caller: GoalCaller,
    record: GoalRecord,
    config: JudgeConfig,
    request: JudgeRequest,
    name: string,
  ): Promise<JudgeReply> {
    for (let attempt = 0; attempt <= DECISION_RETRIES; attempt += 1) {
      const identity = `${name}/${String(attempt)}`
      const input = { caller, session: record.session, identity, model: config.model, request }
      const reply = await Promise.resolve()
        .then(() => deps.decisions.ask(input))
        .catch(() => null)
      if (validReply(request, reply)) return reply
    }
    return null
  }

  async function votesOf(
    caller: GoalCaller,
    record: GoalRecord,
    config: JudgeConfig,
    packed: Packed,
  ): Promise<readonly (readonly JudgeReply[])[]> {
    const { generation, revision, rounds } = atOf(record)
    const round = `${String(generation)}.${String(revision)}.${String(rounds)}`
    const votes: JudgeReply[][] = []
    for (let vote = 0; vote < config.votes; vote += 1) {
      const replies = packed.requests.map((request, index) =>
        asked(caller, record, config, request, `${round}/${String(index)}/${String(vote)}`),
      )
      votes.push(await Promise.all(replies))
    }
    return votes
  }

  /** Judges the goal as it stands and writes what that comes to. `again`: somebody changed it meanwhile. */
  async function judged(
    caller: GoalCaller,
    record: GoalRecord,
    call: string,
  ): Promise<Answer<CheckAnswer> | 'again'> {
    const { tenant } = caller
    const { session, body, progress, state } = record
    const [calls, config] = await Promise.all([
      deps.history.calls(tenant, session, record.since),
      deps.judging.config(tenant, session),
    ])
    if (calls.kind === 'unavailable' || config.kind === 'unavailable') return UNAVAILABLE
    const material: JudgeMaterial = {
      body,
      attendance: state.attendance,
      progress,
      calls: [...calls.value],
      metrics: numbers(body, calls.value),
      rounds: state.rounds,
    }
    const packed = packJudge(material, config.value)
    const votes = await votesOf(caller, record, config.value, packed)
    const findings = readJudge(material, config.value, packed, votes)
    const step = observe(record, { call, at: atOf(record), decided: packed.decided, findings })
    if (step.kind === 'pass') return done(PASS)
    if (step.kind === 'reobserve') return 'again'
    const written = await commit(tenant, record.version, step.record)
    if (written === 'stale') return 'again'
    return written.kind === 'done' ? done(answered(written.value)) : written
  }

  return {
    async observe(caller, check: Check) {
      const stop = await permitted(caller, check.session, 'observe')
      if (stop !== null) return stop
      for (let attempt = 0; attempt < OBSERVATIONS; attempt += 1) {
        const read = await store.latest(caller.tenant, check.session)
        if (read.kind === 'unavailable') return UNAVAILABLE
        const record = read.value
        if (record === null) return done(PASS)
        if (record.observed?.call === check.call) {
          await deliver(caller.tenant, record)
          return done(answered(record), true)
        }
        if (record.state.status !== 'active' || check.candidate === 'failed') return done(PASS)
        const answer = await judged(caller, record, check.call)
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
