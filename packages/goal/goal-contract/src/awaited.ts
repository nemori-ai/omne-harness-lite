import { z } from 'zod'
import { CriterionIdSchema, type CriterionId } from './body.ts'
import type { CriterionReading } from './verdict.ts'

export const BatchKeySchema = z.strictObject({
  revision: z.int().positive(),
  written: z.string(),
})
/** The identity of a batch within its goal: the revision, and where the last write of a file stands in the session. */
export type BatchKey = z.infer<typeof BatchKeySchema>
export const sameKey = (a: BatchKey, b: BatchKey): boolean =>
  a.revision === b.revision && a.written === b.written

export const BatchSchema = z.strictObject({
  key: BatchKeySchema,
  criteria: z.array(CriterionIdSchema).min(1),
  delivery: z.enum(['owed', 'handed', 'unknown']),
})
/** The criteria handed to the examining side together. `owed`: written down, not yet taken. `unknown`: whether it was taken is not known; it is handed again as the same batch. */
export type Batch = z.infer<typeof BatchSchema>

export const ExaminedValueSchema = z.enum(['holds', 'fails', 'cannot-tell'])
export const ExaminedSchema = z.strictObject({
  key: BatchKeySchema,
  value: ExaminedValueSchema,
  note: z.string().nullable(),
  refs: z.array(z.string().min(1)),
})
export type Examined = z.infer<typeof ExaminedSchema>
export type Handed = Readonly<{
  value: Examined['value']
  note: string | null
  refs: readonly string[]
}>

export const ExaminationSchema = z.strictObject({
  batch: BatchSchema.nullable(),
  used: z.int().nonnegative(),
  read: z.partialRecord(CriterionIdSchema, ExaminedSchema),
  examiner: z.string().min(1).nullable().default(null),
  submitted: z
    .strictObject({ key: BatchKeySchema, digest: z.string().min(1) })
    .nullable()
    .default(null),
})
/** What a goal keeps of its examinations: the batch that is out, how many were handed over, and what each criterion was last read as. */
export type Examination = z.infer<typeof ExaminationSchema>
export const NO_EXAMINATION: Examination = Object.freeze({
  batch: null,
  used: 0,
  read: {},
  examiner: null,
  submitted: null,
})

export const NOT_HANDED_IN = 'the examination ended without handing in its readings'
export const LEFT_OUT = 'the examiner handed in no reading of it'

export function batchRequest(generation: number, key: BatchKey): string {
  return `examine/${String(generation)}/${String(key.revision)}/${key.written}`
}

export function pendingOf(examination: Examination, now: BatchKey): readonly CriterionId[] {
  const { batch } = examination
  return batch !== null && sameKey(batch.key, now) ? batch.criteria : []
}

/** The reading of one criterion that waits for a run again or an examination, as the table of the specification has it. */
export function awaitedReading(
  id: CriterionId,
  examination: Examination,
  now: BatchKey,
): CriterionReading {
  const { batch } = examination
  if (batch !== null && sameKey(batch.key, now) && batch.criteria.includes(id))
    return batch.delivery === 'unknown' ? 'cannot-tell' : 'gathering'
  const read = examination.read[id]
  if (read === undefined || read.key.revision !== now.revision) return 'no-evidence'
  return read.key.written === now.written ? read.value : 'stale'
}

/** Hands a batch over under an identity. The same identity is handed once; a batch of another identity still out is replaced. */
export function handed(
  examination: Examination,
  key: BatchKey,
  criteria: readonly CriterionId[],
): Readonly<{ examination: Examination; replaced: Batch | null }> {
  const { batch } = examination
  if (batch !== null && sameKey(batch.key, key)) return { examination, replaced: null }
  const next: Batch = { key, criteria: [...criteria], delivery: 'owed' }
  return {
    examination: { ...examination, batch: next, used: examination.used + 1 },
    replaced: batch,
  }
}

/** The readings of a batch come in, or its round ended without them (`null`). Readings of a batch that is not the one out are dropped. */
export function received(
  examination: Examination,
  key: BatchKey,
  answers: Readonly<Partial<Record<CriterionId, Handed>>> | null,
): Readonly<{ examination: Examination; taken: boolean }> {
  const { batch } = examination
  if (batch === null || !sameKey(batch.key, key)) return { examination, taken: false }
  const missing: Handed = {
    value: 'cannot-tell',
    note: answers === null ? NOT_HANDED_IN : LEFT_OUT,
    refs: [],
  }
  const read = batch.criteria.map(id => {
    const { value, note, refs } = answers?.[id] ?? missing
    return [id, { key, value, note, refs: [...refs] }] as const
  })
  return {
    examination: {
      ...examination,
      batch: null,
      read: { ...examination.read, ...Object.fromEntries(read) },
    },
    taken: true,
  }
}

export function delivered(
  examination: Examination,
  key: BatchKey,
  delivery: 'handed' | 'unknown',
): Examination {
  const { batch } = examination
  if (batch === null || !sameKey(batch.key, key)) return examination
  return { ...examination, batch: { ...batch, delivery } }
}

export function submissionOf(
  examination: Examination,
  key: BatchKey,
  digest: string,
): 'new' | 'repeat' | 'differs' {
  const { submitted } = examination
  if (submitted === null || !sameKey(submitted.key, key)) return 'new'
  return submitted.digest === digest ? 'repeat' : 'differs'
}

type Dropped = Readonly<{ examination: Examination; cancelled: Batch | null }>

export function cancelled(examination: Examination): Dropped {
  return { examination: { ...examination, batch: null }, cancelled: examination.batch }
}

export function keptExamination(examination: Examination, kept: ReadonlySet<CriterionId>): Dropped {
  const { batch } = examination
  const read = Object.fromEntries(
    Object.entries(examination.read).filter(([id]) => kept.has(id as CriterionId)),
  )
  const touched = batch !== null && batch.criteria.some(id => !kept.has(id))
  return {
    examination: { ...examination, batch: touched ? null : batch, read },
    cancelled: touched ? batch : null,
  }
}
