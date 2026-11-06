import { stringCell, readStringCell } from './string-cell.ts'
import { z } from 'zod'
import {
  ConsumerReceiptSchema,
  HitlIdentifierSchema,
  DecisionRefSchema,
  RequestRefSchema,
  type WaitRef,
} from '@omne-harness/human-intervention'
import type { ReadPort, SqlCell } from '@omne-harness/sql-contract/worker'
import { digest, equal } from './encoding.ts'
import { WaitControlSchema, type WaitControl } from './wait-schema.ts'
import { countSchema, decodeDecision } from './relational-values.ts'
import { InboxEntrySchema } from './independent-schema.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'

export function waitKey(tenant: string, wait: WaitRef) {
  return digest([tenant, wait])
}
export function readWait(
  port: ReadPort,
  tenant: string,
  wait: WaitRef,
  actor?: string,
): WaitControl | undefined {
  const row = port.execute(
    `SELECT p.wait_owner,p.wait_id,p.incarnation,p.destination,p.owner_actor,p.preparation_ref,
 p.preparation_digest,p.registration_digest,p.registration_actor,p.registration_operation_id,p.origin_ref,p.position_ref,p.adoption_ref,
 c.lifecycle,c.terminal_evidence_ref,c.receiver_kind,c.receiver_generation,c.instance_id,c.implementation_ref,c.receipt_count,c.checkpoint
 FROM hi_wait_preparations_v2 p JOIN hi_wait_controls_v2 c USING(tenant_ref,wait_key)
 WHERE p.tenant_ref=? AND p.wait_key=? AND (? IS NULL OR EXISTS(SELECT 1 FROM hi_wait_audience_v2 a WHERE a.tenant_ref=p.tenant_ref AND a.wait_key=p.wait_key AND a.actor_ref=?)) LIMIT 1`,
    [
      stringCell(tenant),
      waitKey(tenant, wait),
      actor === undefined ? null : stringCell(actor),
      actor === undefined ? null : stringCell(actor),
    ],
  ).rows[0]
  if (!row) return undefined
  const storedWait = {
    owner: readStringCell(row[0]),
    waitId: readStringCell(row[1]),
    incarnation: readStringCell(row[2]),
    destination: readStringCell(row[3]),
  }
  if (!equal(storedWait, wait)) throw new TypeError('Wait address collision')
  return WaitControlSchema.parse({
    preparation: {
      tenantRef: tenant,
      waitRef: storedWait,
      ownerActor: readStringCell(row[4]),
      preparationRef: readStringCell(row[5]),
      preparationDigest: row[6],
      registrationDigest: row[7],
      registrationOperation: {
        tenantRef: tenant,
        actorRef: readStringCell(row[8]),
        operationId: readStringCell(row[9]),
      },
      origin: {
        kind: 'independent',
        originRef: readStringCell(row[10]),
        wait: storedWait,
        positionRef: readStringCell(row[11]),
        adoptionRef: readStringCell(row[12]),
      },
    },
    lifecycle:
      row[13] === 'live'
        ? { kind: 'live' }
        : { kind: row[13], evidenceRef: readStringCell(row[14]) },
    receiver:
      row[15] === 'unbound'
        ? { kind: 'unbound', generation: row[16] }
        : {
            kind: row[15],
            generation: row[16],
            instanceId: readStringCell(row[17]),
            implementationRef: readStringCell(row[18]),
          },
    receiptCount: countSchema.parse(row[19]),
    checkpoint: row[20],
  })
}
export function readWaitAudience(port: ReadPort, state: WaitControl) {
  const p = state.preparation
  return port
    .execute(
      'SELECT actor_ref,can_respond FROM hi_wait_audience_v2 WHERE tenant_ref=? AND wait_key=? ORDER BY actor_ref LIMIT 64',
      [stringCell(p.tenantRef), waitKey(p.tenantRef, p.waitRef)],
    )
    .rows.map(row => ({
      actorRef: HitlIdentifierSchema.parse(readStringCell(row[0])),
      canRespond: z.union([z.literal(0n), z.literal(1n)]).parse(row[1]) === 1n,
    }))
}
export function canReadWait(
  port: ReadPort,
  tenant: string,
  wait: WaitRef,
  actor: string,
  respond = false,
) {
  return port
    .execute(
      `SELECT can_respond FROM hi_wait_audience_v2 WHERE tenant_ref=? AND wait_key=? AND actor_ref=? LIMIT 1`,
      [stringCell(tenant), waitKey(tenant, wait), stringCell(actor)],
    )
    .rows.some(row => !respond || row[0] === 1n)
}
export function compatibleWait(port: ReadPort, state: WaitControl, implementation: string) {
  const p = state.preparation
  return (
    port.execute(
      'SELECT 1 FROM hi_wait_implementations_v2 WHERE tenant_ref=? AND wait_key=? AND implementation_ref=? LIMIT 1',
      [stringCell(p.tenantRef), waitKey(p.tenantRef, p.waitRef), stringCell(implementation)],
    ).rows.length !== 0
  )
}
export function readActiveHeader(port: ReadPort, tenant: string, wait: WaitRef) {
  const row = port.execute(
    'SELECT request_id,card_count FROM hi_wait_active_v2 WHERE tenant_ref=? AND wait_key=? LIMIT 1',
    [stringCell(tenant), waitKey(tenant, wait)],
  ).rows[0]
  return row
    ? {
        requestRef: RequestRefSchema.parse({
          tenantRef: tenant,
          requestId: readStringCell(row[0]),
        }),
        cardCount: countSchema.parse(row[1]),
      }
    : undefined
}
const refColumns =
  'a.request_id,c.card_id,i.decision_id,i.submission_actor,i.submission_operation_id'
