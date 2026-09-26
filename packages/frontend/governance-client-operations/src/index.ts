export { createGovernanceClient, type CreateGovernanceClientOptions } from './client.ts'
export { governanceClientOperationsPlugin } from './plugin.ts'
export { exitStatus } from './report.ts'
export {
  ClientUseUsageDefect,
  GOVERNANCE_CLIENT_OPERATIONS_SERVICE,
  type ActionInput,
  type ActionIntent,
  type ActionPreview,
  type PreviewIntent,
  type TrustSummary,
  type PromptResult,
  type InputPrompt,
  type ActionReport,
  type AdmissionReason,
  type DefectStage,
  type GovernanceClientOperations,
  type GovernanceUse,
  type InvokeAction,
  type LocalSettlement,
  type OpenUseOutcome,
  type Origin,
  type PublicExchange,
  type ReadMode,
  type RemoteObservation,
} from './surface.ts'
