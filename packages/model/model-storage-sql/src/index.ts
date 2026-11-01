// The Model records over the SQL storage contract. The root exports the durable ModelCommands
// (`createSqlModelCommands`: the shared commands core over the SQL storage of this member), the
// table definitions and the migration, the stored call document with its row parse, and the
// `ModelCommandStorage` with its construction checks. The types of the storage port belong to
// `@omne-harness/model/commands`; they are re-exported here unchanged, not copied. The send
// coordinator and the static materials with their digests are later slices. Imports no Cordis.
export {
  createSqlModelCommands,
  type SqlModelCommands,
  type SqlModelCommandsOptions,
} from './commands.ts'
export {
  MODEL_WRITE_METHODS,
  type Binding,
  type BindingBase,
  type CallDocument,
  type CommandWrite,
  type DispatchDocument,
  type ModelCommandStorage,
  type ModelWriteMethod,
  type ReadRelation,
  type Receipt,
  type ResultPaging,
  type RunScope,
  type TenantDocuments,
} from '@omne-harness/model/commands'
export {
  MIGRATION,
  MODEL_PARTICIPANT,
  MODEL_TABLES,
  PROTOCOL,
  SCHEMA_STATEMENTS,
  TABLES,
  modelMigration,
  type Column,
  type ColumnKind,
  type Table,
} from './schema.ts'
export {
  encodeCallRow,
  encodeDispatchRow,
  encodeOperationRow,
  encodePartRow,
  nextVersion,
  parseCallRead,
  parseRow,
  snapshotHeadOf,
  type CallRead,
  type CallReadScope,
  type CallRecord,
  type CallRowScope,
  type PartBody,
  type PartKey,
  type Row,
  type RowFailure,
  type SnapshotHead,
  type StoredBinding,
  type StoredPart,
} from './documents.ts'
export {
  COMMAND_RESERVE_BYTES,
  DEFAULT_ATTEMPT_LIMIT,
  DEFAULT_UNRESOLVED_LIMIT,
  PART_MERGE_THRESHOLD,
  READ_RESERVE_BYTES,
  createSqlModelStorage,
  planParts,
  type ModelStorageLimits,
  type SqlModelStorage,
  type SqlModelStorageOptions,
} from './commit.ts'
export {
  CALL_HANDLER,
  CALL_READ_MAX_OUTPUT_BYTES,
  CALL_READ_MAX_ROWS,
  PENDING_HANDLER,
  PENDING_PAGE_MAX,
  callHandler,
  pendingHandler,
  type CallReadInput,
  type PendingPage,
} from './reads.ts'
