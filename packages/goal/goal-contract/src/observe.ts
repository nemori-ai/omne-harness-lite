import type { CriterionId, GoalBody, MetricId, RuleId } from './body.ts'
import { gapTable, renderGap, type Reading, type Readings } from './gap.ts'
import type { Packed } from './judge/pack.ts'
import type { GoalRecord, Observed, Wake } from './record.ts'
import { transition, type Transition } from './transition.ts'
import { rule, type Findings } from './verdict.ts'

/** The goal, revision and round an observation began on. */
export type ObservedAt = Readonly<{ generation: number; revision: number; rounds: number }>

const read = <V>(value: V, source: Reading<V>['source']): Reading<V> => ({
  value,
  source,
  ref: null,
})

/** The readings after an observation: what the system settled is the system's, what was asked is the judge's, the rest stays. */
export function observedReadings(
  before: Readings,
  decided: Packed['decided'],
  findings: Findings,
): Readings {
  const criteria = { ...before.criteria }
  for (const [id, value] of Object.entries(findings.criteria))
    if (value !== undefined)
      criteria[id as CriterionId] = read(value, id in decided ? 'system' : 'judge')
  const metrics = { ...before.metrics }
  for (const [id, value] of Object.entries(findings.metrics))
    if (value !== undefined) metrics[id as MetricId] = read(value, 'system')
  const rules = { ...before.rules }
  for (const [id, value] of Object.entries(findings.rules))
    if (value !== undefined) rules[id as RuleId] = read(value, 'judge')
  return { criteria, metrics, rules }
}

export type ObservationStep =
  | Readonly<{ kind: 'next'; record: GoalRecord; answer: Observed['answer'] }>
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'reobserve' }>

const ANSWERS = [
  ['continue', 'continue'],
  ['tell-person', 'tell'],
  ['pass', 'pass'],
] as const

function answerOf(step: Extract<Transition, { kind: 'changed' }>): Observed['answer'] {
  const found = ANSWERS.find(([effect]) => step.effects.includes(effect))
  if (found === undefined) throw new Error('an observation that changed the goal has no answer')
  return found[1]
}

/** The identity of the reminder a round owes: the goal, the revision and the round it sends the agent on to. */
export function continueRequest(at: ObservedAt): string {
  return `continue/${String(at.generation)}/${String(at.revision)}/${String(at.rounds)}`
}

/** What one observation comes to: the verdict table over the findings, then the transition on the round it began on. */
export function observe(
  record: GoalRecord,
  input: Readonly<{ call: string; at: ObservedAt; decided: Packed['decided']; findings: Findings }>,
): ObservationStep {
  const { state, body } = record
  if (state.status !== 'active') return { kind: 'pass' }
  const verdict = rule(body, state, input.findings)
  const step = transition(state, { kind: 'observe', at: input.at, verdict })
  if (step.kind !== 'changed') return { kind: 'reobserve' }
  const answer = answerOf(step)
  const { generation, revision, rounds } = step.next
  const wake: Wake | null =
    answer === 'continue'
      ? { kind: 'continue', request: continueRequest({ generation, revision, rounds }) }
      : null
  return {
    kind: 'next',
    answer,
    record: {
      ...record,
      version: record.version + 1,
      state: step.next,
      readings: observedReadings(record.readings, input.decided, input.findings),
      wake,
      observed: { call: input.call, answer },
    },
  }
}

/** The rows of the gap table that are not closed yet, as text. */
export function openGap(body: GoalBody, readings: Readings, rounds: number): string {
  return renderGap(gapTable(body, readings, rounds).filter(row => row.open))
}
