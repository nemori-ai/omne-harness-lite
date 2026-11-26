import { z } from 'zod'
import {
  batchRequest,
  ExaminedValueSchema,
  sameKey,
  submissionOf,
  type Batch,
  type BatchKey,
  type Handed,
} from './awaited.ts'
import { CriterionIdSchema, type CriterionId, type GoalBody } from './body.ts'
import type { ObservedCall } from './judge/material.ts'
import { evidence, type EvidenceStep } from './observe.ts'
import type { GoalRecord } from './record.ts'
import { entryTexts } from './render.ts'
import type { BodyIssue } from './validate.ts'

export const SubmittedSchema = z.strictObject({
  criterion: CriterionIdSchema,
  value: ExaminedValueSchema,
  refs: z.array(z.string().min(1)).max(16),
  note: z.string().max(400),
})
/** One reading of the examining side: which criterion, one of three, the calls of its own round it cites, and what it saw. */
export type Submitted = z.infer<typeof SubmittedSchema>
export const SubmissionSchema = z.strictObject({
  batch: z.string().min(1),
  readings: z.array(SubmittedSchema).min(1),
})

const REQUEST = /^examine\/([1-9][0-9]*)\/([1-9][0-9]*)\/(.*)$/su

/** The goal and the identity a batch was handed over under, read back from its name. Null: this names no batch. */
export function batchOfRequest(
  request: string,
): Readonly<{ generation: number; key: BatchKey }> | null {
  const found = REQUEST.exec(request)
  if (found === null) return null
  const [, generation, revision, written] = found
  return {
    generation: Number(generation),
    key: { revision: Number(revision), written: String(written) },
  }
}

/** What is wrong with the readings of a batch: one of its criteria left out, one that is not of it, or one read twice. */
export function submissionIssues(
  batch: Batch,
  readings: readonly Submitted[],
): readonly BodyIssue[] {
  const say = (entry: string, problem: string): BodyIssue => ({ entry, field: 'readings', problem })
  const given = readings.map(reading => reading.criterion)
  const missing = batch.criteria.filter(id => !given.includes(id))
  const extra = [...new Set(given.filter(id => !batch.criteria.includes(id)))]
  const twice = [...new Set(given.filter((id, at) => given.indexOf(id) !== at))]
  return [
    ...missing.map(id => say(id, 'the batch asks for a reading of it')),
    ...extra.map(id => say(id, 'it is not of this batch')),
    ...twice.map(id => say(id, 'it is read twice')),
  ]
}

export const UNCITED = 'it cites a call that is not of this examination'

/** The readings as the goal keeps them. One that cites a call which is not of the examination cannot be told. */
export function handedOf(
  readings: readonly Submitted[],
  real: readonly string[],
): Readonly<Partial<Record<CriterionId, Handed>>> {
  const known = new Set(real)
  const kept = readings.map(({ criterion, value, refs, note }) => {
    const cited = refs.every(ref => known.has(ref))
    const reading: Handed = cited
      ? { value, note, refs }
      : { value: 'cannot-tell', note: UNCITED, refs: [] }
    return [criterion, reading] as const
  })
  return Object.fromEntries(kept)
}

export function submissionText(readings: readonly Submitted[]): string {
  const sorted = readings.toSorted((a, b) => a.criterion.localeCompare(b.criterion))
  return JSON.stringify(
    sorted.map(({ criterion, value, refs, note }) => [criterion, value, refs, note]),
  )
}

export function writtenSince(calls: readonly ObservedCall[], last: string): readonly string[] {
  const after = calls.slice(calls.findIndex(call => call.ref === last) + 1)
  return [...new Set(after.flatMap(call => (call.writes && call.path !== null ? [call.path] : [])))]
}

export function briefFor(
  record: GoalRecord,
  batch: Batch,
  seen: Readonly<{ where: string | null; calls: readonly ObservedCall[] }>,
): string {
  const changed = writtenSince(seen.calls, record.examination.submitted?.key.written ?? '')
  const { generation } = record.state
  return renderBrief(record.body, batch, { generation, where: seen.where, changed })
}

export type BriefFacts = Readonly<{
  generation: number
  where: string | null
  changed: readonly string[]
}>

/** The brief of a batch: each of its criteria as the confirmed body has it, where the work is, and what was written since the last batch. Nothing the working agent said is in it. */
export function renderBrief(body: GoalBody, batch: Batch, facts: BriefFacts): string {
  const texts = entryTexts(body).criteria
  const asked = body.criteria.flatMap((entry, at) =>
    batch.criteria.includes(entry.id) && batch.ran[entry.id] === undefined ? [texts[at]] : [],
  )
  const changed = facts.changed.length === 0 ? 'nothing' : facts.changed.join(', ')
  return [
    `Batch: ${batchRequest(facts.generation, batch.key)}`,
    'Examine each of these criteria yourself and hand in one reading for each with Goal submit, naming this batch.',
    asked.join('\n'),
    facts.where === null ? null : `Where the work is: ${facts.where}`,
    `Written since the last batch: ${changed}`,
  ]
    .filter(line => line !== null)
    .join('\n\n')
}

export type SubmitStep =
  | Readonly<{ kind: 'refused'; reason: 'differs' }>
  | Readonly<{ kind: 'refused'; reason: 'invalid'; issues: readonly BodyIssue[] }>
  | Readonly<{ kind: 'kept'; taken: 'repeat' | 'stale' }>
  | Readonly<{
      kind: 'next'
      taken: 'counted' | 'stale'
      record: GoalRecord
      told: Extract<EvidenceStep, { kind: 'next' }>['told']
    }>

/** The readings of a batch handed in by the examining side of this goal, row by row of the table in the specification. It writes readings; the state follows from the verdict table. */
export function submit(
  record: GoalRecord,
  input: Readonly<{
    generation: number
    key: BatchKey
    readings: readonly Submitted[]
    digest: string
    real: readonly string[]
    written: string
    running: boolean
  }>,
): SubmitStep {
  const { key, digest, written, running } = input
  if (input.generation !== record.state.generation) return { kind: 'kept', taken: 'stale' }
  const before = submissionOf(record.examination, key, digest)
  if (before === 'repeat') return { kind: 'kept', taken: 'repeat' }
  if (before === 'differs') return { kind: 'refused', reason: 'differs' }
  const { batch } = record.examination
  if (batch === null || !sameKey(batch.key, key)) return { kind: 'kept', taken: 'stale' }
  const rest = batch.criteria.filter(id => batch.ran[id] === undefined)
  const issues = submissionIssues({ ...batch, criteria: rest }, input.readings)
  if (issues.length > 0) return { kind: 'refused', reason: 'invalid', issues }
  const answers = handedOf(input.readings, input.real)
  const step = evidence(record, { key, written, running, answers, digest })
  if (step.kind === 'dropped') return { kind: 'kept', taken: 'stale' }
  const current = sameKey(key, { revision: record.state.revision, written })
  return {
    kind: 'next',
    taken: current ? 'counted' : 'stale',
    record: step.record,
    told: step.told,
  }
}
