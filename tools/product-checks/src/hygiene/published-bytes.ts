const MIGRATION = '已发布的迁移模块：迁移的校验和取自这份文件的字节，已有的库里存着它，注释删不得'

export const PUBLISHED_BYTES: ReadonlyMap<string, string> = new Map([
  ['packages/identity/identity-sql/src/worker/migration-governance.ts', MIGRATION],
  ['packages/identity/identity-sql/src/worker/migration.ts', MIGRATION],
  ['packages/model/model-storage-sql/src/schema.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/admission-attempt-migration.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/attempt-grant-migration.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/fact-blob-migration.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/fact-body-migration.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/preadmission-migration.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/session-list-migration.ts', MIGRATION],
  ['packages/session/session-storage-sql/src/worker/state-part-migration.ts', MIGRATION],
])
