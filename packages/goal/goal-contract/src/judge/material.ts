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
  }),
  packaging: z.strictObject({
    excerpt: z.int().min(200).max(2000),
    take: z.enum(['head', 'tail', 'both']),
    notes: z.boolean(),
    staleness: z.enum(['marked', 'decided']),
    activity: z.enum(['lines', 'excerpts', 'all']),
    flags: z.enum(['keys', 'notes']),
  }),
  model: z.string().min(1),
  line: z.number().min(0.5).max(0.99),
  votes: z.union([z.literal(1), z.literal(3)]),
})
/** How a judging is asked: the six things the bench tunes. The rules of a goal are not among them. */
export type JudgeConfig = z.infer<typeof JudgeConfigSchema>

export const DEFAULT_JUDGE_MODEL = 'openai/gpt-6-luna-decisions'
export const DEFAULT_JUDGE_CONFIG: JudgeConfig = Object.freeze({
  split: 'one',
  instructions: Object.freeze({ criterion: 'rendered', rules: [] }),
  packaging: Object.freeze({
    excerpt: 2000,
    take: 'both',
    notes: true,
    staleness: 'marked',
    activity: 'lines',
    flags: 'keys',
  }),
  model: DEFAULT_JUDGE_MODEL,
  line: 0.9,
  votes: 1,
})
