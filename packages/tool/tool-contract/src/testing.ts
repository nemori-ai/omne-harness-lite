// The `./testing` entry (G6): the conformance suites of the ports that outside providers implement,
// and a non-durable double for each port that passes its suite. A suite returns a list of cases
// and does not depend on a test framework; a case fails with a `node:assert` AssertionError. Each
// double declares `durability: 'none'` and must not be assembled into production.
export {
  NotApplicable,
  completionOf,
  crossTenantAnswers,
  finalAnswer,
  isNotApplicable,
  isProgress,
  resendRecalls,
  runConformanceCase,
  type AnswerModel,
  type AnswerRow,
  type CaseVerdict,
  type Completion,
  type ConformanceCase,
  type CrossTenantAnswers,
} from './testing-case.ts'
export {
  createMemoryToolStartAuthority,
  memoryToolStartAuthorityFixture,
  startAuthorityAnswers,
  toolStartAuthorityConformance,
  type MemoryToolStartAuthority,
  type ToolStartAuthorityFixture,
} from './testing-start-authority.ts'
export {
  createMemoryAuthorizedToolStartAuthority,
  type MemoryAuthorizedToolStartAuthority,
  type ToolPermitReading,
  type ToolStartAuthorizationHandles,
} from './testing-start-authority.ts'
export {
  memoryToolStartFenceFixture,
  toolStartFenceConformance,
  type ToolStartFenceFixture,
} from './testing-start-fence.ts'
export {
  memoryToolStartAuthorizationFixture,
  toolStartAuthorizationConformance,
  type ToolStartAuthorizationFixture,
} from './testing-start-authorization.ts'
export {
  createMemoryToolResultReceiver,
  memoryToolResultReceiverFixture,
  toolResultReceiverConformance,
  type MemoryToolResultReceiver,
  type ToolResultReceiverFixture,
} from './testing-result-receiver.ts'
export {
  createMemoryToolEnvironment,
  environmentAnswers,
  memoryToolEnvironmentFixture,
  toolEnvironmentConformance,
  type MemoryEnvironment,
  type MemoryToolEnvironment,
  type ToolEnvironmentFixture,
} from './testing-environment.ts'
export {
  completedFinal,
  createMemoryToolExecutorBinding,
  executorBindingAnswers,
  memoryToolExecutorBindingFixture,
  toolExecutorBindingConformance,
  type MemoryToolExecutorBinding,
  type ToolExecutorBindingFixture,
} from './testing-executor-binding.ts'
export {
  createMemoryToolOutputCustody,
  memoryToolOutputCustodyFixture,
  outputCustodyAnswers,
  toolOutputCustodyConformance,
  type MemoryToolOutputCustody,
  type ToolOutputCustodyFixture,
} from './testing-output-custody.ts'
export {
  clockAnswers,
  createMemoryToolClock,
  memoryToolClockFixture,
  toolClockConformance,
  type MemoryToolClock,
  type ToolClockFixture,
} from './testing-clock.ts'
export {
  createMemoryToolDecisionBridge,
  decisionBridgeAnswers,
  memoryToolDecisionBridgeFixture,
  toolDecisionBridgeConformance,
  type MemoryToolDecisionBridge,
  type ToolDecisionBridgeFixture,
} from './testing-decision-bridge.ts'
export {
  createMemoryToolResourceResponses,
  resourceResponsesAnswers,
  memoryToolResourceResponsesFixture,
  toolResourceResponsesConformance,
  type MemoryToolResourceResponses,
  type ToolResourceResponsesFixture,
} from './testing-resource-responses.ts'

export { testingTenant, testingWorkspace } from './testing-values.ts'
