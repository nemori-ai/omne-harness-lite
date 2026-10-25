// The root entry of the Tool contract package. It does not import Cordis or another Tool package.
export { toolBodyContract } from './contract.ts'
export { describedAdoption, type AdoptionRules } from './adoption.ts'
export * from './identity.ts'
export {
  defaultResultPolicy,
  defaultResultPolicyAdoption,
  defaultResultPolicyRules,
} from './result-policy.ts'
export { judgeImplementationFacts, judgeToolDefinition } from './judge-definition.ts'
export {
  deriveDefinition,
  foldResident,
  planAdoption,
  refreshAvailability,
  sameBindingKey,
  sameShape,
  sameSourceLayer,
  shapeOf,
  type AdoptionFacts,
  type AdoptionPlan,
  type FreezeVerdict,
  type RefreshFacts,
  type RefreshOutcome,
  type ResidentFoldFailure,
  type ResidentTool,
  type ToolReloadResult,
} from './dynamics.ts'
export { judgeFixedToolRequest, judgeToolInvokeRequest } from './judge-request.ts'
export { judgeConsumerRef, judgeHandoff } from './judge-release.ts'
export { judgeToolState } from './judge-state.ts'
export { evaluateToolAvailability, presentTool } from './catalog.ts'
export * from './reference.ts'
// The readers of the author inside a handle are on the `./binding` entry, not here.
export { defineCommandTool, defineFunctionTool, defineToolOperation } from './registration.ts'
export { defineToolWaitContract } from './wait-contract.ts'
export {
  createDefaultParameterCodec,
  judgeToolArguments,
  type ParsedToolArguments,
  type ToolArgumentsRejection,
} from './parameter-codec.ts'
export { renderToolResult } from './result-rendering.ts'
export { projectToolResult } from './result-projection.ts'
export type * from './definitions.ts'
export type * from './results.ts'
export type * from './operations.ts'
export type * from './author-context.ts'
export type * from './execution.ts'
export type * from './ports.ts'
export type * from './authoring.ts'
export type * from './records.ts'
export type * from './custody.ts'
export type * from './program.ts'
