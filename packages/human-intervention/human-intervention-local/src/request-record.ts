import { z } from 'zod'
import {
  ActionBasisSchema,
  CardSchema,
  DecisionRefSchema,
  OriginSchema,
  RequestRefSchema,
  RevisionSchema,
  type RequestRef,
} from '@omne-harness/human-intervention'
import type { ReadPort, SqlCell } from '@omne-harness/sql-contract/worker'
import { RequestRecordSchema } from './request-schema.ts'
import { countSchema, decodeDecision, parseJson } from './relational-values.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'

const identityColumns = `CAST(r.sequence AS TEXT),r.tenant_ref,r.request_id,s.revision,
 r.origin_kind,r.origin_ref,r.wait_owner,r.wait_id,r.incarnation,r.destination,r.position_ref,r.adoption_ref,r.card_count`
const headerColumns = `${identityColumns},r.display_context,r.action_basis_json`
const requestJoin = `FROM hi_requests_v2 r JOIN hi_request_states_v2 s
 ON s.tenant_ref=r.tenant_ref AND s.request_sequence=r.sequence`
function identity(row: readonly SqlCell[]) {
  return {
    sequence: SqlSequenceSchema.parse(row[0]),
    ref: RequestRefSchema.parse({ tenantRef: row[1], requestId: row[2] }),
    revision: RevisionSchema.parse(row[3]),
    origin: OriginSchema.parse({
      kind: row[4],
      originRef: row[5],
      wait: { owner: row[6], waitId: row[7], incarnation: row[8], destination: row[9] },
      positionRef: row[10],
      adoptionRef: row[11],
    }),
    cardCount: countSchema.parse(row[12]),
  }
}
function header(row: readonly SqlCell[]) {
  return {
    ...identity(row),
    displayContext: z.string().parse(row[13]),
    ...(row[14] === null ? {} : { actionBasis: ActionBasisSchema.parse(parseJson(row[14])) }),
  }
}
export function readRequestIdentity(port: ReadPort, ref: RequestRef) {
  const row = port.execute(
    `SELECT ${identityColumns} ${requestJoin}
 WHERE r.tenant_ref=? AND r.request_id=? LIMIT 1`,
    [ref.tenantRef, ref.requestId],
  ).rows[0]
  return row ? identity(row) : undefined
}
export function readRequestHeader(port: ReadPort, ref: RequestRef, actor?: string) {
  const row =
    actor === undefined
      ? port.execute(
          `SELECT ${headerColumns} ${requestJoin} WHERE r.tenant_ref=? AND r.request_id=? LIMIT 1`,
          [ref.tenantRef, ref.requestId],
        ).rows[0]
      : port.execute(
          `SELECT ${headerColumns} ${requestJoin}
 JOIN hi_request_readers_v2 a ON a.tenant_ref=r.tenant_ref AND a.request_sequence=r.sequence
 WHERE r.tenant_ref=? AND r.request_id=? AND a.actor_ref=? LIMIT 1`,
          [ref.tenantRef, ref.requestId, actor],
        ).rows[0]
  return row ? header(row) : undefined
}
export function readRequestRoute(port: ReadPort, ref: RequestRef, actor: string) {
  const row = port.execute(
    `SELECT ${identityColumns} ${requestJoin}
 JOIN hi_request_readers_v2 a ON a.tenant_ref=r.tenant_ref AND a.request_sequence=r.sequence
 WHERE r.tenant_ref=? AND r.request_id=? AND a.actor_ref=? LIMIT 1`,
    [ref.tenantRef, ref.requestId, actor],
  ).rows[0]
  return row ? identity(row).origin.wait : undefined
}
export type RequestIdentity = NonNullable<ReturnType<typeof readRequestIdentity>>
const cardColumns = `q.card_id,q.card_ordinal,q.question_json,c.revision,c.state,c.delivery,c.delivery_receipt_ref,
 c.invalidation_reason,c.terminal_evidence_ref,d.decision_id,d.submission_actor,d.submission_operation_id,
 d.reply_kind,d.option_id,d.reply_text,d.basis_ref,d.commit_receipt`
const cardJoin = `FROM hi_questions_v2 q JOIN hi_card_states_v2 c USING(tenant_ref,request_sequence,card_ordinal)
 LEFT JOIN hi_decisions_v2 d USING(tenant_ref,request_sequence,card_ordinal)`
