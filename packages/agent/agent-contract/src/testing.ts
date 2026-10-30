// The `./testing` entry: the conformance suites of the receiving ports that outside providers
// implement (SPEC "生产者接收面"), and a non-durable double for each port that passes its suite. A
// suite returns a list of cases and does not depend on a test framework. A case fails with a
// `node:assert` AssertionError. A case that needs an optional fixture control the fixture lacks
// carries `uncovered` and rejects; it is reported, never passed. Each double declares
// `durability: 'none'` and must not be
// assembled into production. The doubles do not prove durability, cross-process behavior or the
// real Agent runtime.
export type { ConformanceCase } from './testing-case.ts'
export {
  agentJournalEntriesConformance,
  createMemoryAgentJournalEntries,
  memoryAgentJournalEntriesFixture,
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
  sampleStartFence,
  type AgentJournalEntriesFixture,
  type MemoryAgentJournalEntries,
  type RecordFault,
} from './testing-journal-entries.ts'
export {
  agentAccountOutletConformance,
  createMemoryAgentAccountOutlet,
  memoryAgentAccountOutletFixture,
  sampleAccountHandoff,
  type AgentAccountOutletFixture,
  type MemoryAgentAccountOutlet,
} from './testing-account-outlet.ts'

export {
  agentJournalCoreConformance,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpenOptions,
  type AgentJournalCoreOpened,
} from './testing-journal-core.ts'
export {
  createTestCancellationPolicy,
  obligationCategoryOf,
  TEST_CANCELLATION_IMPLEMENTATION,
  TEST_CANCELLATION_INPUT_SCHEMA,
  TEST_CANCELLATION_POLICY,
  testCancellationPolicyInstallation,
  type TestHostRecord,
} from './testing-cancellation.ts'
export { memoryReceivedCommitFixture } from './testing-received-memory.ts'
export type { ReceivedCommitFixture, RequiredReceivedCommits } from './testing-received-fixture.ts'
