import { z } from 'zod'
import {
  CriterionIdSchema,
  ExitIdSchema,
  MetricIdSchema,
  RuleIdSchema,
  type GoalBody,
} from './body.ts'
import { characters } from './render.ts'
import type { BodyIssue } from './validate.ts'

const ref = z.string().min(1).max(256)
const refs = z.array(ref).max(16)
const NOTE_MAX_CHARACTERS = 200
const note = z.string().refine(text => characters(text) <= NOTE_MAX_CHARACTERS, {
  message: `a note is ${String(NOTE_MAX_CHARACTERS)} characters at most`,
})
const CriterionProgressSchema = z.strictObject({
  status: z.enum(['not-started', 'doing', 'claimed-done', 'blocked']),
  refs,
  note,
})
const ObstacleSchema = z.strictObject({
  what: z.string().min(1),
  tried: refs,
  exit: ExitIdSchema.nullable(),
})
const ProposalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['none', 'achieved', 'unattainable']) }),
  z.strictObject({ kind: z.literal('exit'), exit: ExitIdSchema }),
])
const sections = {
  criteria: z.partialRecord(CriterionIdSchema, CriterionProgressSchema),
  metrics: z.partialRecord(MetricIdSchema, z.strictObject({ ref })),
  rules: z.partialRecord(
    RuleIdSchema,
    z.strictObject({ check: z.enum(['kept', 'maybe-touched']) }),
  ),
}
const whole = {
  obstacle: ObstacleSchema.nullable(),
  deliverables: z.array(z.string().min(1)).max(16),
  proposal: ProposalSchema,
  notes: z.array(z.string().min(1)).max(20),
}
export const ProgressSchema = z.strictObject({ ...sections, ...whole })
/** What the agent says of its own work, by the numbers of the body. It is a claim: evidence is only what it cites. */
export type Progress = z.infer<typeof ProgressSchema>
export const TrackSchema = ProgressSchema.partial()
export const NO_PROGRESS: Progress = Object.freeze({
  criteria: {},
  metrics: {},
  rules: {},
  obstacle: null,
  deliverables: [],
  proposal: { kind: 'none' },
  notes: [],
})

export type ProgressCheck =
  | Readonly<{ kind: 'valid'; progress: Progress }>
  | Readonly<{ kind: 'invalid'; issues: readonly BodyIssue[] }>

const SECTIONS = ['criteria', 'metrics', 'rules'] as const
const has = (body: GoalBody, section: 'criteria' | 'metrics' | 'rules' | 'exits', id: string) =>
  body[section].some(entry => entry.id === id)

function shapeIssue(issue: z.core.$ZodIssue): BodyIssue {
  const [section, id, field] = issue.path
  const unknown = issue.code === 'unrecognized_keys' ? issue.keys[0] : undefined
  const numbered = SECTIONS.some(name => name === section) && typeof id === 'string'
  return numbered
    ? { entry: id, field: String(field ?? unknown ?? 'entry'), problem: issue.message }
    : { entry: null, field: String(section ?? unknown ?? 'progress'), problem: issue.message }
}

function unknownNumbers(body: GoalBody, progress: Progress): BodyIssue[] {
  const found: BodyIssue[] = []
  for (const section of SECTIONS)
    for (const id of Object.keys(progress[section]))
      if (!has(body, section, id))
        found.push({ entry: id, field: 'id', problem: `the goal has no ${id}` })
  const exits = [
    ['proposal', progress.proposal.kind === 'exit' ? progress.proposal.exit : null],
    ['obstacle', progress.obstacle?.exit ?? null],
  ] as const
  for (const [field, exit] of exits)
    if (exit !== null && !has(body, 'exits', exit))
      found.push({ entry: null, field, problem: `the goal has no exit ${exit}` })
  return found
}

/** An update of the progress list: entries by number are merged in, the rest is replaced whole when named. */
export function applyTrack(body: GoalBody, before: Progress, patch: unknown): ProgressCheck {
  const parsed = TrackSchema.safeParse(patch)
  if (!parsed.success) return { kind: 'invalid', issues: parsed.error.issues.map(shapeIssue) }
  const { criteria, metrics, rules, ...rest } = parsed.data
  const named = Object.entries(rest).filter(([, value]) => value !== undefined)
  const progress: Progress = {
    ...before,
    ...(Object.fromEntries(named) as Partial<Progress>),
    criteria: { ...before.criteria, ...criteria },
    metrics: { ...before.metrics, ...metrics },
    rules: { ...before.rules, ...rules },
  }
  const issues = unknownNumbers(body, progress)
  return issues.length === 0 ? { kind: 'valid', progress } : { kind: 'invalid', issues }
}

/** Every tool call the list cites, once each, in the order it cites them. */
export function citedRefs(progress: Progress): readonly string[] {
  const cited = [
    ...Object.values(progress.criteria).flatMap(entry => entry?.refs ?? []),
    ...Object.values(progress.metrics).flatMap(entry => (entry === undefined ? [] : [entry.ref])),
    ...(progress.obstacle?.tried ?? []),
  ]
  return [...new Set(cited)]
}

/** After a revision, what was said of an entry stays only while that entry stands unchanged. */
export function keptProgress(before: GoalBody, after: GoalBody, progress: Progress): Progress {
  const same = <S extends (typeof SECTIONS)[number]>(section: S): Progress[S] => {
    const was = new Map(before[section].map(entry => [entry.id as string, JSON.stringify(entry)]))
    const kept = after[section].filter(entry => was.get(entry.id) === JSON.stringify(entry))
    const ids = new Set<string>(kept.map(entry => entry.id))
    const entries = Object.entries(progress[section]).filter(([id]) => ids.has(id))
    return Object.fromEntries(entries) as Progress[S]
  }
  const stands = (exit: string | null) => exit === null || has(after, 'exits', exit)
  const { obstacle, proposal } = progress
  return {
    ...progress,
    criteria: same('criteria'),
    metrics: same('metrics'),
    rules: same('rules'),
    obstacle: obstacle === null || stands(obstacle.exit) ? obstacle : { ...obstacle, exit: null },
    proposal: proposal.kind === 'exit' && !stands(proposal.exit) ? { kind: 'none' } : proposal,
  }
}
