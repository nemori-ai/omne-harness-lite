import type { DatabaseSync } from 'node:sqlite'

const expectedPool = `SELECT DISTINCT s.tenant_ref,s.request_sequence,s.bucket,r.actor_ref FROM hi_card_states_v2 s JOIN hi_request_readers_v2 r USING(tenant_ref,request_sequence)`
const actualPool =
  'SELECT tenant_ref,request_sequence,bucket,actor_ref FROM hi_pool_request_buckets_v2'
const expectedPending = `SELECT i.tenant_ref,i.wait_key,i.card_ordinal,p.owner_actor,p.destination,i.sequence FROM hi_wait_inbox_v2 i JOIN hi_wait_preparations_v2 p USING(tenant_ref,wait_key) LEFT JOIN hi_wait_receipts_v2 r USING(tenant_ref,wait_key,card_ordinal) WHERE r.card_ordinal IS NULL`
const actualPending =
  'SELECT tenant_ref,wait_key,card_ordinal,owner_actor,destination,inbox_sequence FROM hi_wait_pending_v2'
function differs(db: DatabaseSync, a: string, b: string) {
  return (
    db.prepare(`SELECT 1 FROM (${a} EXCEPT ${b}) LIMIT 1`).get() !== undefined ||
    db.prepare(`SELECT 1 FROM (${b} EXCEPT ${a}) LIMIT 1`).get() !== undefined
  )
}
const assertions = {
  ReceiptCountExact: `SELECT 1 FROM hi_wait_controls_v2 c LEFT JOIN hi_wait_active_v2 a USING(tenant_ref,wait_key)
 WHERE c.receipt_count!=(SELECT count(*) FROM hi_wait_receipts_v2 r WHERE r.tenant_ref=c.tenant_ref AND r.wait_key=c.wait_key)
 OR c.checkpoint!=CASE WHEN c.lifecycle='terminal' THEN 'terminal' WHEN a.card_count=c.receipt_count THEN 'resume-ready' ELSE 'waiting' END LIMIT 1`,
  CardsContinuous: `SELECT 1 FROM hi_requests_v2 r WHERE r.card_count!=(SELECT count(*) FROM hi_questions_v2 q WHERE q.tenant_ref=r.tenant_ref AND q.request_sequence=r.sequence)
 OR r.card_count!=(SELECT count(*) FROM hi_card_states_v2 c WHERE c.tenant_ref=r.tenant_ref AND c.request_sequence=r.sequence)
 OR r.card_count-1!=(SELECT max(card_ordinal) FROM hi_questions_v2 q WHERE q.tenant_ref=r.tenant_ref AND q.request_sequence=r.sequence)
 OR 0!=(SELECT min(card_ordinal) FROM hi_questions_v2 q WHERE q.tenant_ref=r.tenant_ref AND q.request_sequence=r.sequence) LIMIT 1`,
  DecisionStateExact: `SELECT 1 FROM hi_card_states_v2 s LEFT JOIN hi_decisions_v2 d USING(tenant_ref,request_sequence,card_ordinal) WHERE (s.state='decided')!=(d.decision_id IS NOT NULL) LIMIT 1`,
  ActiveCardsExact: `SELECT 1 FROM hi_wait_active_v2 a WHERE a.card_count!=(SELECT count(*) FROM hi_wait_cards_v2 c WHERE c.tenant_ref=a.tenant_ref AND c.wait_key=a.wait_key)
 OR a.card_count-1!=(SELECT max(card_ordinal) FROM hi_wait_cards_v2 c WHERE c.tenant_ref=a.tenant_ref AND c.wait_key=a.wait_key) LIMIT 1`,
  ReceiverFence: `SELECT 1 FROM hi_wait_receipts_v2 r JOIN hi_wait_controls_v2 c USING(tenant_ref,wait_key)
 WHERE r.receiver_generation='0' OR length(r.receiver_generation)>length(c.receiver_generation)
 OR (length(r.receiver_generation)=length(c.receiver_generation) AND r.receiver_generation>c.receiver_generation) LIMIT 1`,
  ReceiptIdentity: `SELECT 1 FROM hi_wait_receipts_v2 r JOIN hi_wait_inbox_v2 i USING(tenant_ref,wait_key,card_ordinal) WHERE r.decision_id!=i.decision_id LIMIT 1`,
}
const requestDecisions = `SELECT d.tenant_ref,r.request_id,q.card_id,d.decision_id,d.submission_actor,d.submission_operation_id,d.reply_kind,d.option_id,d.reply_text,d.basis_ref,d.commit_receipt FROM hi_decisions_v2 d JOIN hi_questions_v2 q USING(tenant_ref,request_sequence,card_ordinal) JOIN hi_requests_v2 r ON r.tenant_ref=d.tenant_ref AND r.sequence=d.request_sequence`
const waitDecisions = `SELECT i.tenant_ref,a.request_id,c.card_id,i.decision_id,i.submission_actor,i.submission_operation_id,i.reply_kind,i.option_id,i.reply_text,i.basis_ref,i.commit_receipt FROM hi_wait_inbox_v2 i JOIN hi_wait_active_v2 a USING(tenant_ref,wait_key) JOIN hi_wait_cards_v2 c USING(tenant_ref,wait_key,card_ordinal)`
const requestLinks = `SELECT r.tenant_ref,r.request_id,q.card_ordinal,q.card_id,r.wait_owner,r.wait_id,r.incarnation,r.destination,r.position_ref,r.adoption_ref FROM hi_requests_v2 r JOIN hi_questions_v2 q ON q.tenant_ref=r.tenant_ref AND q.request_sequence=r.sequence`
const waitLinks = `SELECT a.tenant_ref,a.request_id,c.card_ordinal,c.card_id,p.wait_owner,p.wait_id,p.incarnation,p.destination,p.position_ref,p.adoption_ref FROM hi_wait_active_v2 a JOIN hi_wait_cards_v2 c USING(tenant_ref,wait_key) JOIN hi_wait_preparations_v2 p USING(tenant_ref,wait_key)`
export function inspectRelations(db: DatabaseSync): string[] {
  const failures: string[] = []
  if (db.prepare('PRAGMA foreign_key_check').all().length) failures.push('ForeignKeys')
  if (differs(db, expectedPool, actualPool)) failures.push('PoolExact')
  if (differs(db, expectedPending, actualPending)) failures.push('PendingExact')
  if (differs(db, requestDecisions, waitDecisions)) failures.push('DecisionInboxExact')
  if (differs(db, requestLinks, waitLinks)) failures.push('JointRegistration')
  for (const [name, sql] of Object.entries(assertions))
    if (db.prepare(sql).get()) failures.push(name)
  return failures
}
export function immutableDecisions(db: DatabaseSync) {
  return db.prepare(`${requestDecisions} ORDER BY d.tenant_ref,r.request_id,q.card_id`).all()
}
