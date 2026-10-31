// Independent local host factories. This entry does not import Cordis.
export {
  createLocalStartCoordinator,
  START_COORDINATOR_DOMAIN_KEY,
  START_COORDINATOR_OWNER,
  startCoordinatorAdoption,
  type GuardResource,
  type LocalStartCoordinatorInput,
  type StartCoordinatorAccess,
} from './start-coordinator.ts'
export {
  createLocalToolCredentials,
  type LocalToolCredentialsInput,
  type ToolCredentialAccess,
  type ToolCredentialCapability,
  type ToolCredentialReferences,
  type ToolCredentialResolution,
  type ToolCredentialSecrets,
} from './credentials.ts'
export {
  createLocalScheduledEnvironment,
  type LocalScheduledEnvironmentInput,
} from './scheduled-environment.ts'
export type {
  ToolEnvironmentSchedulingPolicy,
  EnvironmentPreparationInput,
  EnvironmentReleaseInput,
} from './environment-policy.ts'
export type {
  ToolEnvironmentDiagnostic,
  ToolEnvironmentDiagnosticStage,
  ToolEnvironmentDiagnostics,
} from './environment-diagnostics.ts'
