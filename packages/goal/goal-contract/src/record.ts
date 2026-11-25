import { z } from 'zod'
import { GoalBodySchema } from './body.ts'
import { ReadingsSchema } from './gap.ts'
import { ProgressSchema } from './progress.ts'
import { GoalStateSchema, type GoalState } from './state.ts'

export const ProvenanceSchema = z.strictObject({
  revision: z.int().positive(),
  via: z.enum(['card', 'direct']),
  words: z.string().nullable(),
  draftedBy: z.enum(['agent', 'person', 'creator']),
  confirmedBy: z.string().min(1),
  /** The card that was answered, or the operation of the direct caller: a repeat of it is recalled, not written twice. */
  operation: z.string().min(1),
  at: z.string().min(1),
})
export type Provenance = z.infer<typeof ProvenanceSchema>

export const WakeSchema = z.strictObject({
  kind: z.enum(['start', 'resume']),
  request: z.string().min(1),
})
/** A reminder owed to the session: written with the change that owes it, cleared when it was handed over. */
export type Wake = z.infer<typeof WakeSchema>

export const GoalRecordSchema = z.strictObject({
  session: z.string().min(1),
  /** Counts every write of this session's goals: a write names the version it read. */
  version: z.int().positive(),
  state: GoalStateSchema,
  body: GoalBodySchema,
  history: z.array(ProvenanceSchema).min(1),
  readings: ReadingsSchema,
  progress: ProgressSchema,
  /** Where the history of the session stood when this goal was set: what the agent cites must come after it. */
  since: z.string().min(1),
  wake: WakeSchema.nullable(),
})
/** Everything kept about one goal of a session: the facts live here and nowhere in the session. */
export type GoalRecord = z.infer<typeof GoalRecordSchema>

export const CardBaseSchema = z.strictObject({
  generation: z.int().nonnegative(),
  revision: z.int().nonnegative(),
  live: z.boolean(),
})
export type CardBase = z.infer<typeof CardBaseSchema>

export function baseOf(state: GoalState): CardBase {
  if (state.status === 'none') return { generation: state.generation, revision: 0, live: false }
  return {
    generation: state.generation,
    revision: state.revision,
    live: state.status !== 'settled',
  }
}

export type AnsweredCard = Readonly<{
  card: string
  by: string
  byMember: boolean
  confirmed: boolean
  digest: string
  base: CardBase
}>
export type CardRefusal =
  | 'not-a-member'
  | 'not-confirmed'
  | 'already-used'
  | 'stale-base'
  | 'content-differs'

export function judgeCard(
  card: AnsweredCard,
  now: Readonly<{ digest: string; base: CardBase; used: boolean }>,
): CardRefusal | null {
  if (!card.byMember) return 'not-a-member'
  if (!card.confirmed) return 'not-confirmed'
  if (now.used) return 'already-used'
  const { base } = card
  if (
    base.generation !== now.base.generation ||
    base.revision !== now.base.revision ||
    base.live !== now.base.live
  )
    return 'stale-base'
  return card.digest === now.digest ? null : 'content-differs'
}

export const DROP_OPTION = 'drop'
const CONFIRM = /^confirm\/(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.([01])\/(sha256:[0-9a-f]{64})$/u

/** The confirm option of a card: its id carries what the card was drafted against and the digest of what it shows. */
export function confirmOptionId(base: CardBase, digest: string): string {
  const live = base.live ? '1' : '0'
  return `confirm/${String(base.generation)}.${String(base.revision)}.${live}/${digest}`
}

export function readConfirmOption(id: string): Readonly<{ base: CardBase; digest: string }> | null {
  const found = CONFIRM.exec(id)
  if (found === null) return null
  const [, generation, revision, live, digest] = found
  const base = { generation: Number(generation), revision: Number(revision), live: live === '1' }
  return { base, digest: String(digest) }
}
