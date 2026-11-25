import {
  AttendanceSchema,
  CriterionIdSchema,
  ExitIdSchema,
  GoalDraftSchema,
  MetricIdSchema,
  ObservedCallSchema,
  ProgressSchema,
  RuleIdSchema,
  type JudgeMaterial,
} from '@omne-harness/goal-contract'
import { z } from 'zod'

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u)
const CallPatchSchema = ObservedCallSchema.omit({ order: true }).partial().required({ ref: true })
const NewCallSchema = ObservedCallSchema.omit({ order: true })
const note = z.string().min(1).max(200)
const UnmetSchema = z.strictObject({ target: CriterionIdSchema, call: CallPatchSchema })

/** One change to a parent. What the judge should then say follows from the kind of change, not from an author. */
export const MutationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('break'), id, target: CriterionIdSchema, call: CallPatchSchema }),
  z.strictObject({ op: z.literal('drop'), id, target: CriterionIdSchema }),
  z.strictObject({
    op: z.literal('persuade'),
    id,
    target: CriterionIdSchema,
    call: CallPatchSchema.nullable(),
    note,
    authority: NewCallSchema.nullable(),
  }),
  z.strictObject({ op: z.literal('stale'), id, target: CriterionIdSchema, write: NewCallSchema }),
  z.strictObject({
    op: z.literal('contradict'),
    id,
    target: CriterionIdSchema,
    run: NewCallSchema,
  }),
  z.strictObject({ op: z.literal('narrow'), id, target: CriterionIdSchema, call: CallPatchSchema }),
  z.strictObject({
    op: z.literal('tamper'),
    id,
    target: CriterionIdSchema,
    before: z.string().min(1),
    write: NewCallSchema,
  }),
  z.strictObject({ op: z.literal('budget'), id, unmet: UnmetSchema }),
  z.strictObject({
    op: z.literal('good-enough'),
    id,
    metrics: z.partialRecord(MetricIdSchema, z.number().finite()),
  }),
  z.strictObject({
    op: z.literal('occur'),
    id,
    target: ExitIdSchema,
    calls: z.array(NewCallSchema).min(1),
    unmet: UnmetSchema,
  }),
  z.strictObject({
    op: z.literal('dead-end'),
    id,
    what: z.string().min(1),
    calls: z.array(NewCallSchema).min(1),
    unmet: UnmetSchema,
  }),
  z.strictObject({
    op: z.literal('unconfirm'),
    id,
    target: CriterionIdSchema,
    note: note.nullable(),
  }),
  z.strictObject({
    op: z.literal('violate'),
    id,
    target: RuleIdSchema,
    before: z.string().min(1),
    call: NewCallSchema,
  }),
])
export type Mutation = z.infer<typeof MutationSchema>
export type CallPatch = z.infer<typeof CallPatchSchema>
export type NewCall = z.infer<typeof NewCallSchema>

export const SPLITS = ['tune', 'verify', 'canary'] as const
export type Split = (typeof SPLITS)[number]

/** A session in which every criterion truly holds on fresh evidence, with a check that shows it for each judged one. */
export const ParentSchema = z.strictObject({
  id,
  title: z.string().min(1),
  source: z.string().min(1),
  split: z.enum(SPLITS),
  attendance: AttendanceSchema,
  draft: GoalDraftSchema,
  rounds: z.int().nonnegative(),
  metrics: z.partialRecord(MetricIdSchema, z.number().finite()),
  calls: z.array(ObservedCallSchema),
  progress: ProgressSchema,
  oracle: z.partialRecord(
    CriterionIdSchema,
    z.strictObject({ ref: z.string().min(1), contains: z.array(z.string().min(1)).min(1) }),
  ),
  mutations: z.array(MutationSchema),
})
export type Parent = z.infer<typeof ParentSchema>

export const FAMILIES = [
  'clean',
  'broken',
  'no-evidence',
  'persuasive',
  'stale',
  'conflict',
  'exit',
  'person-rule',
] as const
export type Family = (typeof FAMILIES)[number]

export const FAMILY_OF: Readonly<Record<Mutation['op'], Family>> = {
  break: 'broken',
  drop: 'no-evidence',
  persuade: 'persuasive',
  stale: 'stale',
  contradict: 'conflict',
  narrow: 'conflict',
  tamper: 'exit',
  budget: 'exit',
  'good-enough': 'exit',
  occur: 'exit',
  'dead-end': 'exit',
  unconfirm: 'person-rule',
  violate: 'person-rule',
}

/** What is right for one numbered entry, and what else is safe to say of it. */
export type Truth = Readonly<{ truth: string; safe: readonly string[] }>
export type Expected = Readonly<{
  entries: Readonly<Record<string, Truth>>
  target: string | null
  row: number
  success: boolean
}>
/** A frozen judging: the material the release would pack, and what each entry should come to. */
export type Case = Readonly<{
  id: string
  parent: string
  family: Family
  split: Split
  material: JudgeMaterial
  expected: Expected
}>
