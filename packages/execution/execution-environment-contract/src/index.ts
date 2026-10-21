// PACKAGE_TEMPLATE_DRAFT: Contract types, descriptors, schema and pure functions are in place; per-operation facility schemas and the facility and provider contract verification suites are not yet accepted.
export { acquisitionRef, originRef } from './identity.ts'
export type { Access, AcquisitionRef, OriginRef } from './identity.ts'

export { bindingKinds, bindingScope } from './binding.ts'
export type { BindingKind, EnvironmentBinding, EnvironmentContinuity } from './binding.ts'

export type { EnvironmentRequirement, IsolationClaim, IsolationClaims } from './requirement.ts'

export { describeFacility } from './facility.ts'
export type {
  EnvironmentFacilities,
  FacilityDescriptor,
  FacilityKey,
  FacilityOperation,
  FacilityReason,
  FacilityRequest,
  FacilityResult,
} from './facility.ts'

export { filesFacility } from './facilities/files.ts'
export type {
  FileBatchOutcome,
  FileBatchRecognition,
  FileBatchRef,
  FileIdentity,
  FileInformation,
  FileRequest,
  FileSystemFacility,
  FileTarget,
  FileVersion,
  HandleGeneration,
  ObjectToken,
} from './facilities/files.ts'

export { commandFacility } from './facilities/command.ts'
export type {
  CommandFacility,
  CommandOutcome,
  OutputChunk,
  OutputCount,
  OutputPolicy,
  OutputSummary,
  ProcessHandle,
} from './facilities/command.ts'

export { terminalFacility } from './facilities/terminal.ts'
export type { TerminalFacility, TerminalInformation, TerminalRef } from './facilities/terminal.ts'

export { createRecoveryAccess } from './ports.ts'
export type {
  FacilityGuard,
  ManagedResource,
  RecoveryAccess,
  RecoveryAuthority,
  ResourceLedger,
} from './ports.ts'

export type {
  AcquisitionState,
  Acquired,
  EnvironmentAdoption,
  EnvironmentLease,
  FacilitySet,
  InstanceIdentity,
  LeaseInvalidation,
  LeaseRelease,
  Pending,
  Placement,
  ProviderIdentity,
  RegistryInvalidationReason,
  RejectReason,
  Rejected,
} from './lease.ts'

export type {
  AcquireInput,
  EnvironmentDescription,
  EnvironmentProvider,
  ExecutionEnvironment,
  OwnedRecovery,
  ProviderAcquireInput,
  ProviderAcquisition,
  ProviderFacts,
  ProviderRegistrations,
  RecoveryListing,
  ResourceRecovery,
  Retirement,
  UnsupportedRecovery,
} from './environment.ts'

export { environmentNeedAdoption, environmentNeedSchema } from './need-declaration.ts'
export type { EnvironmentNeedDeclaration } from './need-declaration.ts'

export { executionHostFactsBlock, executionPlacementBlock } from './blocks.ts'
export type {
  ExecutionHostFactsValue,
  ExecutionPlacementEntry,
  ExecutionPlacementValue,
} from './blocks.ts'

export { judgeRequirement, matchProviders } from './judge.ts'
export type { ProviderCapabilities, ProviderMatch, RequirementRefusal } from './judge.ts'
export type { Issue as DecodeIssue } from './decode.ts'
