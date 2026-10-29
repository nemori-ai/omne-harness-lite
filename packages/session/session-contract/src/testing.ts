// Framework-independent conformance cases and non-durable provider doubles. A passing double
// proves the tested in-memory behavior, not durability or a production assembly.
export {
  NotApplicable,
  assertIndistinguishable,
  conformanceCase,
  expectKind,
  handle,
  isNotApplicable,
  refused,
  runConformanceCase,
  shapeOf,
  succeeded,
  type CaseVerdict,
  type ConformanceCase,
} from './testing-case.ts'
export {
  createMemorySessionTransactions,
  memorySessionTransactionsFixture,
  pendingReasonsOf,
  sessionTransactionsConformance,
  type MemorySessionTransactions,
  type MemorySessionLogTransactions,
  type MemoryInitializationTransactions,
  type SessionTransactionsFixture,
} from './testing-transactions.ts'
export {
  createMemorySessionClock,
  createMemorySessionContextInput,
  createMemorySessionEvidenceBridge,
  createScriptedSessionIdentityBridge,
  type IdentityScript,
  type MemorySessionClock,
  type MemorySessionContextInput,
  type MemorySessionEvidenceBridge,
  type ScriptedSessionIdentityBridge,
} from './testing-ports.ts'
export {
  TESTING_OWNER,
  adoption,
  assistantMessage,
  creation,
  evidence,
  guard,
  inputId,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  operationId,
  ordinaryInput,
  sessionId,
  testingTenant,
  testingWorkspace,
  userMessage,
} from './testing-values.ts'

export * from './testing-providers.ts'
export {
  createMemoryInitializationSource,
  type MemoryInitializationSource,
} from './testing-initialization-source.ts'
export {
  adoptedInitializationFixture,
  initializationFixtureFacts,
  initializationFixtureGuard,
} from './testing-initialization.ts'
export type { MemorySessionTransactionOptions } from './testing-transactions.ts'
export {
  sessionIdentityBridgeConformance,
  sessionEvidenceBridgeConformance,
  sessionContextInputConformance,
  sessionClockConformance,
  sessionIdleInputConformance,
  sessionNotifierConformance,
  scopeReleaseConformance,
  agentDriveConformance,
} from './testing-provider-conformance.ts'

export {
  createMemorySessionHistorySource,
  type MemorySessionHistorySource,
} from './testing-history-source.ts'
