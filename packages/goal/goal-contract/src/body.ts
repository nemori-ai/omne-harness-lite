import { z } from 'zod'

/** The sections whose entries carry a number, by the letter the number starts with. */
export const SECTIONS = Object.freeze({
  A: 'criteria',
  M: 'metrics',
  N: 'rules',
  X: 'exits',
  R: 'references',
} as const)
export type SectionLetter = keyof typeof SECTIONS
export type SectionName = (typeof SECTIONS)[SectionLetter]

const idOf = <L extends SectionLetter>(letter: L) =>
  z
    .string()
    .regex(new RegExp(`^${letter}[1-9][0-9]*$`, 'u')) as unknown as z.ZodType<`${L}${number}`>
export const CriterionIdSchema = idOf('A')
export const MetricIdSchema = idOf('M')
export const RuleIdSchema = idOf('N')
export const ExitIdSchema = idOf('X')
export const ReferenceIdSchema = idOf('R')
export type CriterionId = z.infer<typeof CriterionIdSchema>
export type MetricId = z.infer<typeof MetricIdSchema>
export type RuleId = z.infer<typeof RuleIdSchema>
export type ExitId = z.infer<typeof ExitIdSchema>
export type ReferenceId = z.infer<typeof ReferenceIdSchema>
export type EntryId = CriterionId | MetricId | RuleId | ExitId | ReferenceId

const line = z.string().trim().min(1)

export const EvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('command'), command: line }),
  z.strictObject({ kind: z.literal('file'), path: line }),
  z.strictObject({ kind: z.literal('metric'), metric: MetricIdSchema }),
  z.strictObject({ kind: z.literal('person') }),
  z.strictObject({ kind: z.literal('activity') }),
  z.strictObject({ kind: z.literal('rerun'), command: line }),
  z.strictObject({ kind: z.literal('examination'), method: line }),
])
export type Evidence = z.infer<typeof EvidenceSchema>

export const PassSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('exit-zero') }),
  z.strictObject({ kind: z.literal('shows'), text: line }),
])
export type Pass = z.infer<typeof PassSchema>

export const CriterionSchema = z.strictObject({
  statement: line,
  evidence: EvidenceSchema,
  pass: PassSchema.nullable().default(null),
})
export const MetricSchema = z.strictObject({
  statement: line,
  measure: z.strictObject({ command: line, path: line }),
  direction: z.enum(['lower', 'higher']),
  target: z.number().finite(),
  floor: z.number().finite().nullable().default(null),
  baseline: z
    .union([z.number().finite(), z.literal('measure-first')])
    .nullable()
    .default(null),
})
export const RuleSchema = z.strictObject({ statement: line })

/** What a good-enough exit stands on: a criterion that holds, or a metric at its floor. */
export const StandingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('criterion'), id: CriterionIdSchema }),
  z.strictObject({ kind: z.literal('floor'), id: MetricIdSchema }),
])
export type Standing = z.infer<typeof StandingSchema>

export const LimitSchema = z.strictObject({
  amount: z.int().positive(),
  unit: z.enum(['rounds', 'examinations']),
})
export const ExitSchema = z.strictObject({
  statement: line,
  kind: z.enum(['budget', 'good-enough', 'condition', 'person']),
  limits: z.array(LimitSchema).default([]),
  by: z.array(StandingSchema).default([]),
  deliver: line,
  counts: z.enum(['success', 'failure']),
})
export const ReferenceSchema = z.strictObject({
  statement: line,
  at: line,
  readWhen: line.nullable().default(null),
})

const count = z.int().nonnegative()
/** How many numbers each section has issued: the next entry takes the next one, and none is reused. */
export const IssuedSchema = z.strictObject({ A: count, M: count, N: count, X: count, R: count })
export type Issued = z.infer<typeof IssuedSchema>

/** The body of a goal as it is kept: typed bones, natural-language leaves. Text is rendered from it. */
export const GoalBodySchema = z.strictObject({
  purpose: line,
  criteria: z.array(CriterionSchema.extend({ id: CriterionIdSchema })),
  metrics: z.array(MetricSchema.extend({ id: MetricIdSchema })),
  rules: z.array(RuleSchema.extend({ id: RuleIdSchema })),
  exits: z.array(ExitSchema.extend({ id: ExitIdSchema })),
  references: z.array(ReferenceSchema.extend({ id: ReferenceIdSchema })),
  method: z.array(line),
  issued: IssuedSchema,
})
export type GoalBody = z.infer<typeof GoalBodySchema>
export type Criterion = GoalBody['criteria'][number]
export type Metric = GoalBody['metrics'][number]
export type Rule = GoalBody['rules'][number]
export type Exit = GoalBody['exits'][number]
export type Reference = GoalBody['references'][number]

/** A body as it is handed in, without numbers: entries take A1, A2… in the order they stand. */
export const GoalDraftSchema = z.strictObject({
  purpose: z.string(),
  criteria: z.array(CriterionSchema).default([]),
  metrics: z.array(MetricSchema).default([]),
  rules: z.array(RuleSchema).default([]),
  exits: z.array(ExitSchema).default([]),
  references: z.array(ReferenceSchema).default([]),
  method: z.array(z.string()).default([]),
})
export type GoalDraft = z.input<typeof GoalDraftSchema>
