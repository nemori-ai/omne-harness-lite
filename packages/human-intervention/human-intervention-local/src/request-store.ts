import { nextRevision } from '@omne-harness/human-intervention'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import { canonical } from './encoding.ts'
import { changedOne, decisionColumns, insertedSequence } from './relational-values.ts'
import type { ReadAudience } from './read-audience.ts'
import type { RequestPlan, RequestRecord } from './request-schema.ts'

export function insertRequest(
  port: MigrationPort,
  record: RequestRecord,
  audience: ReadAudience,
  preservedSequence?: string,
) {
  const { ref, origin } = record
  const inserted = port.execute(
    `INSERT INTO hi_requests_v2(sequence,tenant_ref,request_id,origin_kind,origin_ref,wait_owner,wait_id,incarnation,destination,position_ref,adoption_ref,display_context,action_basis_json,audience_digest,card_count)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      preservedSequence === undefined ? null : BigInt(preservedSequence),
      ref.tenantRef,
      ref.requestId,
      origin.kind,
      origin.originRef,
      origin.wait.owner,
      origin.wait.waitId,
      origin.wait.incarnation,
      origin.wait.destination,
      origin.positionRef,
      origin.adoptionRef,
      record.displayContext,
      record.actionBasis ? canonical(record.actionBasis) : null,
      audience.audienceDigest,
      record.cards.length,
    ],
  )
  const sequence = insertedSequence(inserted)
  port.execute(
    'INSERT INTO hi_request_states_v2(tenant_ref,request_sequence,revision) VALUES (?,?,?)',
    [ref.tenantRef, BigInt(sequence), record.revision],
  )
  const buckets = new Set<string>()
  for (const [ordinal, card] of record.cards.entries()) {
    const key = [ref.tenantRef, BigInt(sequence), ordinal] as const
    port.execute(
      'INSERT INTO hi_questions_v2(tenant_ref,request_sequence,card_ordinal,card_id,question_json) VALUES (?,?,?,?,?)',
      [...key, card.ref.cardId, canonical(card.question)],
    )
    port.execute(
      `INSERT INTO hi_card_states_v2(tenant_ref,request_sequence,card_ordinal,revision,state,delivery,delivery_receipt_ref,invalidation_reason,terminal_evidence_ref)
 VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        ...key,
        card.revision,
        card.kind,
        card.kind === 'decided' ? card.delivery.kind : null,
        card.kind === 'decided' && card.delivery.kind !== 'pending'
          ? card.delivery.receiptRef
          : null,
        card.kind === 'invalidated' ? card.reason : null,
        card.kind === 'invalidated' ? card.terminalEvidenceRef : null,
      ],
    )
    if (card.kind === 'decided') insertDecision(port, key, card.decision)
    buckets.add(card.kind === 'decided' ? `decided-${card.delivery.kind}` : card.kind)
  }
  for (const actor of audience.readers) {
    port.execute(
      'INSERT INTO hi_request_readers_v2(tenant_ref,request_sequence,actor_ref) VALUES (?,?,?)',
      [ref.tenantRef, BigInt(sequence), actor],
    )
    for (const bucket of buckets)
      port.execute(
        'INSERT INTO hi_pool_request_buckets_v2(tenant_ref,request_sequence,bucket,actor_ref) VALUES (?,?,?,?)',
        [ref.tenantRef, BigInt(sequence), bucket, actor],
      )
  }
  return sequence
}
function insertDecision(
  port: MigrationPort,
  key: readonly [string, bigint, number],
  decision: Parameters<typeof decisionColumns>[0],
) {
  port.execute(
    `INSERT INTO hi_decisions_v2(tenant_ref,request_sequence,card_ordinal,decision_id,submission_actor,submission_operation_id,reply_kind,option_id,reply_text,basis_ref,commit_receipt)
 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [...key, ...decisionColumns(decision)],
  )
}
function moveBuckets(
  port: MigrationPort,
  tenant: string,
  sequence: bigint,
  previous: string,
  next: string,
) {
  const hasOld =
    port.execute(
      'SELECT 1 FROM hi_card_states_v2 INDEXED BY hi_card_bucket_order_v2 WHERE tenant_ref=? AND request_sequence=? AND bucket=? LIMIT 1',
      [tenant, sequence, previous],
    ).rows.length !== 0
  if (!hasOld)
    port.execute(
      'DELETE FROM hi_pool_request_buckets_v2 WHERE tenant_ref=? AND request_sequence=? AND bucket=?',
      [tenant, sequence, previous],
    )
  const hasNew =
    port.execute(
      'SELECT 1 FROM hi_pool_request_buckets_v2 WHERE tenant_ref=? AND request_sequence=? AND bucket=? LIMIT 1',
      [tenant, sequence, next],
    ).rows.length !== 0
  if (!hasNew)
    port.execute(
      `INSERT INTO hi_pool_request_buckets_v2(tenant_ref,request_sequence,bucket,actor_ref)
 SELECT tenant_ref,request_sequence,?,actor_ref FROM hi_request_readers_v2 WHERE tenant_ref=? AND request_sequence=?`,
      [next, tenant, sequence],
    )
}
export function applyRequestPlan(port: MigrationPort, plan: RequestPlan) {
  const update = plan.update
  if (update.kind === 'none') return
  if (update.kind === 'register') {
    insertRequest(port, update.record, update.audience)
    return
  }
  const tenant = update.ref.tenantRef,
    sequence = BigInt(update.sequence)
  if (update.kind === 'decide') {
    if (plan.effect.kind !== 'deliver') throw new TypeError('Decision without custody effect')
    changedOne(
      port.execute(
        `UPDATE hi_card_states_v2 SET state='decided',revision=?,delivery='pending'
 WHERE tenant_ref=? AND request_sequence=? AND card_ordinal=? AND state='pending' AND revision=?`,
        [update.cardRevision, tenant, sequence, update.ordinal, update.expectedCardRevision],
      ),
    )
    insertDecision(port, [tenant, sequence, update.ordinal], plan.effect.decision)
    moveBuckets(port, tenant, sequence, 'pending', 'decided-pending')
  } else if (update.kind === 'acknowledge') {
    changedOne(
      port.execute(
        `UPDATE hi_card_states_v2 SET revision=?,delivery=?,delivery_receipt_ref=?
 WHERE tenant_ref=? AND request_sequence=? AND card_ordinal=? AND state='decided' AND delivery='pending' AND revision=?`,
        [
          nextRevision(update.expectedCardRevision),
          update.outcome,
          update.receiptRef,
          tenant,
          sequence,
          update.ordinal,
          update.expectedCardRevision,
        ],
      ),
    )
    moveBuckets(port, tenant, sequence, 'decided-pending', `decided-${update.outcome}`)
  } else {
    for (const card of update.cards)
      changedOne(
        port.execute(
          `UPDATE hi_card_states_v2 SET state='invalidated',revision=?,invalidation_reason=?,terminal_evidence_ref=?
 WHERE tenant_ref=? AND request_sequence=? AND card_ordinal=? AND state='pending' AND revision=?`,
          [
            nextRevision(card.revision),
            update.reason,
            update.evidenceRef,
            tenant,
            sequence,
            card.ordinal,
            card.revision,
          ],
        ),
      )
    moveBuckets(port, tenant, sequence, 'pending', 'invalidated')
  }
  changedOne(
    port.execute(
      'UPDATE hi_request_states_v2 SET revision=? WHERE tenant_ref=? AND request_sequence=? AND revision=?',
      [nextRevision(update.expectedRevision), tenant, sequence, update.expectedRevision],
    ),
  )
}
