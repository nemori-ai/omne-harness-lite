// The `./testing` entry: the conformance suites of the receiving ports that outside providers
// implement (SPEC "生产者接收面"), and a non-durable double for each port that passes its suite. A
// suite returns a list of cases and does not depend on a test framework. A case fails with a
// `node:assert` AssertionError. Each double declares `durability: 'none'` and must not be
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
  sampleStreamReference,
  type AgentJournalEntriesFixture,
  type MemoryAgentJournalEntries,
} from './testing-journal-entries.ts'
export {
  agentAccountOutletConformance,
  createMemoryAgentAccountOutlet,
  memoryAgentAccountOutletFixture,
  sampleAccountHandoff,
  type AgentAccountOutletFixture,
  type MemoryAgentAccountOutlet,
} from './testing-account-outlet.ts'
