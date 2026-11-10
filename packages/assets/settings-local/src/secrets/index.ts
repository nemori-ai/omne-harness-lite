// The `./secrets` entry: the file provider of the secret custody ports of `@omne-harness/settings`,
// and what a host setup command needs around it (building a vault on a host, the permission guard,
// reading a secret from a terminal). It has no Cordis dependency.
export {
  createSecretVault,
  inspectSecretVault,
  openSecretVault,
  type CreateSecretVaultOptions,
  type CreateSecretVaultResult,
  type OpenSecretVaultResult,
  type SecretSeed,
  type SecretVault,
  type SecretVaultInspection,
  type SecretVaultOptions,
  type SecretVaultSnapshot,
  type UnavailableCause,
} from './store.ts'
export type { SecretRecord } from './records.ts'
export {
  createPosixGuard,
  defaultGuard,
  holdsSecret,
  initSecretVault,
  narrowAndVerify,
  readTypedSecret,
  type EntryKind,
  type PermissionGuard,
  type SecretReadFailure,
  type SecretVaultInitDeps,
  type SecretVaultInitFailure,
  type SecretVaultInitResult,
  type TypedSecret,
} from './init.ts'
export { SecretInputError, type SecretInputFailure } from './input.ts'
export {
  readSecretFromTerminal,
  type ReadSecretOptions,
  type TerminalInput,
  type TextSink,
} from './terminal.ts'
