import type { z } from 'zod'
import {
  GoalDraftSchema,
  SECTIONS,
  type Exit,
  type GoalBody,
  type Issued,
  type SectionLetter,
} from './body.ts'
import { BODY_MAX_CHARACTERS, characters, renderBody } from './render.ts'
import type { Attendance } from './state.ts'

export const DEFAULT_BUDGET_ROUNDS = 50

export type BodyContext = Readonly<{ attendance: Attendance }>

/** One thing wrong with a body: which entry, which field, and what. No entry means the body as a whole. */
export type BodyIssue = Readonly<{ entry: string | null; field: string; problem: string }>
export type BodyCheck =
  | Readonly<{ kind: 'valid'; body: GoalBody }>
  | Readonly<{ kind: 'invalid'; issues: readonly BodyIssue[] }>

const LETTERS = Object.fromEntries(
  Object.entries(SECTIONS).map(([letter, name]) => [name, letter]),
) as Readonly<Record<string, SectionLetter>>

function shapeIssue(issue: z.core.$ZodIssue): BodyIssue {
  const [section, index, field] = issue.path
  const letter = typeof section === 'string' ? LETTERS[section] : undefined
  const unknown = issue.code === 'unrecognized_keys' ? issue.keys[0] : undefined
  if (letter !== undefined && typeof index === 'number')
    return {
      entry: `${letter}${String(index + 1)}`,
      field: String(field ?? unknown ?? 'entry'),
      problem: issue.message,
    }
  return { entry: null, field: String(section ?? unknown ?? 'body'), problem: issue.message }
}

/** The budget a goal gets when it writes none. */
export const DEFAULT_BUDGET: Omit<Exit, 'id'> = {
  statement: '预算用尽',
  kind: 'budget',
  limits: [{ amount: DEFAULT_BUDGET_ROUNDS, unit: 'rounds' }],
  by: [],
  deliver: '做到哪一步、还差什么',
  counts: 'failure',
}

/** Numbers the entries in the order they stand, and adds the default budget when none is written. */
function numbered(draft: z.output<typeof GoalDraftSchema>): GoalBody {
  const number = <T>(letter: SectionLetter, list: readonly T[]) =>
    list.map((entry, index) => ({ ...entry, id: `${letter}${String(index + 1)}` }))
  const exits = draft.exits.some(exit => exit.kind === 'budget')
    ? draft.exits
    : [...draft.exits, DEFAULT_BUDGET]
  const issued: Issued = {
    A: draft.criteria.length,
    M: draft.metrics.length,
    N: draft.rules.length,
    X: exits.length,
    R: draft.references.length,
  }
  return {
    purpose: draft.purpose.trim(),
    criteria: number('A', draft.criteria),
    metrics: number('M', draft.metrics),
    rules: number('N', draft.rules),
    exits: number('X', exits),
    references: number('R', draft.references),
    method: draft.method,
    issued,
  } as GoalBody
}

function exitIssues(body: GoalBody): BodyIssue[] {
  const found: BodyIssue[] = []
  const say = (entry: string, field: string, problem: string) =>
    found.push({ entry, field, problem })
  let budgets = 0
  for (const exit of body.exits) {
    if (exit.kind === 'budget') {
      budgets += 1
      if (budgets > 1) say(exit.id, 'kind', 'a goal has one budget exit')
      if (exit.limits.length === 0) say(exit.id, 'limits', 'a budget exit needs a limit')
    } else if (exit.limits.length > 0) say(exit.id, 'limits', 'only a budget exit has limits')
    if (exit.kind !== 'good-enough') {
      if (exit.by.length > 0) say(exit.id, 'by', 'only a good-enough exit stands on entries')
      continue
    }
    if (exit.by.length === 0)
      say(exit.id, 'by', 'good enough stands on criteria or metric floors, not on a sentence')
    for (const standing of exit.by) {
      if (standing.kind === 'criterion') {
        if (!body.criteria.some(entry => entry.id === standing.id))
          say(exit.id, 'by', `there is no criterion ${standing.id}`)
        continue
      }
      const metric = body.metrics.find(entry => entry.id === standing.id)
      if (metric === undefined) say(exit.id, 'by', `there is no metric ${standing.id}`)
      else if (metric.floor === null) say(exit.id, 'by', `metric ${standing.id} has no floor`)
    }
  }
  return found
}

function criterionIssues(body: GoalBody, context: BodyContext): BodyIssue[] {
  const found: BodyIssue[] = []
  if (body.criteria.length === 0)
    found.push({ entry: null, field: 'criteria', problem: 'a goal needs one criterion at least' })
  for (const entry of body.criteria) {
    const { evidence } = entry
    if (evidence.kind === 'metric' && !body.metrics.some(metric => metric.id === evidence.metric))
      found.push({
        entry: entry.id,
        field: 'evidence',
        problem: `there is no metric ${evidence.metric}`,
      })
    if (evidence.kind === 'person' && context.attendance === 'unattended')
      found.push({
        entry: entry.id,
        field: 'evidence',
        problem: 'nobody is in an unattended session to confirm',
      })
    if (entry.pass?.kind === 'exit-zero' && evidence.kind !== 'command')
      found.push({ entry: entry.id, field: 'pass', problem: 'only a command has an exit code' })
  }
  return found
}

/** What is wrong with a numbered body, in the order of its sections; nothing when it stands. */
export function bodyIssues(body: GoalBody, context: BodyContext): readonly BodyIssue[] {
  const found: BodyIssue[] = []
  if (body.purpose === '')
    found.push({ entry: null, field: 'purpose', problem: 'a goal needs a purpose' })
  found.push(...criterionIssues(body, context), ...exitIssues(body))
  if (body.method.some(step => step.trim() === ''))
    found.push({ entry: null, field: 'method', problem: 'a line of method is empty' })
  const length = characters(renderBody(body))
  if (length > BODY_MAX_CHARACTERS)
    found.push({
      entry: null,
      field: 'body',
      problem: `the rendered body is ${String(length)} characters; the limit is ${String(BODY_MAX_CHARACTERS)}`,
    })
  return found
}

/** A body handed in without numbers becomes the kept body, or the list of what is wrong with it. */
export function validateDraft(draft: unknown, context: BodyContext): BodyCheck {
  const parsed = GoalDraftSchema.safeParse(draft)
  if (!parsed.success) return { kind: 'invalid', issues: parsed.error.issues.map(shapeIssue) }
  const body = numbered(parsed.data)
  const issues = bodyIssues(body, context)
  return issues.length === 0 ? { kind: 'valid', body } : { kind: 'invalid', issues }
}
