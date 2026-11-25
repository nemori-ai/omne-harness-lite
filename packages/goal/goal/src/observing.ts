import {
  compactedNote,
  impliedBody,
  impliedKey,
  impliedRecord,
  isImpliedKey,
  measuredOf,
  observe,
  packJudge,
  pausedNote,
  readJudge,
  sessionOfKey,
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
const NOTHING_SAID = { kind: 'read', value: null } as const

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

function replyAs(order: number, text: string): ObservedCall {
  return {
    ref: 'reply',
    order,
    tool: 'Reply',
    command: null,
    path: null,
    exit: null,
    output: text,
    writes: false,
  }
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
      const identity = `${isImpliedKey(record.session) ? 'implied.' : ''}${name}/${String(attempt)}`
      const session = sessionOfKey(record.session)
      const input = { caller, session, identity, model: config.model, request }
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
    const { body, progress, state } = record
    const session = sessionOfKey(record.session)
    const implied = isImpliedKey(record.session)
    const [made, config, said] = await Promise.all([
      deps.history.calls(tenant, session, record.since),
      deps.judging.config(tenant, session),
      implied ? deps.history.said(tenant, session, record.since) : NOTHING_SAID,
    ])
    if (made.kind === 'unavailable' || config.kind === 'unavailable' || said.kind === 'unavailable')
      return UNAVAILABLE
    const reply = said.value === null ? [] : [replyAs(made.value.length, said.value)]
    const calls = [...made.value, ...reply]
    const material: JudgeMaterial = {
      body,
      attendance: state.attendance,
      progress,
      calls,
      metrics: numbers(body, made.value),
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
    if (kept.value?.since === drive.since) return done(kept.value)
    const body = impliedBody(drive.text)
    if (body === null) return done(null)
    const start = { session, body, since: drive.since, at: deps.clock.now() }
    const begun = impliedRecord(kept.value, start)
    return commit(tenant, kept.value?.version ?? 0, begun).then(written =>
      written === 'stale' ? 'again' : written,
    )
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

  return {
    async observe(caller, check: Check) {
      const stop = await permitted(caller, check.session, 'observe')
      if (stop !== null) return stop
      for (let attempt = 0; attempt < OBSERVATIONS; attempt += 1) {
        const read = await store.latest(caller.tenant, check.session)
        if (read.kind === 'unavailable') return UNAVAILABLE
        const own = await looked(caller, check, read.value)
        if (own === 'again') continue
        if (own !== 'none') return own
        const implied = await impliedOf(caller.tenant, check.session)
        if (implied === 'again') continue
        if (implied.kind !== 'done') return implied
        const answer = await looked(caller, check, implied.value)
        if (answer === 'none') return done(PASS)
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
