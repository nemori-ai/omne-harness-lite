import type { CriterionId, ExitId, RuleId } from '../body.ts'
import type { CriterionReading, Findings, RuleReading } from '../verdict.ts'
import type { JudgeConfig, JudgeMaterial } from './material.ts'
import { UNATTAINABLE, type JudgeQuestion, type JudgeRequest, type Packed } from './pack.ts'

/** One answer as the decision interface gives it: a refusal, a number for yes or no, or a choice with its probabilities. */
export type JudgeAnswer = Readonly<{
  type: string
  noul?: number
  choice?: string
  confidence?: number
  probabilities?: Readonly<Record<string, number>>
}>
/** The answers to one request by question name. `null`: the request got no answer. */
export type JudgeReply = Readonly<Record<string, JudgeAnswer>> | null

export function probabilityOf(answer: JudgeAnswer): number | null {
  if (answer.choice === undefined) return null
  return answer.probabilities?.[answer.choice] ?? answer.confidence ?? null
}

function fits(question: JudgeQuestion, answer: JudgeAnswer | undefined): boolean {
  if (answer === undefined) return false
  if (answer.type === 'refusal') return true
  if (answer.type !== question.type) return false
  if (question.type === 'noul') return typeof answer.noul === 'number'
  return answer.choice !== undefined && Object.hasOwn(question.criteria, answer.choice)
}

/** A reply counts only whole: every question answered in its own type, with one of its own options. */
export function validReply(request: JudgeRequest, reply: JudgeReply): boolean {
  if (reply === null) return false
  return Object.entries(request.questions).every(([name, question]) => fits(question, reply[name]))
}

const over = (answer: JudgeAnswer, line: number): boolean => {
  const probability = answer.type === 'noul' ? (answer.noul ?? null) : probabilityOf(answer)
  return probability !== null && probability >= line
}

const CRITERION_ORDER = ['fails', 'stale', 'no-evidence', 'cannot-tell', 'holds'] as const
const RULE_ORDER = ['broken', 'unclear', 'kept'] as const
const SEEN_ORDER = ['no', 'yes'] as const

function criterionReading(answer: JudgeAnswer, line: number): string {
  if (answer.type === 'refusal') return 'cannot-tell'
  if (answer.choice !== 'holds') return String(answer.choice)
  return over(answer, line) ? 'holds' : 'cannot-tell'
}

function ruleReading(answer: JudgeAnswer, line: number): string {
  if (answer.choice === 'broken') return 'broken'
  return answer.choice === 'kept' && over(answer, line) ? 'kept' : 'unclear'
}

function seenReading(name: string, answer: JudgeAnswer, line: number): string {
  const none = name === UNATTAINABLE.blocked && answer.choice === 'none'
  return answer.type !== 'refusal' && !none && over(answer, line) ? 'yes' : 'no'
}

/** What one answer comes to once the line is applied. An answer short of the line never stands. */
export function readAnswer(name: string, answer: JudgeAnswer, line: number): string {
  if (name.startsWith('A')) return criterionReading(answer, line)
  return name.startsWith('N') ? ruleReading(answer, line) : seenReading(name, answer, line)
}

// A tie goes to the reading that claims least.
function majority<T extends string>(said: readonly string[], order: readonly T[]): T {
  const count = (reading: T): number => said.filter(entry => entry === reading).length
  return order.reduce((best, reading) => (count(reading) > count(best) ? reading : best))
}

const orderOf = (name: string): readonly string[] =>
  name.startsWith('A') ? CRITERION_ORDER : name.startsWith('N') ? RULE_ORDER : SEEN_ORDER

function tally(
  config: JudgeConfig,
  packed: Packed,
  votes: readonly (readonly JudgeReply[])[],
): ReadonlyMap<string, string> | null {
  const read = new Map<string, string>()
  for (const [index, request] of packed.requests.entries()) {
    const whole = votes.flatMap(vote => {
      const reply = vote[index] ?? null
      return reply !== null && validReply(request, reply) ? [reply] : []
    })
    if (whole.length === 0) return null
    for (const name of Object.keys(request.questions)) {
      const said = whole.map(reply => readAnswer(name, reply[name] as JudgeAnswer, config.line))
      read.set(name, majority(said, orderOf(name)))
    }
  }
  return read
}

/** The findings of one observation: what the system settled, and what the answers come to under the line. */
export function readJudge(
  material: JudgeMaterial,
  config: JudgeConfig,
  packed: Packed,
  votes: readonly (readonly JudgeReply[])[],
): Findings {
  const base = { metrics: material.metrics, exits: [], unattainable: false } as const
  const read = tally(config, packed, votes)
  if (read === null) return { ...base, judge: 'unavailable', criteria: packed.decided, rules: {} }
  const criteria: Partial<Record<CriterionId, CriterionReading>> = { ...packed.decided }
  const rules: Partial<Record<RuleId, RuleReading>> = {}
  const exits: ExitId[] = []
  for (const [name, reading] of read) {
    if (name.startsWith('A')) criteria[name as CriterionId] = reading as CriterionReading
    else if (name.startsWith('N')) rules[name as RuleId] = reading as RuleReading
    else if (name.startsWith('X') && reading === 'yes') exits.push(name as ExitId)
  }
  const refs = new Set(material.calls.map(call => call.ref))
  const tried = material.progress.obstacle?.tried.some(ref => refs.has(ref)) ?? false
  const unattainable =
    tried && read.get(UNATTAINABLE.blocked) === 'yes' && read.get(UNATTAINABLE.tried) === 'yes'
  return { ...base, judge: 'answered', criteria, rules, exits, unattainable }
}
