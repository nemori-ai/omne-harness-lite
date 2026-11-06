import { afterAll, beforeAll, expect, it } from 'vitest'
import { inspectRelations, immutableDecisions } from '../verification/relations.ts'
import { database, legacyCopy } from './legacy-fixture.ts'
import { openWorld } from './world.ts'

let db: ReturnType<typeof database>
beforeAll(async () => {
  const { root } = legacyCopy(),
    world = await openWorld({ root })
  await world.close()
  db = database(root)
  db.exec('PRAGMA foreign_keys=ON')
})
afterAll(() => db?.close())
it('satisfies independently calculated relational sets after upgrading all legacy states', () => {
  expect(inspectRelations(db)).toEqual([])
})
const corruptions = [
  {
    name: 'missing pool bucket',
    invariant: 'PoolExact',
    sql: 'DELETE FROM hi_pool_request_buckets_v2 WHERE (tenant_ref,request_sequence,bucket,actor_ref) IN (SELECT tenant_ref,request_sequence,bucket,actor_ref FROM hi_pool_request_buckets_v2 LIMIT 1)',
  },
  {
    name: 'retained empty pool bucket',
    invariant: 'PoolExact',
    sql: "INSERT INTO hi_pool_request_buckets_v2 SELECT tenant_ref,request_sequence,'decided-superseded',actor_ref FROM hi_request_readers_v2 LIMIT 1",
  },
  {
    name: 'wrong actor bucket',
    invariant: 'PoolExact',
    sql: "INSERT INTO hi_request_readers_v2 SELECT tenant_ref,sequence,'\"wrong-actor\"' FROM hi_requests_v2 LIMIT 1; INSERT INTO hi_pool_request_buckets_v2 SELECT tenant_ref,request_sequence,'invalidated',actor_ref FROM hi_request_readers_v2 WHERE actor_ref='\"wrong-actor\"'",
  },
  {
    name: 'missing pending decision',
    invariant: 'PendingExact',
    sql: 'DELETE FROM hi_wait_pending_v2 WHERE inbox_sequence=(SELECT min(inbox_sequence) FROM hi_wait_pending_v2)',
  },
  {
    name: 'receipt inserted without deleting pending',
    invariant: 'PendingExact',
    sql: 'INSERT INTO hi_wait_pending_v2 SELECT i.tenant_ref,i.wait_key,i.card_ordinal,p.owner_actor,p.destination,i.sequence FROM hi_wait_inbox_v2 i JOIN hi_wait_receipts_v2 r USING(tenant_ref,wait_key,card_ordinal) JOIN hi_wait_preparations_v2 p USING(tenant_ref,wait_key) LIMIT 1',
  },
  {
    name: 'wrong pending destination',
    invariant: 'PendingExact',
    sql: 'UPDATE hi_wait_pending_v2 SET destination=\'"wrong-destination"\'',
  },
  {
    name: 'wrong pending inbox sequence',
    invariant: 'PendingExact',
    sql: 'UPDATE hi_wait_pending_v2 SET inbox_sequence=(SELECT min(i.sequence) FROM hi_wait_inbox_v2 i JOIN hi_wait_receipts_v2 r USING(tenant_ref,wait_key,card_ordinal)) WHERE inbox_sequence=(SELECT max(inbox_sequence) FROM hi_wait_pending_v2)',
  },
  {
    name: 'duplicate receipt count increment',
    invariant: 'ReceiptCountExact',
    sql: 'UPDATE hi_wait_controls_v2 SET receipt_count=receipt_count+1 WHERE receipt_count=1',
  },
  {
    name: 'partial batch declared ready',
    invariant: 'ReceiptCountExact',
    sql: "UPDATE hi_wait_controls_v2 SET checkpoint='resume-ready' WHERE receipt_count=1 AND lifecycle='live'",
  },
  {
    name: 'receiver generation behind a durable receipt',
    invariant: 'ReceiverFence',
    sql: "UPDATE hi_wait_receipts_v2 SET receiver_generation='999999999999999999999999999999999'",
  },
  {
    name: 'changed original answer',
    invariant: 'DecisionInboxExact',
    sql: "UPDATE hi_decisions_v2 SET reply_text='\"altered answer\"' WHERE reply_kind='text'",
  },
  {
    name: 'different active card identity',
    invariant: 'JointRegistration',
    sql: 'UPDATE hi_wait_cards_v2 SET card_id=\'"different-card"\' WHERE card_ordinal=0',
  },
  {
    name: 'missing decided state',
    invariant: 'DecisionStateExact',
    sql: "UPDATE hi_card_states_v2 SET state='pending',delivery=NULL,delivery_receipt_ref=NULL WHERE state='decided'",
  },
] as const
for (const { name, invariant, sql } of corruptions)
  it(`detects ${name} with ${invariant}`, () => {
    db.exec('SAVEPOINT negative_control')
    try {
      db.exec(sql)
      expect(inspectRelations(db)).toContain(invariant)
    } finally {
      db.exec('ROLLBACK TO negative_control; RELEASE negative_control')
    }
  })