function card(ref: RequestRef, row: readonly SqlCell[]) {
  const cardId = z.string().parse(row[0])
  const base = {
    ref: { request: ref, cardId },
    question: parseJson(row[2]),
    revision: row[3],
    kind: row[4],
  }
  const state = row[4]
  if (state !== 'decided' && row[9] !== null) throw new TypeError('Undecided card has a decision')
  return {
    ordinal: countSchema.parse(row[1]),
    card: CardSchema.parse(
      state === 'decided'
        ? {
            ...base,
            decision: decodeDecision(ref, cardId, row.slice(9)),
            delivery:
              row[5] === 'pending' ? { kind: 'pending' } : { kind: row[5], receiptRef: row[6] },
          }
        : state === 'invalidated'
          ? { ...base, reason: row[7], terminalEvidenceRef: row[8] }
          : base,
    ),
  }
}
export function readCard(port: ReadPort, request: RequestIdentity, cardId: string) {
  const row = port.execute(
    `SELECT ${cardColumns} ${cardJoin}
 WHERE q.tenant_ref=? AND q.request_sequence=? AND q.card_id=? LIMIT 1`,
    [request.ref.tenantRef, BigInt(request.sequence), cardId],
  ).rows[0]
  return row ? card(request.ref, row) : undefined
}
export function readCardIdentity(port: ReadPort, request: RequestIdentity, cardId: string) {
  const row = port.execute(
    `SELECT q.card_ordinal,c.revision,c.state,c.delivery,c.delivery_receipt_ref,
 d.decision_id,d.submission_actor,d.submission_operation_id ${cardJoin}
 WHERE q.tenant_ref=? AND q.request_sequence=? AND q.card_id=? LIMIT 1`,
    [request.ref.tenantRef, BigInt(request.sequence), cardId],
  ).rows[0]
  if (!row) return undefined
  return {
    ordinal: countSchema.parse(row[0]),
    revision: RevisionSchema.parse(row[1]),
    state: z.enum(['pending', 'decided', 'invalidated']).parse(row[2]),
    delivery: z.enum(['pending', 'accepted', 'superseded']).nullable().parse(row[3]),
    decision:
      row[5] === null
        ? null
        : DecisionRefSchema.parse({
            card: { request: request.ref, cardId },
            decisionId: row[5],
            submission: { tenantRef: request.ref.tenantRef, actorRef: row[6], operationId: row[7] },
          }),
  }
}
export function readPendingCards(port: ReadPort, request: RequestIdentity) {
  return port
    .execute(
      `SELECT card_ordinal,revision FROM hi_card_states_v2 INDEXED BY hi_card_bucket_order_v2
 WHERE tenant_ref=? AND request_sequence=? AND bucket='pending' ORDER BY card_ordinal LIMIT 64`,
      [request.ref.tenantRef, BigInt(request.sequence)],
    )
    .rows.map(row => ({
      ordinal: countSchema.parse(row[0]),
      revision: RevisionSchema.parse(row[1]),
    }))
}
export function readRequest(port: ReadPort, ref: RequestRef, actor?: string) {
  const current = readRequestHeader(port, ref, actor)
  if (!current) return undefined
  const cards = port
    .execute(
      `SELECT ${cardColumns} ${cardJoin}
 WHERE q.tenant_ref=? AND q.request_sequence=? ORDER BY q.card_ordinal LIMIT 64`,
      [ref.tenantRef, BigInt(current.sequence)],
    )
    .rows.map((row, ordinal) => {
      const item = card(ref, row)
      if (item.ordinal !== ordinal) throw new TypeError('Non-contiguous request cards')
      return item.card
    })
  if (cards.length !== current.cardCount) throw new TypeError('Request cardinality mismatch')
  const { sequence: _, cardCount: __, ...record } = current
  return RequestRecordSchema.parse({ ...record, cards })
}
export function readPoolItem(port: ReadPort, tenant: string, sequence: string, ordinal: number) {
  const row = port.execute(
    `SELECT ${headerColumns},${cardColumns} ${requestJoin}
 JOIN hi_questions_v2 q ON q.tenant_ref=r.tenant_ref AND q.request_sequence=r.sequence
 JOIN hi_card_states_v2 c ON c.tenant_ref=q.tenant_ref AND c.request_sequence=q.request_sequence AND c.card_ordinal=q.card_ordinal
 LEFT JOIN hi_decisions_v2 d ON d.tenant_ref=q.tenant_ref AND d.request_sequence=q.request_sequence AND d.card_ordinal=q.card_ordinal
 WHERE r.tenant_ref=? AND r.sequence=? AND q.card_ordinal=? LIMIT 1`,
    [tenant, BigInt(sequence), ordinal],
  ).rows[0]
  if (!row) throw new TypeError('Pool directory has no card')
  const request = header(row)
  return {
    item: {
      card: card(request.ref, row.slice(15)).card,
      origin: request.origin,
      displayContext: request.displayContext,
    },
    cardCount: request.cardCount,
  }
}
