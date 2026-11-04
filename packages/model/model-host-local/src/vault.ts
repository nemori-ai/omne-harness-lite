// The `./vault` entry: the operations a host setup command uses to put the factory secret into the
// local vault, and to replace it later. It is not a plugin and not part of the root entry. A caller
// supplies the secret through a reader, so that the secret stays a local value between the reader
// and the store. The command line shell of the package (`vault-init-cli.ts`) uses the same functions.
export {
  SecretInputError,
  createPosixGuard,
  defaultGuard,
  initVault,
  replaceVaultSecret,
  type EntryKind,
  type PermissionGuard,
  type SecretInputFailure,
  type VaultInitDeps,
  type VaultInitFailure,
  type VaultInitResult,
  type VaultReplaceDeps,
  type VaultReplaceFailure,
  type VaultReplaceResult,
} from './vault-init.ts'
export {
  readSecretFromTerminal,
  type ReadSecretOptions,
  type TerminalInput,
  type TextSink,
} from './vault-init-cli.ts'
