import { readStringCell, stringCell } from './string-cell.ts'
import { nextRevision } from '@omne-harness/human-intervention'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical } from './encoding.ts'
import { changedOne, decisionColumns, insertedSequence } from './relational-values.ts'
import type { ReadAudience } from './read-audience.ts'
import type { RequestPlan, RequestRecord } from './request-schema.ts'
import { originCells } from './origin-cells.ts'

/** 写入辅助只需要执行 SQL 的能力，参与者端口即满足。 */
type SqlPort = Pick<ParticipantPort, 'execute'>

export function insertRequest(port: SqlPort, record: RequestRecord, audience: ReadAudience) {
  const { ref, origin } = record
  const inserted = port.execute(
    `INSERT INTO hi_requests_v2(tenant_ref,request_id,origin_kind,session_ref,run_ref,tool_call_ref,origin_ref,wait_owner,wait_id,incarnation,destination,position_ref,adoption_ref,display_context,action_basis_json,audience_digest,card_count)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      stringCell(ref.tenantRef),
      stringCell(ref.requestId),
      ...originCells(origin),
      stringCell(origin.originRef),
      stringCell(origin.wait.owner),
      stringCell(origin.wait.waitId),
      stringCell(origin.wait.incarnation),
      stringCell(origin.wait.destination),
      stringCell(origin.positionRef),
      stringCell(origin.adoptionRef),
      stringCell(record.displayContext),
      record.actionBasis ? canonical(record.actionBasis) : null,
      audience.audienceDigest,
      record.cards.length,
    ],
  )
  const sequence = insertedSequence(inserted)
  port.execute(
    'INSERT INTO hi_request_states_v2(tenant_ref,request_sequence,revision) VALUES (?,?,?)',
    [stringCell(ref.tenantRef), BigInt(sequence), record.revision],
  )
  const buckets = new Set<string>()
  for (const [ordinal, card] of record.cards.entries()) {
    const key = [stringCell(ref.tenantRef), BigInt(sequence), ordinal] as const
    port.execute(
      'INSERT INTO hi_questions_v2(tenant_ref,request_sequence,card_ordinal,card_id,question_json) VALUES (?,?,?,?,?)',
      [...key, stringCell(card.ref.cardId), canonical(card.question)],
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
          ? stringCell(card.delivery.receiptRef)
          : null,
        card.kind === 'invalidated' ? card.reason : null,
        card.kind === 'invalidated' ? stringCell(card.terminalEvidenceRef) : null,
      ],
    )
    if (card.kind === 'decided') insertDecision(port, key, card.decision)
    buckets.add(card.kind === 'decided' ? `decided-${card.delivery.kind}` : card.kind)
  }
  for (const actor of audience.readers)
    port.execute(
      'INSERT INTO hi_request_readers_v2(tenant_ref,request_sequence,actor_ref) VALUES (?,?,?)',
      [stringCell(ref.tenantRef), BigInt(sequence), stringCell(actor)],
    )
  for (const bucket of buckets)
    insertBucket(port, stringCell(ref.tenantRef), BigInt(sequence), bucket, requestScopes(origin))
  return sequence
}
type Scope = readonly [sessionKey: string, originKey: string]
/** 一个请求出现在哪些带过滤的池范围里，与 hi_pool_scoped_buckets_v2 的约定一致。 */
function requestScopes(
  origin: Readonly<{ kind: string; sessionRef?: string | undefined }>,
): Scope[] {
  const scopes: Scope[] = [['*', origin.kind]]
  if (origin.sessionRef !== undefined) {
    const session = stringCell(origin.sessionRef)
    scopes.push([session, '*'], [session, origin.kind])
  }
  return scopes
}
/** 请求进入一个状态桶：对每个读者写入无过滤目录及各过滤范围的目录。 */
function insertBucket(
  port: SqlPort,
  tenant: string,
  sequence: bigint,
  bucket: string,
  scopes: readonly Scope[],
) {
  port.execute(
    `INSERT INTO hi_pool_request_buckets_v2(tenant_ref,request_sequence,bucket,actor_ref)
 SELECT tenant_ref,request_sequence,?,actor_ref FROM hi_request_readers_v2 WHERE tenant_ref=? AND request_sequence=?`,
    [bucket, tenant, sequence],
  )
  for (const [sessionKey, originKey] of scopes)
    port.execute(
      `INSERT INTO hi_pool_scoped_buckets_v2(tenant_ref,request_sequence,bucket,actor_ref,session_key,origin_key)
 SELECT tenant_ref,request_sequence,?,actor_ref,?,? FROM hi_request_readers_v2 WHERE tenant_ref=? AND request_sequence=?`,
      [bucket, sessionKey, originKey, tenant, sequence],
    )
}
function storedScopes(port: SqlPort, tenant: string, sequence: bigint): Scope[] {
  const row = port.execute(
    'SELECT origin_kind,session_ref FROM hi_requests_v2 WHERE tenant_ref=? AND sequence=? LIMIT 1',
    [tenant, sequence],
  ).rows[0]
  if (!row) throw new TypeError('Bucket move without its request')
  const [kind, session] = row
  if (typeof kind !== 'string') throw new TypeError('Malformed origin kind')
  return requestScopes({
    kind,
    ...(session === null ? {} : { sessionRef: readStringCell(session) }),
  })
}
function insertDecision(
  port: SqlPort,
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
  port: SqlPort,
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
    for (const table of ['hi_pool_request_buckets_v2', 'hi_pool_scoped_buckets_v2'])
      port.execute(`DELETE FROM ${table} WHERE tenant_ref=? AND request_sequence=? AND bucket=?`, [
        tenant,
        sequence,
        previous,
      ])
  const hasNew =
    port.execute(
      'SELECT 1 FROM hi_pool_request_buckets_v2 WHERE tenant_ref=? AND request_sequence=? AND bucket=? LIMIT 1',
      [tenant, sequence, next],
    ).rows.length !== 0
  if (!hasNew) insertBucket(port, tenant, sequence, next, storedScopes(port, tenant, sequence))
}
export function applyRequestPlan(port: SqlPort, plan: RequestPlan) {
  const update = plan.update
  if (update.kind === 'none') return
  if (update.kind === 'register') {
    insertRequest(port, update.record, update.audience)
    return
  }
  const tenant = stringCell(update.ref.tenantRef),
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
          stringCell(update.receiptRef),
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
            stringCell(update.evidenceRef),
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
