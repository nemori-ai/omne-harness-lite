import {
  isImpliedKey,
  measuredOf,
  packJudge,
  readJudge,
  sessionOfKey,
  validReply,
  type Findings,
  type GoalCaller,
  type GoalRecord,
  type JudgeConfig,
  type JudgeMaterial,
  type JudgeReply,
  type JudgeRequest,
  type MetricId,
  type ObservedCall,
  type Packed,
} from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'

/** A request that got no whole answer is asked again as a new call, this many times at most. */
export const DECISION_RETRIES = 2
const NOTHING_SAID = { kind: 'read', value: null } as const
const standsOnTheRound = (entry: GoalRecord['body']['criteria'][number]): boolean =>
  entry.evidence.kind === 'activity'

/** What one judging came to: what the system settled by itself, and the findings over every entry. */
export type Judged = Readonly<{ decided: Packed['decided']; findings: Findings }>

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

/** One judging of a goal as it stands: the material of its session, the decision calls, and what they come to. */
export function createJudging(deps: GoalsDependencies) {
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
    const { generation, revision, rounds } = record.state
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

  /** What the session shows a judging: the calls made since a moment and, when a criterion stands on what was done in the round, what the agent said last. Null: not readable. */
  async function shownOf(tenant: string, session: string, since: string, withReply: boolean) {
    const [made, said] = await Promise.all([
      deps.history.calls(tenant, session, since),
      withReply ? deps.history.said(tenant, session, since) : NOTHING_SAID,
    ])
    if (made.kind === 'unavailable' || said.kind === 'unavailable') return null
    const reply = said.value === null ? [] : [replyAs(made.value.length, said.value)]
    return { made: made.value, calls: [...made.value, ...reply] }
  }

  /** Null: the session or the configuration of the judging cannot be read. */
  return async function judge(caller: GoalCaller, record: GoalRecord): Promise<Judged | null> {
    const { tenant } = caller
    const { body, progress, state } = record
    const session = sessionOfKey(record.session)
    const [shown, config] = await Promise.all([
      shownOf(tenant, session, record.since, body.criteria.some(standsOnTheRound)),
      deps.judging.config(tenant, session),
    ])
    if (shown === null || config.kind === 'unavailable') return null
    const material: JudgeMaterial = {
      body,
      attendance: state.attendance,
      progress,
      calls: [...shown.calls],
      metrics: numbers(body, shown.made),
      rounds: state.rounds,
    }
    const packed = packJudge(material, config.value)
    const votes = await votesOf(caller, record, config.value, packed)
    return { decided: packed.decided, findings: readJudge(material, config.value, packed, votes) }
  }
}
