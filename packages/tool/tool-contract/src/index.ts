// The root entry of the Tool contract package. It does not import Cordis or another Tool package.
export { toolBodyContract } from './contract.ts'
export { describedAdoption, type AdoptionRules } from './adoption.ts'
export * from './identity.ts'
export {
  defaultResultPolicy,
  defaultResultPolicyAdoption,
  defaultResultPolicyRules,
} from './result-policy.ts'
export { judgeToolDefinition } from './judge-definition.ts'
export { judgeFixedToolRequest } from './judge-request.ts'
export { judgeToolState } from './judge-state.ts'
export { evaluateToolAvailability, presentTool } from './catalog.ts'
export {
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  readToolOperation,
  readToolRegistration,
  type ToolOperationSlot,
  type ToolRegistrationSlot,
} from './registration.ts'
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
