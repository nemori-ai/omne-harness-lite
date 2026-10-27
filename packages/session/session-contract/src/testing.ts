// The `./testing` entry: the conformance suite of the transaction port that a storage provider
// implements, a non-durable double that passes it, and doubles of the construction ports that the
// first tenant path needs (identity bridge, evidence bridge, Context input, clock). A suite returns
// a list of cases and does not depend on a test framework; a case fails with a `node:assert`
// AssertionError. Each double declares `durability: 'none'` and must not be assembled into
// production. The doubles prove nothing about durability, cross-process commits or a real store.
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
