import { createHash } from 'node:crypto'
import {
  packJudge,
  readJudge,
  rule,
  type Findings,
  type JudgeAnswer,
  type JudgeConfig,
  type JudgeReply,
  type JudgeRequest,
  type Verdict,
} from '@omne-harness/goal-contract'
import type { Case } from './case.ts'

export type DecideRequest = JudgeRequest & Readonly<{ model: string }>
export type Usage = Readonly<{ input: number; output: number; cost: number }>
/** One answered decision request, as it is kept: the answers, what it cost and how long it took. */
export type Decided = Readonly<{
  answers: Readonly<Record<string, JudgeAnswer>>
  usage: Usage
  ms: number
}>
/** Sends one decision request. `null`: it got no answer. */
export type Decide = (request: DecideRequest) => Promise<Decided | null>

/** Replies by the digest of what was asked: the same question is paid for once. */
export type ReplyCache = Readonly<{
  get: (key: string) => Decided | undefined
  put: (key: string, decided: Decided) => void
}>

export const requestKey = (request: DecideRequest, vote: number, repeat: number): string =>
  createHash('sha256')
    .update(JSON.stringify([request.model, request.state, request.questions, vote, repeat]))
    .digest('hex')

export type Outcome = Readonly<{
  case: Case
  asked: readonly string[]
  replies: readonly (readonly (Decided | null)[])[]
  findings: Findings
  verdict: Verdict
}>
export type Replayed = Readonly<{ outcomes: readonly Outcome[]; sent: number; hits: number }>

function mulberry(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function permuted<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    const held = out[index] as T
    out[index] = out[other] as T
    out[other] = held
  }
  return out
}

/** The same request with its questions, its criteria and each entry's evidence in another order. */
export function shuffled(request: JudgeRequest, seed: number): JudgeRequest {
  const random = mulberry(seed)
  const reorder = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(permuted(Object.entries(record), random))
  const state = request.state as Record<string, unknown>
  const goal = state.goal as Record<string, unknown>
  const evidence = Object.fromEntries(
    Object.entries(state.evidence as Record<string, readonly unknown[]>).map(([id, items]) => [
      id,
      permuted(items, random),
    ]),
  )
  const moved = {
    ...state,
    goal: { ...goal, criteria: permuted(goal.criteria as readonly unknown[], random) },
    evidence: reorder(evidence),
  }
  return { state: moved as JudgeRequest['state'], questions: reorder(request.questions) }
}

async function pooled<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = []
  let next = 0
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return results
}

export type ReplayOptions = Readonly<{
  decide: Decide
  cache: ReplyCache
  repeat?: number
  shuffle?: number | null
  concurrency?: number
}>

/** Judges every case alone, as the release would: pack, ask, read, and let the verdict table decide. */
export async function replay(
  cases: readonly Case[],
  config: JudgeConfig,
  options: ReplayOptions,
): Promise<Replayed> {
  const { decide, cache, repeat = 0, shuffle = null, concurrency = 8 } = options
  let sent = 0
  let hits = 0
  const inFlight = new Map<string, Promise<Decided | null>>()
  const ask = async (request: JudgeRequest, vote: number): Promise<Decided | null> => {
    const asked = {
      ...(shuffle === null ? request : shuffled(request, shuffle)),
      model: config.model,
    }
    const key = requestKey(asked, vote, repeat)
    const kept = cache.get(key)
    if (kept !== undefined) {
      hits += 1
      return kept
    }
    const flying = inFlight.get(key)
    if (flying !== undefined) return flying
    sent += 1
    const answer = decide(asked).then(decided => {
      if (decided !== null) cache.put(key, decided)
      return decided
    })
    inFlight.set(key, answer)
    return answer
  }
  const outcomes = await pooled(cases, concurrency, async (entry): Promise<Outcome> => {
    const { material } = entry
    const packed = packJudge(material, config)
    const votes = Array.from({ length: config.votes }, (_unused, vote) => vote)
    const replies = await Promise.all(
      votes.map(vote => Promise.all(packed.requests.map(request => ask(request, vote)))),
    )
    const answers = replies.map(vote => vote.map((reply): JudgeReply => reply?.answers ?? null))
    const findings = readJudge(material, config, packed, answers)
    const progress = { rounds: material.rounds, stalled: 0, gap: null, examinations: 0 }
    return {
      case: entry,
      asked: packed.requests.flatMap(request => Object.keys(request.questions)),
      replies,
      findings,
      verdict: rule(material.body, progress, findings),
    }
  })
  return { outcomes, sent, hits }
}
