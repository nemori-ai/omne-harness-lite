// Root entry of the SQLite provider: the pure factory and the configuration type. No Cordis import.
export type { SqliteStorageConfig, ConfigProblem } from './config.ts'
export { createSqliteStorage } from './provider.ts'
export type { SqliteStorageInput, CreateSqliteStorageResult } from './provider.ts'
