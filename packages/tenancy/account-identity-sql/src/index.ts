export {
  createAccountIdentity,
  AccountIdentityStopped,
  type AccountIdentityDependencies,
  type AccountIdentityInstance,
} from './factory.ts'
export { AccountIdentityConfigSchema } from './config.ts'
export { accountIdentityMigrations, ACCOUNT_TABLE, ACCOUNT_ID_COLUMN } from './schema.ts'
export { accountIdentitySnapshotCheck, ACCOUNT_SNAPSHOT_TABLES } from './snapshot.ts'
export type { Diagnostics, Notifier } from './diagnostics.ts'