it('detects rewriting both copies of an immutable decision across commit boundaries', () => {
  const before = immutableDecisions(db)
  db.exec('SAVEPOINT negative_control')
  try {
    db.exec(
      "UPDATE hi_decisions_v2 SET reply_text='\"changed\"' WHERE reply_kind='text'; UPDATE hi_wait_inbox_v2 SET reply_text='\"changed\"' WHERE reply_kind='text'",
    )
    expect(inspectRelations(db)).toEqual([])
    expect(immutableDecisions(db)).not.toEqual(before)
  } finally {
    db.exec('ROLLBACK TO negative_control; RELEASE negative_control')
  }
})
const constraintFailures = [
  {
    name: 'duplicate question ordinal',
    sql: 'INSERT INTO hi_questions_v2 SELECT * FROM hi_questions_v2 LIMIT 1',
  },
  {
    name: 'duplicate question identity',
    sql: 'UPDATE hi_questions_v2 SET card_id=\'"first"\' WHERE card_ordinal=1',
  },
  {
    name: 'second decision for a card',
    sql: 'INSERT INTO hi_decisions_v2 SELECT * FROM hi_decisions_v2 LIMIT 1',
  },
  {
    name: 'second inbox for a card',
    sql: 'INSERT INTO hi_wait_inbox_v2 SELECT NULL,tenant_ref,wait_key,card_ordinal,decision_id,submission_actor,submission_operation_id,reply_kind,option_id,reply_text,basis_ref,commit_receipt FROM hi_wait_inbox_v2 LIMIT 1',
  },
  {
    name: 'second receipt for a card',
    sql: 'INSERT INTO hi_wait_receipts_v2 SELECT * FROM hi_wait_receipts_v2 LIMIT 1',
  },
  {
    name: 'cross tenant question parent',
    sql: 'UPDATE hi_questions_v2 SET tenant_ref=\'"other-tenant"\'',
  },
  {
    name: 'pending card with delivery',
    sql: "UPDATE hi_card_states_v2 SET delivery='pending' WHERE state='pending'",
  },
  { name: 'noncanonical revision', sql: "UPDATE hi_card_states_v2 SET revision='01'" },
  {
    name: 'text reply with option',
    sql: "UPDATE hi_decisions_v2 SET option_id='\"yes\"' WHERE reply_kind='text'",
  },
  { name: 'out of range ordinal', sql: 'UPDATE hi_questions_v2 SET card_ordinal=64' },
  {
    name: 'terminal declared ready',
    sql: "UPDATE hi_wait_controls_v2 SET checkpoint='resume-ready' WHERE lifecycle='terminal'",
  },
] as const
for (const { name, sql } of constraintFailures)
  it(`rejects ${name} at the SQLite boundary`, () => {
    db.exec('SAVEPOINT constraint_control')
    try {
      expect(() => db.exec(sql)).toThrow(/constraint failed/)
    } finally {
      db.exec('ROLLBACK TO constraint_control; RELEASE constraint_control')
    }
  })
