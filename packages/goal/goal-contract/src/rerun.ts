import { z } from 'zod'
import { sameKey, type Batch, type BatchKey } from './awaited.ts'
import { CriterionIdSchema, type CriterionId } from './body.ts'
import { evidence, type EvidenceStep } from './observe.ts'
import type { GoalRecord } from './record.ts'

export const RanSchema = z.strictObject({
  criterion: CriterionIdSchema,
  exit: z.int().nullable(),
  note: z.string().max(400),
})
/** One command run again in a clean copy: its exit code, or null when it could not be run to an end, and what was seen. */
export type Ran = z.infer<typeof RanSchema>

type Kept = NonNullable<Batch['ran'][CriterionId]>
export function ranOf(results: unknown): readonly Ran[] | null {
  const parsed = z.array(RanSchema).safeParse(results)
  return parsed.success ? parsed.data : null
}

const ranReading = ({ exit, note }: Pick<Ran, 'exit' | 'note'>): Kept => ({
  value: exit === null ? 'cannot-tell' : exit === 0 ? 'holds' : 'fails',
  note,
  refs: [],
})
export const NOT_RUN = 'the command was not run again'

export type ReranStep =
  | Readonly<{ kind: 'dropped' }>
  | Readonly<{
      kind: 'next'
      record: GoalRecord
      told: Extract<EvidenceStep, { kind: 'next' }>['told']
      examine: readonly CriterionId[]
    }>

/** The program hands in the exit codes of the commands a batch runs again. With nothing left to examine, or with a command that did not pass, the batch is back: the cheap reading comes first, and an examination is not spent on work a command already refused. */
export function reran(
  record: GoalRecord,
  input: Readonly<{
    generation: number
    key: BatchKey
    results: readonly Ran[]
    written: string
    running: boolean
  }>,
): ReranStep {
  const { key, written, running } = input
  const { batch } = record.examination
  if (input.generation !== record.state.generation) return { kind: 'dropped' }
  if (batch === null || !sameKey(batch.key, key)) return { kind: 'dropped' }
  const kindOf = (id: CriterionId) =>
    record.body.criteria.find(entry => entry.id === id)?.evidence.kind
  const runs = batch.criteria.filter(id => kindOf(id) === 'rerun')
  const rest = batch.criteria.filter(id => !runs.includes(id))
  const read = runs.map(id => {
    const result = input.results.find(entry => entry.criterion === id)
    return [id, ranReading(result ?? { exit: null, note: NOT_RUN })] as const
  })
  const ran = Object.fromEntries(read) as Batch['ran']
  const passed = read.every(([, reading]) => reading.value === 'holds')
  const current = sameKey(key, { revision: record.state.revision, written })
  if (rest.length > 0 && passed && current) {
    const examination = { ...record.examination, batch: { ...batch, ran } }
    const next = { ...record, version: record.version + 1, examination }
    return { kind: 'next', record: next, told: null, examine: rest }
  }
  const step = evidence(record, { key, written, running, answers: ran, unread: rest })
  return step.kind === 'next' ? { ...step, examine: [] } : step
}
