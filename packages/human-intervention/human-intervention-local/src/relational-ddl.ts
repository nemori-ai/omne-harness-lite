function stringCheck(column: string, maxBytes: number) {
  return `${column} IS NULL OR (json_valid(${column}) AND json_type(${column})='text' AND length(CAST(${column} AS BLOB)) BETWEEN 3 AND ${maxBytes})`
}

export const terminalDdl = [
  `CREATE TABLE hi_terminals_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  actor_ref TEXT NOT NULL CHECK(${stringCheck('actor_ref', 1538)}),
  operation_id TEXT NOT NULL CHECK(${stringCheck('operation_id', 1538)}),
  operation_key TEXT NOT NULL CHECK(length(operation_key)=64 AND operation_key NOT GLOB '*[^0-9a-f]*'),
  input_digest TEXT NOT NULL CHECK(length(input_digest)=64 AND input_digest NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN ('committed','aborted')),
  PRIMARY KEY(tenant_ref, actor_ref, operation_id),
  UNIQUE(operation_key)
) STRICT, WITHOUT ROWID;`,
] as const
export const terminalTables = ['hi_terminals_v2'] as const
export const waitDdl = [
  `CREATE TABLE hi_wait_preparations_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL CHECK(length(wait_key)=64 AND wait_key NOT GLOB '*[^0-9a-f]*'),
  wait_owner TEXT NOT NULL CHECK(${stringCheck('wait_owner', 1538)}),
  wait_id TEXT NOT NULL CHECK(${stringCheck('wait_id', 1538)}),
  incarnation TEXT NOT NULL CHECK(${stringCheck('incarnation', 1538)}),
  destination TEXT NOT NULL CHECK(${stringCheck('destination', 1538)}),
  owner_actor TEXT NOT NULL CHECK(${stringCheck('owner_actor', 1538)}),
  preparation_ref TEXT NOT NULL CHECK(${stringCheck('preparation_ref', 1538)}),
  preparation_digest TEXT NOT NULL CHECK(length(preparation_digest)=64),
  registration_digest TEXT NOT NULL CHECK(length(registration_digest)=64),
  registration_actor TEXT NOT NULL CHECK(${stringCheck('registration_actor', 1538)}),
  registration_operation_id TEXT NOT NULL CHECK(${stringCheck('registration_operation_id', 1538)}),
  origin_ref TEXT NOT NULL CHECK(${stringCheck('origin_ref', 1538)}),
  position_ref TEXT NOT NULL CHECK(${stringCheck('position_ref', 1538)}),
  adoption_ref TEXT NOT NULL CHECK(${stringCheck('adoption_ref', 1538)}),
  PRIMARY KEY(tenant_ref,wait_key),
  UNIQUE(tenant_ref,wait_owner,wait_id,incarnation,destination),
  CHECK(owner_actor=registration_actor)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_audience_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  actor_ref TEXT NOT NULL CHECK(${stringCheck('actor_ref', 1538)}),
  can_respond INTEGER NOT NULL CHECK(can_respond IN (0,1)),
  PRIMARY KEY(tenant_ref,wait_key,actor_ref),
  FOREIGN KEY(tenant_ref,wait_key) REFERENCES hi_wait_preparations_v2(tenant_ref,wait_key)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_implementations_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  implementation_ref TEXT NOT NULL CHECK(${stringCheck('implementation_ref', 1538)}),
  PRIMARY KEY(tenant_ref,wait_key,implementation_ref),
  FOREIGN KEY(tenant_ref,wait_key) REFERENCES hi_wait_preparations_v2(tenant_ref,wait_key)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_controls_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('live','terminal')),
  terminal_evidence_ref TEXT CHECK(${stringCheck('terminal_evidence_ref', 1538)}),
  receiver_kind TEXT NOT NULL CHECK(receiver_kind IN ('unbound','bound')),
  receiver_generation TEXT NOT NULL CHECK(receiver_generation='0' OR (length(receiver_generation)>0 AND substr(receiver_generation,1,1) BETWEEN '1' AND '9' AND receiver_generation NOT GLOB '*[^0-9]*')),
  instance_id TEXT CHECK(${stringCheck('instance_id', 1538)}),
  implementation_ref TEXT CHECK(${stringCheck('implementation_ref', 1538)}),
  receipt_count INTEGER NOT NULL CHECK(receipt_count BETWEEN 0 AND 64),
  checkpoint TEXT NOT NULL CHECK(checkpoint IN ('waiting','resume-ready','terminal')),
  PRIMARY KEY(tenant_ref,wait_key),
  FOREIGN KEY(tenant_ref,wait_key) REFERENCES hi_wait_preparations_v2(tenant_ref,wait_key),
  CHECK((lifecycle='live' AND terminal_evidence_ref IS NULL AND checkpoint IN ('waiting','resume-ready')) OR (lifecycle='terminal' AND terminal_evidence_ref IS NOT NULL AND checkpoint='terminal')),
  CHECK((receiver_kind='unbound' AND receiver_generation='0' AND instance_id IS NULL AND implementation_ref IS NULL) OR (receiver_kind='bound' AND receiver_generation<>'0' AND instance_id IS NOT NULL AND implementation_ref IS NOT NULL))
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_receipts_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  card_ordinal INTEGER NOT NULL CHECK(card_ordinal BETWEEN 0 AND 63),
  decision_id TEXT NOT NULL CHECK(${stringCheck('decision_id', 1538)}),
  consume_operation_id TEXT NOT NULL CHECK(${stringCheck('consume_operation_id', 1538)}),
  consume_ordinal INTEGER NOT NULL CHECK(consume_ordinal BETWEEN 0 AND 63),
  receiver_generation TEXT NOT NULL CHECK(receiver_generation='0' OR (length(receiver_generation)>0 AND substr(receiver_generation,1,1) BETWEEN '1' AND '9' AND receiver_generation NOT GLOB '*[^0-9]*')),
  outcome TEXT NOT NULL CHECK(outcome IN ('accepted','superseded')),
  evidence_ref TEXT NOT NULL CHECK(${stringCheck('evidence_ref', 1538)}),
  PRIMARY KEY(tenant_ref,wait_key,card_ordinal),
  UNIQUE(tenant_ref,wait_key,decision_id),
  UNIQUE(tenant_ref,wait_key,consume_ordinal),
  FOREIGN KEY(tenant_ref,wait_key) REFERENCES hi_wait_preparations_v2(tenant_ref,wait_key),
  FOREIGN KEY(tenant_ref,wait_key,card_ordinal) REFERENCES hi_wait_inbox_v2(tenant_ref,wait_key,card_ordinal)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_hitl_export_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_id TEXT NOT NULL CHECK(${stringCheck('request_id', 1538)}),
  export_json TEXT NOT NULL CHECK(json_valid(export_json)),
  PRIMARY KEY(tenant_ref,request_id)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_active_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK(${stringCheck('request_id', 1538)}),
  card_count INTEGER NOT NULL CHECK(card_count BETWEEN 1 AND 64),
  PRIMARY KEY(tenant_ref,wait_key),
  UNIQUE(tenant_ref,request_id),
  FOREIGN KEY(tenant_ref,wait_key) REFERENCES hi_wait_preparations_v2(tenant_ref,wait_key)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_cards_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  card_ordinal INTEGER NOT NULL CHECK(card_ordinal BETWEEN 0 AND 63),
  card_id TEXT NOT NULL CHECK(${stringCheck('card_id', 1538)}),
  PRIMARY KEY(tenant_ref,wait_key,card_ordinal),
  UNIQUE(tenant_ref,wait_key,card_id),
  FOREIGN KEY(tenant_ref,wait_key) REFERENCES hi_wait_active_v2(tenant_ref,wait_key)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_wait_inbox_v2 (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  card_ordinal INTEGER NOT NULL,
  decision_id TEXT NOT NULL CHECK(${stringCheck('decision_id', 1538)}),
  submission_actor TEXT NOT NULL CHECK(${stringCheck('submission_actor', 1538)}),
  submission_operation_id TEXT NOT NULL CHECK(${stringCheck('submission_operation_id', 1538)}),
  reply_kind TEXT NOT NULL CHECK(reply_kind IN ('selection','text','decline')),
  option_id TEXT CHECK(${stringCheck('option_id', 1538)}),
  reply_text TEXT CHECK(${stringCheck('reply_text', 49154)}),
  basis_ref TEXT NOT NULL CHECK(${stringCheck('basis_ref', 1538)}),
  commit_receipt TEXT NOT NULL CHECK(${stringCheck('commit_receipt', 1538)}),
  UNIQUE(tenant_ref,wait_key,card_ordinal),
  UNIQUE(tenant_ref,wait_key,decision_id),
  UNIQUE(tenant_ref,sequence),
  FOREIGN KEY(tenant_ref,wait_key,card_ordinal) REFERENCES hi_wait_cards_v2(tenant_ref,wait_key,card_ordinal),
  CHECK((reply_kind='selection' AND option_id IS NOT NULL AND reply_text IS NULL) OR (reply_kind='text' AND option_id IS NULL AND reply_text IS NOT NULL) OR (reply_kind='decline' AND option_id IS NULL AND reply_text IS NULL))
) STRICT;`,
  `CREATE INDEX hi_wait_inbox_order_v2 ON hi_wait_inbox_v2(tenant_ref,wait_key,sequence);`,
  `CREATE TABLE hi_wait_pending_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  wait_key TEXT NOT NULL,
  card_ordinal INTEGER NOT NULL,
  owner_actor TEXT NOT NULL CHECK(${stringCheck('owner_actor', 1538)}),
  destination TEXT NOT NULL CHECK(${stringCheck('destination', 1538)}),
  inbox_sequence INTEGER NOT NULL CHECK(inbox_sequence>0),
  PRIMARY KEY(tenant_ref,wait_key,card_ordinal),
  FOREIGN KEY(tenant_ref,wait_key,card_ordinal) REFERENCES hi_wait_inbox_v2(tenant_ref,wait_key,card_ordinal),
  FOREIGN KEY(tenant_ref,inbox_sequence) REFERENCES hi_wait_inbox_v2(tenant_ref,sequence)
) STRICT, WITHOUT ROWID;`,
  `CREATE UNIQUE INDEX hi_wait_pending_delivery_v2 ON hi_wait_pending_v2(tenant_ref,owner_actor,destination,inbox_sequence);`,
] as const
export const waitTables = [
  'hi_wait_preparations_v2',
  'hi_wait_audience_v2',
  'hi_wait_implementations_v2',
  'hi_wait_controls_v2',
  'hi_wait_receipts_v2',
  'hi_wait_hitl_export_v2',
  'hi_wait_active_v2',
  'hi_wait_cards_v2',
  'hi_wait_inbox_v2',
  'hi_wait_pending_v2',
] as const
export const requestDdl = [
  `CREATE TABLE hi_request_versions_v2 (
  tenant_ref TEXT PRIMARY KEY NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  revision TEXT NOT NULL CHECK(revision='0' OR (length(revision)>0 AND substr(revision,1,1) BETWEEN '1' AND '9' AND revision NOT GLOB '*[^0-9]*'))
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_requests_v2 (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_id TEXT NOT NULL CHECK(${stringCheck('request_id', 1538)}),
  origin_kind TEXT NOT NULL CHECK(origin_kind='independent'),
  origin_ref TEXT NOT NULL CHECK(${stringCheck('origin_ref', 1538)}),
  wait_owner TEXT NOT NULL CHECK(${stringCheck('wait_owner', 1538)}),
  wait_id TEXT NOT NULL CHECK(${stringCheck('wait_id', 1538)}),
  incarnation TEXT NOT NULL CHECK(${stringCheck('incarnation', 1538)}),
  destination TEXT NOT NULL CHECK(${stringCheck('destination', 1538)}),
  position_ref TEXT NOT NULL CHECK(${stringCheck('position_ref', 1538)}),
  adoption_ref TEXT NOT NULL CHECK(${stringCheck('adoption_ref', 1538)}),
  display_context TEXT NOT NULL CHECK(${stringCheck('display_context', 49154)}),
  action_basis_json TEXT CHECK(action_basis_json IS NULL OR json_valid(action_basis_json)),
  audience_digest TEXT NOT NULL CHECK(length(audience_digest)=64),
  card_count INTEGER NOT NULL CHECK(card_count BETWEEN 1 AND 64),
  UNIQUE(tenant_ref,request_id),
  UNIQUE(tenant_ref,sequence)
) STRICT;`,
  `CREATE TABLE hi_request_states_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_sequence INTEGER NOT NULL,
  revision TEXT NOT NULL CHECK(revision='0' OR (length(revision)>0 AND substr(revision,1,1) BETWEEN '1' AND '9' AND revision NOT GLOB '*[^0-9]*')),
  PRIMARY KEY(tenant_ref,request_sequence),
  FOREIGN KEY(tenant_ref,request_sequence) REFERENCES hi_requests_v2(tenant_ref,sequence)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_questions_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_sequence INTEGER NOT NULL,
  card_ordinal INTEGER NOT NULL CHECK(card_ordinal BETWEEN 0 AND 63),
  card_id TEXT NOT NULL CHECK(${stringCheck('card_id', 1538)}),
  question_json TEXT NOT NULL CHECK(json_valid(question_json) AND length(CAST(question_json AS BLOB))<=262144),
  PRIMARY KEY(tenant_ref,request_sequence,card_ordinal),
  UNIQUE(tenant_ref,request_sequence,card_id),
  FOREIGN KEY(tenant_ref,request_sequence) REFERENCES hi_requests_v2(tenant_ref,sequence)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_card_states_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_sequence INTEGER NOT NULL,
  card_ordinal INTEGER NOT NULL,
  revision TEXT NOT NULL CHECK(revision='0' OR (length(revision)>0 AND substr(revision,1,1) BETWEEN '1' AND '9' AND revision NOT GLOB '*[^0-9]*')),
  state TEXT NOT NULL CHECK(state IN ('pending','decided','invalidated')),
  delivery TEXT CHECK(delivery IS NULL OR delivery IN ('pending','accepted','superseded')),
  delivery_receipt_ref TEXT CHECK(${stringCheck('delivery_receipt_ref', 1538)}),
  bucket TEXT GENERATED ALWAYS AS (CASE WHEN state='decided' THEN 'decided-' || delivery ELSE state END) STORED,
  invalidation_reason TEXT CHECK(invalidation_reason IS NULL OR invalidation_reason IN ('cancelled','archived','origin-terminal','continuity-lost')),
  terminal_evidence_ref TEXT CHECK(${stringCheck('terminal_evidence_ref', 1538)}),
  PRIMARY KEY(tenant_ref,request_sequence,card_ordinal),
  FOREIGN KEY(tenant_ref,request_sequence,card_ordinal) REFERENCES hi_questions_v2(tenant_ref,request_sequence,card_ordinal),
  CHECK((state='pending' AND delivery IS NULL AND delivery_receipt_ref IS NULL AND invalidation_reason IS NULL AND terminal_evidence_ref IS NULL) OR (state='decided' AND delivery IS NOT NULL AND invalidation_reason IS NULL AND terminal_evidence_ref IS NULL AND ((delivery='pending' AND delivery_receipt_ref IS NULL) OR (delivery<>'pending' AND delivery_receipt_ref IS NOT NULL))) OR (state='invalidated' AND delivery IS NULL AND delivery_receipt_ref IS NULL AND invalidation_reason IS NOT NULL AND terminal_evidence_ref IS NOT NULL))
) STRICT, WITHOUT ROWID;`,
  `CREATE INDEX hi_card_bucket_order_v2 ON hi_card_states_v2(tenant_ref,request_sequence,bucket,card_ordinal);`,
  `CREATE TABLE hi_decisions_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_sequence INTEGER NOT NULL,
  card_ordinal INTEGER NOT NULL,
  decision_id TEXT NOT NULL CHECK(${stringCheck('decision_id', 1538)}),
  submission_actor TEXT NOT NULL CHECK(${stringCheck('submission_actor', 1538)}),
  submission_operation_id TEXT NOT NULL CHECK(${stringCheck('submission_operation_id', 1538)}),
  reply_kind TEXT NOT NULL CHECK(reply_kind IN ('selection','text','decline')),
  option_id TEXT CHECK(${stringCheck('option_id', 1538)}),
  reply_text TEXT CHECK(${stringCheck('reply_text', 49154)}),
  basis_ref TEXT NOT NULL CHECK(${stringCheck('basis_ref', 1538)}),
  commit_receipt TEXT NOT NULL CHECK(${stringCheck('commit_receipt', 1538)}),
  PRIMARY KEY(tenant_ref,request_sequence,card_ordinal),
  UNIQUE(tenant_ref,decision_id),
  FOREIGN KEY(tenant_ref,request_sequence,card_ordinal) REFERENCES hi_card_states_v2(tenant_ref,request_sequence,card_ordinal),
  CHECK((reply_kind='selection' AND option_id IS NOT NULL AND reply_text IS NULL) OR (reply_kind='text' AND option_id IS NULL AND reply_text IS NOT NULL) OR (reply_kind='decline' AND option_id IS NULL AND reply_text IS NULL))
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_request_readers_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_sequence INTEGER NOT NULL,
  actor_ref TEXT NOT NULL CHECK(${stringCheck('actor_ref', 1538)}),
  PRIMARY KEY(tenant_ref,request_sequence,actor_ref),
  FOREIGN KEY(tenant_ref,request_sequence) REFERENCES hi_requests_v2(tenant_ref,sequence)
) STRICT, WITHOUT ROWID;`,
  `CREATE TABLE hi_pool_request_buckets_v2 (
  tenant_ref TEXT NOT NULL CHECK(${stringCheck('tenant_ref', 1538)}),
  request_sequence INTEGER NOT NULL,
  bucket TEXT NOT NULL CHECK(bucket IN ('pending','invalidated','decided-pending','decided-accepted','decided-superseded')),
  actor_ref TEXT NOT NULL CHECK(${stringCheck('actor_ref', 1538)}),
  PRIMARY KEY(tenant_ref,request_sequence,bucket,actor_ref),
  FOREIGN KEY(tenant_ref,request_sequence,actor_ref) REFERENCES hi_request_readers_v2(tenant_ref,request_sequence,actor_ref)
) STRICT, WITHOUT ROWID;`,
  `CREATE INDEX hi_pool_actor_bucket_v2 ON hi_pool_request_buckets_v2(tenant_ref,actor_ref,bucket,request_sequence);`,
] as const
export const requestTables = [
  'hi_request_versions_v2',
  'hi_requests_v2',
  'hi_request_states_v2',
  'hi_questions_v2',
  'hi_card_states_v2',
  'hi_decisions_v2',
  'hi_request_readers_v2',
  'hi_pool_request_buckets_v2',
] as const
