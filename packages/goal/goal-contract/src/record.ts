import { z } from 'zod'
import { GoalBodySchema } from './body.ts'
import { ReadingsSchema } from './gap.ts'
import { GoalStateSchema, type GoalState } from './state.ts'

export const ProvenanceSchema = z.strictObject({
  revision: z.int().positive(),
  via: z.enum(['card', 'direct']),
  /** The person's own words this revision came from, when there were any. */
  words: z.string().nullable(),
  draftedBy: z.enum(['agent', 'person', 'creator']),
  confirmedBy: z.string().min(1),
  /** The card that was answered, or the operation of the direct caller: a repeat of it is recalled, not written twice. */
  operation: z.string().min(1),
  at: z.string().min(1),
})
/** Where one revision came from: who drafted it, who confirmed it, by which way in, and when. */
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
  wake: WakeSchema.nullable(),
})
/** Everything kept about one goal of a session: the facts live here and nowhere in the session. */
export type GoalRecord = z.infer<typeof GoalRecordSchema>

export const CardBaseSchema = z.strictObject({
  generation: z.int().nonnegative(),
  revision: z.int().nonnegative(),
  live: z.boolean(),
})
/** What a confirmation card was drafted against: the goal, its revision, and whether it was still live. */
export type CardBase = z.infer<typeof CardBaseSchema>

export function baseOf(state: GoalState): CardBase {
  if (state.status === 'none') return { generation: state.generation, revision: 0, live: false }
  return {
    generation: state.generation,
    revision: state.revision,
    live: state.status !== 'settled',
  }
}

/** A card as it was answered: who answered, what they chose, what it showed and what it was drafted against. */
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

/** Whether an answered card may write the revision now: answered by a member, for this content, on this base, once. */
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
