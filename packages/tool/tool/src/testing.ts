import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ToolBindings,
  ToolCatalog,
  ToolChildren,
  ToolExecutorBinding,
  ToolInstanceHost,
  ToolInvocationSourceIssuer,
  ToolOperationIdentities,
} from '@omne-harness/tool-contract'
import {
  createMemoryToolClock,
  createMemoryToolDecisionBridge,
  createMemoryToolEnvironment,
  createMemoryToolExecutorBinding,
  createMemoryToolOutputCustody,
  createMemoryToolResourceResponses,
  createMemoryToolStartAuthority,
  type MemoryEnvironment,
  type MemoryToolClock,
  type MemoryToolDecisionBridge,
  type MemoryToolEnvironment,
  type MemoryToolExecutorBinding,
  type MemoryToolOutputCustody,
  type MemoryToolResourceResponses,
  type MemoryToolStartAuthority,
} from '@omne-harness/tool-contract/testing'
import type { ToolDependencies, ToolLedgerConfiguration } from './construction.ts'
import { createToolFactAcknowledgementGuard } from './fact-acknowledgements.ts'
import type { ToolLedgerGuards } from './ledger-guards.ts'
import { createToolLedger, type ToolLedger } from './ledger.ts'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from './testing-store.ts'

/** The caller supplies authorization, the trusted construction ports and the remaining ports. */
export type TestToolDependenciesInput<P> = Readonly<{
  configuration: ToolLedgerConfiguration
  guards: Omit<ToolLedgerGuards<P, ContentBlock>, 'factAcknowledgements'>
  instances: ToolInstanceHost<P>
  catalog: ToolCatalog<P>
  children: ToolChildren<P>
  operationIdentities: ToolOperationIdentities
  sourceIssuer: ToolInvocationSourceIssuer<P>
  bindingsFor(
    executor: ToolExecutorBinding<P, ContentBlock, MemoryEnvironment>,
  ): ToolBindings<P, ContentBlock, MemoryEnvironment>
}>

export type TestToolDoubles<P> = Readonly<{
  executor: MemoryToolExecutorBinding<P, MemoryEnvironment>
  environment: MemoryToolEnvironment<P>
  authority: MemoryToolStartAuthority<P>
  clock: MemoryToolClock
  decisions: MemoryToolDecisionBridge<P>
  resources: MemoryToolResourceResponses<P>
  custody: MemoryToolOutputCustody<P>
}>

export type TestToolDependencies<P> = Readonly<{
  durability: 'none'
  dependencies: ToolDependencies<P, ContentBlock, MemoryEnvironment>
  store: MemoryToolLedgerStore<ContentBlock>
  ledger: ToolLedger<P, ContentBlock>
  doubles: TestToolDoubles<P>
}>

/** Builds a fresh non-durable assembly. The caller constructs and owns the runtime separately. */
export function createTestToolDependencies<P>(
  input: TestToolDependenciesInput<P>,
): TestToolDependencies<P> {
  const doubles: TestToolDoubles<P> = {
    executor: createMemoryToolExecutorBinding<P, MemoryEnvironment>(),
    environment: createMemoryToolEnvironment<P>(),
    authority: createMemoryToolStartAuthority<P>(),
    clock: createMemoryToolClock(),
    decisions: createMemoryToolDecisionBridge<P>(),
    resources: createMemoryToolResourceResponses<P>(),
    custody: createMemoryToolOutputCustody<P>(),
  }
  const store = createMemoryToolLedgerStore<ContentBlock>()
  const bindings = input.bindingsFor(doubles.executor.binding)
  const ledger = createToolLedger(
    store,
    {
      ...input.guards,
      factAcknowledgements: createToolFactAcknowledgementGuard(bindings),
    },
    doubles.clock,
    input.configuration,
    { custody: doubles.custody, releaseInspection: doubles.environment },
  )
  return {
    durability: 'none',
    store,
    ledger,
    doubles,
    dependencies: {
      commands: ledger.commands,
      admissions: ledger.admissions,
      queues: ledger.queues,
      facts: ledger.facts,
      reads: ledger.reads,
      bindings,
      environments: doubles.environment,
      decisions: doubles.decisions,
      instances: input.instances,
      clock: doubles.clock,
      resultPolicy: input.guards.policy,
      authority: doubles.authority,
      resources: doubles.resources,
      custody: doubles.custody,
      catalog: input.catalog,
      children: input.children,
      operationIdentities: input.operationIdentities,
      sourceIssuer: input.sourceIssuer,
    },
  }
}

export {
  createTestInvocationSource,
  createTestToolIdentities,
  TEST_SOURCE_OWNER,
  type TestInvocationSource,
  type TestSourceBinding,
  type TestToolIdentities,
} from './testing-source.ts'
export {
  createMemoryToolLedgerStore,
  type MemoryToolLedgerStore,
  type MemoryReadFault,
  type MemoryCommitFault,
  type MemoryLanding,
} from './testing-store.ts'
