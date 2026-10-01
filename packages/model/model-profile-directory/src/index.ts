// Pure v3 judgments; Cordis runtime is available only through ./plugin.
export {
  scopeChain,
  winningRow,
  manifestDisposition,
  configEligibility,
  credentialSlot,
} from './judgments.ts'
export type { LoadedManifest, SlotBinding } from './judgments.ts'
export type {
  ProfileRow,
  CatalogScope,
  InvalidInput,
  Failure,
  Result,
  ProfilePatch,
  OfficialManifest,
  ManifestEntryDisposition,
  ManifestResult,
  CredentialPresent,
  CredentialValue,
  ModelCatalogRead,
  ModelCatalog,
  CredentialLookup,
  DiagnosticSink,
  DirectoryDiagnostic,
  ModelProfileDirectoryConfig,
  LocalCredentialLookupConfig,
} from './types.ts'