const inboxJoin = `FROM hi_wait_inbox_v2 i JOIN hi_wait_active_v2 a USING(tenant_ref,wait_key)
 JOIN hi_wait_cards_v2 c USING(tenant_ref,wait_key,card_ordinal)`
function inboxRef(tenant: string, row: readonly SqlCell[]) {
  return DecisionRefSchema.parse({
    card: {
      request: { tenantRef: tenant, requestId: readStringCell(row[0]) },
      cardId: readStringCell(row[1]),
    },
    decisionId: readStringCell(row[2]),
    submission: {
      tenantRef: tenant,
      actorRef: readStringCell(row[3]),
      operationId: readStringCell(row[4]),
    },
  })
}
export function readInboxIdentity(port: ReadPort, tenant: string, wait: WaitRef, cardId: string) {
  const row = port.execute(
    `SELECT ${refColumns},i.card_ordinal ${inboxJoin}
 WHERE c.tenant_ref=? AND c.wait_key=? AND c.card_id=? LIMIT 1`,
    [stringCell(tenant), waitKey(tenant, wait), stringCell(cardId)],
  ).rows[0]
  return row ? { ref: inboxRef(tenant, row), ordinal: countSchema.parse(row[5]) } : undefined
}
function receipt(tenant: string, wait: WaitRef, row: readonly SqlCell[]) {
  return ConsumerReceiptSchema.parse({
    decision: inboxRef(tenant, row),
    wait,
    consumeOperationId: readStringCell(row[5]),
    receiverGeneration: row[6],
    outcome: row[7],
    evidenceRef: readStringCell(row[8]),
  })
}
const receiptColumns = `${refColumns},r.consume_operation_id,r.receiver_generation,r.outcome,r.evidence_ref`
const receiptJoin = `${inboxJoin} JOIN hi_wait_receipts_v2 r USING(tenant_ref,wait_key,card_ordinal)`
export function readReceipt(port: ReadPort, tenant: string, wait: WaitRef, cardId: string) {
  const row = port.execute(
    `SELECT ${receiptColumns} ${receiptJoin}
 WHERE c.tenant_ref=? AND c.wait_key=? AND c.card_id=? LIMIT 1`,
    [stringCell(tenant), waitKey(tenant, wait), stringCell(cardId)],
  ).rows[0]
  return row ? receipt(tenant, wait, row) : undefined
}
export function readReceipts(port: ReadPort, tenant: string, wait: WaitRef) {
  return port
    .execute(
      `SELECT ${receiptColumns} ${receiptJoin}
 WHERE r.tenant_ref=? AND r.wait_key=? ORDER BY r.consume_ordinal LIMIT 64`,
      [stringCell(tenant), waitKey(tenant, wait)],
    )
    .rows.map(row => receipt(tenant, wait, row))
}
export function readInboxEntry(port: ReadPort, tenant: string, sequence: string) {
  const row = port.execute(
    `SELECT i.wait_key,i.card_ordinal,a.request_id,c.card_id,i.decision_id,i.submission_actor,i.submission_operation_id,
 i.reply_kind,i.option_id,i.reply_text,i.basis_ref,i.commit_receipt,
 p.wait_owner,p.wait_id,p.incarnation,p.destination,p.position_ref,p.adoption_ref ${inboxJoin}
 JOIN hi_wait_preparations_v2 p USING(tenant_ref,wait_key) WHERE i.tenant_ref=? AND i.sequence=? LIMIT 1`,
    [stringCell(tenant), BigInt(sequence)],
  ).rows[0]
  if (!row) throw new TypeError('Inbox directory has no decision')
  const request = RequestRefSchema.parse({ tenantRef: tenant, requestId: readStringCell(row[2]) })
  return {
    key: z.string().parse(row[0]),
    ordinal: countSchema.parse(row[1]),
    entry: InboxEntrySchema.parse({
      decision: decodeDecision(request, readStringCell(row[3]), row.slice(4, 12)),
      wait: {
        owner: readStringCell(row[12]),
        waitId: readStringCell(row[13]),
        incarnation: readStringCell(row[14]),
        destination: readStringCell(row[15]),
      },
      positionRef: readStringCell(row[16]),
      adoptionRef: readStringCell(row[17]),
    }),
  }
}
export function readInboxKeys(
  port: ReadPort,
  tenant: string,
  wait: WaitRef,
  offset: number,
  limit: number,
) {
  return port
    .execute(
      'SELECT CAST(sequence AS TEXT),card_ordinal FROM hi_wait_inbox_v2 INDEXED BY hi_wait_inbox_order_v2 WHERE tenant_ref=? AND wait_key=? ORDER BY sequence LIMIT ? OFFSET ?',
      [stringCell(tenant), waitKey(tenant, wait), limit, offset],
    )
    .rows.map(row => ({
      sequence: SqlSequenceSchema.parse(row[0]),
      ordinal: countSchema.parse(row[1]),
    }))
}
