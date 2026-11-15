import { z } from 'zod'
import type { SubmitReply } from './commands.ts'
import {
  CardRefSchema,
  DecisionRefSchema,
  HitlIdentifierSchema,
  InvalidationReasonSchema,
  QuestionSchema,
  ReplySchema,
  RevisionSchema,
  nextRevision,
  sameCard,
  type InvalidationReason,
} from './values.ts'

export const DecisionSchema = z
  .strictObject({
    ref: DecisionRefSchema,
    reply: ReplySchema,
    basisRef: HitlIdentifierSchema,
    commitReceipt: HitlIdentifierSchema,
  })
  .readonly()
const cardFields = { ref: CardRefSchema, revision: RevisionSchema, question: QuestionSchema }
export const CardSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...cardFields, kind: z.literal('pending') }),
    z.strictObject({
      ...cardFields,
      kind: z.literal('decided'),
      decision: DecisionSchema,
      delivery: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('pending') }),
        z.strictObject({ kind: z.literal('accepted'), receiptRef: HitlIdentifierSchema }),
        z.strictObject({ kind: z.literal('superseded'), receiptRef: HitlIdentifierSchema }),
      ]),
    }),
    z.strictObject({
      ...cardFields,
      kind: z.literal('invalidated'),
      reason: InvalidationReasonSchema,
      terminalEvidenceRef: HitlIdentifierSchema,
    }),
  ])
  .refine(
    card =>
      card.ref.cardId === card.question.cardId &&
      (card.kind !== 'decided' ||
        (sameCard(card.ref, card.decision.ref.card) &&
          card.ref.request.tenantRef === card.decision.ref.submission.tenantRef)),
    { message: 'Card, question, decision and tenant identities must agree' },
  )
  .readonly()
export type Card = z.infer<typeof CardSchema>
export type Decision = z.infer<typeof DecisionSchema>
export type ReplyPlan =
  | Readonly<{
      kind: 'ready'
      cardRef: Card['ref']
      expectedRevision: Card['revision']
      nextRevision: Card['revision']
      reply: SubmitReply['reply']
    }>
  | Readonly<{ kind: 'already-decided'; decision: Decision }>
  | Readonly<{ kind: 'invalidated'; reason: InvalidationReason }>
  | Readonly<{ kind: 'conflict'; reason: 'card-mismatch' | 'revision-changed' }>
  | Readonly<{ kind: 'denied'; reason: 'tenant-mismatch' }>
  | Readonly<{ kind: 'invalid-input'; reason: 'unknown-option' }>
  | Readonly<{ kind: 'unavailable'; reason: 'wait-unavailable' }>

export function decideReply({
  card,
  command,
  wait,
}: Readonly<{
  card: Card
  command: SubmitReply
  wait: 'live' | 'terminal' | 'unavailable'
}>): ReplyPlan {
  if (card.ref.request.tenantRef !== command.operation.tenantRef)
    return { kind: 'denied', reason: 'tenant-mismatch' }
  if (!sameCard(card.ref, command.cardRef)) return { kind: 'conflict', reason: 'card-mismatch' }
  if (card.kind === 'decided') return { kind: 'already-decided', decision: card.decision }
  if (card.kind === 'invalidated') return { kind: 'invalidated', reason: card.reason }
  if (wait === 'unavailable') return { kind: 'unavailable', reason: 'wait-unavailable' }
  if (wait === 'terminal') return { kind: 'invalidated', reason: 'origin-terminal' }
  if (card.revision !== command.expectedRevision)
    return { kind: 'conflict', reason: 'revision-changed' }
  const reply = command.reply
  if (
    reply.kind === 'selection' &&
    !card.question.options.some(option => option.id === reply.optionId)
  ) {
    return { kind: 'invalid-input', reason: 'unknown-option' }
  }
  return {
    kind: 'ready',
    cardRef: card.ref,
    expectedRevision: card.revision,
    nextRevision: nextRevision(card.revision),
    reply,
  }
}

export function invalidateCard({
  card,
  reason,
  terminalEvidenceRef,
}: Readonly<{
  card: Card
  reason: InvalidationReason
  terminalEvidenceRef: string
}>): Card {
  if (card.kind !== 'pending') return card
  return {
    ...card,
    kind: 'invalidated',
    revision: nextRevision(card.revision),
    reason,
    terminalEvidenceRef,
  }
}
