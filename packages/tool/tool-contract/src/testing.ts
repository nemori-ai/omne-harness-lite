// The `./testing` entry (G6): the conformance suites of the ports that outside providers implement,
// and a non-durable double for each port that passes its suite. A suite returns a list of cases
// and does not depend on a test framework; a case fails with a `node:assert` AssertionError. Each
// double declares `durability: 'none'` and must not be assembled into production.
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
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

/**
 * Mints a real legal-identity tenant for a test: both halves must be legal atomic texts
 * (`org_`/`acc_` plus the 26-character body). A reference can be encoded only for a minted
 * tenant, so a test of the reference paths builds its tenants here, not as shaped objects.
 */
export function testingTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(organization)
  const acc = accountCodec.parse(account)
  if (!org.ok || !acc.ok) throw new Error(`illegal test tenant text: ${organization} / ${account}`)
  return tenant(org.value, acc.value)
}
