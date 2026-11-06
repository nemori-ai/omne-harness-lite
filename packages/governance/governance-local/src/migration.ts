import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const GOVERNANCE_OWNER = 'governance.activation'
export const GOVERNANCE_MIGRATION = { owner: GOVERNANCE_OWNER, id: 'governance-relations-1' }
export const GOVERNANCE_TABLES = [
  'gc_scope',
  'gc_definition',
  'gc_item',
  'gc_operation',
  'gc_contribution',
  'gc_member',
  'gc_member_target',
  'gc_selected_definition',
  'gc_selected_target',
]
const statements = [
  `CREATE TABLE gc_scope (
    scope_key TEXT NOT NULL PRIMARY KEY,
    tenant_ref TEXT NOT NULL,
    deployment_id TEXT NOT NULL,
    logical_service_id TEXT NOT NULL,
    visibility_kind TEXT NOT NULL CHECK (visibility_kind IN ('tenant','organization','public')),
    visibility_ref TEXT NOT NULL,
    current_epoch TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('isolated','open','closed')),
    declaration_revision INTEGER NOT NULL CHECK (declaration_revision BETWEEN 0 AND 9007199254740990),
    adoption_revision INTEGER NOT NULL CHECK (adoption_revision BETWEEN 0 AND 9007199254740990),
    collection_digest TEXT NOT NULL,
    adoption_digest TEXT,
    UNIQUE (tenant_ref, deployment_id, logical_service_id, visibility_kind, visibility_ref)
  ) WITHOUT ROWID, STRICT`,
  `CREATE TABLE gc_definition (
    definition_key TEXT NOT NULL PRIMARY KEY,
    owner_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    version TEXT NOT NULL,
    digest TEXT NOT NULL,
    origin_key TEXT NOT NULL,
    body_json TEXT NOT NULL,
    item_count INTEGER NOT NULL CHECK (item_count BETWEEN 0 AND 1024),
    UNIQUE (owner_id, definition_id, version)
  ) WITHOUT ROWID, STRICT`,
  'CREATE INDEX gc_definition_origin ON gc_definition(origin_key, definition_key)',
  `CREATE TABLE gc_item (
    definition_key TEXT NOT NULL,
    item_kind TEXT NOT NULL CHECK (item_kind IN ('setting','permission')),
    item_key TEXT NOT NULL,
    capability_id TEXT,
    enforcement_key TEXT,
    item_json TEXT NOT NULL,
    PRIMARY KEY (definition_key, item_kind, item_key),
    FOREIGN KEY (definition_key) REFERENCES gc_definition(definition_key),
    CHECK ((item_kind = 'setting' AND capability_id IS NULL AND enforcement_key IS NULL)
      OR (item_kind = 'permission' AND capability_id IS NOT NULL AND enforcement_key IS NOT NULL))
  ) WITHOUT ROWID, STRICT`,
  `CREATE INDEX gc_item_enforcement ON gc_item(definition_key, capability_id, enforcement_key, item_key)
    WHERE item_kind = 'permission'`,
  `CREATE TABLE gc_operation (
    scope_key TEXT NOT NULL,
    command_owner TEXT NOT NULL CHECK (command_owner IN ('contribute','withdraw','adopt','internal.bootstrap','internal.close','internal.capture')),
    principal_ref TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    request_json TEXT NOT NULL,
    accepted_epoch TEXT NOT NULL,
    sql_identity_json TEXT NOT NULL,
    execution_json TEXT,
    held_json TEXT,
    state TEXT NOT NULL CHECK (state IN ('accepted','submitted','committed','aborted')),
    result_json TEXT,
    PRIMARY KEY (scope_key, command_owner, principal_ref, operation_id),
    FOREIGN KEY (scope_key) REFERENCES gc_scope(scope_key),
    CHECK ((state IN ('committed','aborted') AND result_json IS NOT NULL)
      OR (state IN ('accepted','submitted') AND result_json IS NULL)),
    CHECK (state NOT IN ('submitted','committed') OR execution_json IS NOT NULL),
    CHECK (state <> 'accepted' OR execution_json IS NULL)
  ) WITHOUT ROWID, STRICT`,
  `CREATE INDEX gc_operation_pending ON gc_operation(scope_key, command_owner, principal_ref, operation_id)
    WHERE state IN ('accepted','submitted')`,
  `CREATE TABLE gc_contribution (
    scope_key TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    contributor_id TEXT NOT NULL,
    generation TEXT NOT NULL,
    epoch TEXT NOT NULL,
    registrar_ref TEXT NOT NULL,
    definition_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active','released')),
    registration_operation_id TEXT NOT NULL,
    PRIMARY KEY (scope_key, registration_id),
    UNIQUE (scope_key, registrar_ref, registration_operation_id),
    UNIQUE (scope_key, registration_id, definition_key, epoch),
    FOREIGN KEY (scope_key) REFERENCES gc_scope(scope_key),
    FOREIGN KEY (definition_key) REFERENCES gc_definition(definition_key)
  ) WITHOUT ROWID, STRICT`,
  'CREATE INDEX gc_contribution_current ON gc_contribution(scope_key, epoch, state, definition_key, registration_id)',
  `CREATE TABLE gc_member (
    scope_key TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    definition_key TEXT NOT NULL,
    epoch TEXT NOT NULL,
    PRIMARY KEY (scope_key, registration_id),
    UNIQUE (scope_key, registration_id, definition_key, epoch),
    FOREIGN KEY (scope_key, registration_id, definition_key, epoch)
      REFERENCES gc_contribution(scope_key, registration_id, definition_key, epoch)
  ) WITHOUT ROWID, STRICT`,
  'CREATE INDEX gc_member_support ON gc_member(scope_key, epoch, definition_key, registration_id)',
  `CREATE TABLE gc_member_target (
    scope_key TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    definition_key TEXT NOT NULL,
    epoch TEXT NOT NULL,
    target_key TEXT NOT NULL,
    target_json TEXT NOT NULL,
    PRIMARY KEY (scope_key, registration_id, target_key),
    FOREIGN KEY (scope_key, registration_id, definition_key, epoch)
      REFERENCES gc_member(scope_key, registration_id, definition_key, epoch)
  ) WITHOUT ROWID, STRICT`,
  'CREATE INDEX gc_member_target_support ON gc_member_target(scope_key, epoch, definition_key, target_key, registration_id)',
  `CREATE TABLE gc_selected_definition (
    scope_key TEXT NOT NULL,
    definition_key TEXT NOT NULL,
    epoch TEXT NOT NULL,
    PRIMARY KEY (scope_key, definition_key),
    UNIQUE (scope_key, definition_key, epoch),
    FOREIGN KEY (scope_key) REFERENCES gc_scope(scope_key),
    FOREIGN KEY (definition_key) REFERENCES gc_definition(definition_key)
  ) WITHOUT ROWID, STRICT`,
  `CREATE TABLE gc_selected_target (
    scope_key TEXT NOT NULL,
    definition_key TEXT NOT NULL,
    target_key TEXT NOT NULL,
    epoch TEXT NOT NULL,
    origin_key TEXT NOT NULL,
    target_json TEXT NOT NULL,
    PRIMARY KEY (scope_key, definition_key, target_key),
    FOREIGN KEY (scope_key, definition_key, epoch)
      REFERENCES gc_selected_definition(scope_key, definition_key, epoch)
  ) WITHOUT ROWID, STRICT`,
  'CREATE INDEX gc_selected_target_lookup ON gc_selected_target(scope_key, epoch, target_key, definition_key)',
]

export default {
  ...GOVERNANCE_MIGRATION,
  up(port) {
    for (const statement of statements) port.execute(statement, [])
  },
  verify(port) {
    for (const table of GOVERNANCE_TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
