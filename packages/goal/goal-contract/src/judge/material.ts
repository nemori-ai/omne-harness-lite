import { z } from 'zod'
import { GoalBodySchema, MetricIdSchema } from '../body.ts'
import { ProgressSchema } from '../progress.ts'
import { AttendanceSchema } from '../state.ts'

export const ObservedCallSchema = z.strictObject({
  ref: z.string().min(1),
  order: z.int().nonnegative(),
  tool: z.string().min(1),
  command: z.string().nullable(),
  path: z.string().nullable(),
  exit: z.int().nullable(),
  output: z.string(),
  writes: z.boolean(),
})
/** One tool call of the session since the goal was set, as its result stands in the history. */
export type ObservedCall = z.infer<typeof ObservedCallSchema>

export const JudgeMaterialSchema = z.strictObject({
  body: GoalBodySchema,
  attendance: AttendanceSchema,
  progress: ProgressSchema,
  calls: z.array(ObservedCallSchema),
  metrics: z.partialRecord(MetricIdSchema, z.number().finite()),
  rounds: z.int().nonnegative(),
})
/** Everything one judging starts from: what was agreed, what the agent says, and what the session shows. */
export type JudgeMaterial = z.infer<typeof JudgeMaterialSchema>

export const JudgeConfigSchema = z.strictObject({
  split: z.enum(['one', 'sections', 'each']),
  instructions: z.strictObject({
    criterion: z.enum(['statement', 'rendered']),
    rules: z.array(z.string().min(1).max(200)).max(8),
    exits: z.enum(['statement', 'guided']).default('statement'),
    unattainable: z.enum(['kind', 'plain']).default('kind'),
    unsettled: z.enum(['criterion', 'covers']).default('criterion'),
  }),
  packaging: z.strictObject({
    excerpt: z.int().min(200).max(2000),
    take: z.enum(['head', 'tail', 'both']),
    notes: z.boolean(),
    staleness: z.enum(['marked', 'decided']),
    activity: z.enum(['lines', 'excerpts', 'all']),
    flags: z.enum(['keys', 'notes', 'guarded']),
    drafts: z.enum(['later', 'superseded']).default('later'),
  }),
  model: z.string().min(1),
  line: z.number().min(0.5).max(0.99),
  votes: z.union([z.literal(1), z.literal(3)]),
})
/** How a judging is asked: the six things the bench tunes. The rules of a goal are not among them. */
export type JudgeConfig = z.infer<typeof JudgeConfigSchema>

export const DEFAULT_JUDGE_MODEL = 'openai/gpt-6-luna-decisions'
export const JUDGE_MODELS = Object.freeze([
  DEFAULT_JUDGE_MODEL,
  'typesafe/jev-1.14',
  'typesafe/jev-1.13',
] as const)
export type JudgeModel = (typeof JUDGE_MODELS)[number]
/** How a judging was asked before anything was tuned: the scheme the bench measures every other one against. */
export const BASELINE_JUDGE_CONFIG: JudgeConfig = Object.freeze({
  split: 'one',
  instructions: Object.freeze({
    criterion: 'rendered',
    rules: [],
    exits: 'statement',
    unattainable: 'kind',
    unsettled: 'criterion',
  }),
  packaging: Object.freeze({
    excerpt: 2000,
    take: 'both',
    notes: true,
    staleness: 'marked',
    activity: 'lines',
    flags: 'keys',
    drafts: 'later',
  }),
  model: DEFAULT_JUDGE_MODEL,
  line: 0.9,
  votes: 1,
})

/** How a judging is asked now: the scheme the bench settled on. What differs from the baseline is what the measurements earned. */
export const DEFAULT_JUDGE_CONFIG: JudgeConfig = Object.freeze({
  ...BASELINE_JUDGE_CONFIG,
  instructions: Object.freeze({
    ...BASELINE_JUDGE_CONFIG.instructions,
    exits: 'guided',
    unattainable: 'plain',
  }),
  packaging: Object.freeze({
    ...BASELINE_JUDGE_CONFIG.packaging,
    staleness: 'decided',
    activity: 'all',
    flags: 'guarded',
    drafts: 'superseded',
  }),
})
