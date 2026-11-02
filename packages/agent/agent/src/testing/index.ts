// The `./testing` entry: the memory Journal, scripted doubles of every other Agent port, a manual
// clock and `createTestAgentDependencies`, which assembles all 17 dependencies of the factory. They
// are for tests only. Nothing here is durable, and a double answers what the test scripted; it
// proves nothing about a real provider.
import { assembleModelReceiverFixture, type ModelReceiverFixture } from './model-receiver.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import { decodeModelInstanceId, type ModelInstanceId } from '@omne-harness/model-contract'
import {
  createScriptedModelProvider,
  createScriptedConformanceSubject,
  createScriptedResultPusher,
  type ScriptedResultPusher,
  type ScriptController,
} from '@omne-harness/model-contract/testing'
import {
  createAgentModelReceiver,
  createModelReceiverState,
  type AgentModelReceiver,
} from '../receiving.ts'
import {
  createMemoryAgentAccountOutlet,
  sampleReceivedModelAccount,
} from '@omne-harness/agent-contract/testing'
import type { AgentInstant, Access, AgentExecutionId } from '@omne-harness/agent-contract'
import type { AgentDependencies } from '../construction.ts'
import { createManualAgentClock, type ManualAgentClock } from './clock.ts'
import {
  createScriptedAccessCheck,
  createScriptedActionAdmission,
  createScriptedDecisionCards,
  createScriptedExtensions,
  createScriptedMaterials,
  createScriptedMessageHandoff,
  createScriptedModelContext,
  createScriptedModelSelection,
  createScriptedReads,
  createScriptedRequestPreparation,
  createTableAdoptions,
  createTableConditions,
  type ScriptedAccessCheck,
  type ScriptedActionAdmission,
  type ScriptedDecisionCards,
  type ScriptedExtensions,
  type ScriptedMaterials,
  type ScriptedMessageHandoff,
  type ScriptedModelContext,
  type ScriptedModelSelection,
  type ScriptedReads,
  type ScriptedRequestPreparation,
  type TableAdoptions,
  type TableConditions,
} from './fixtures.ts'
import {
  createMemoryAgentJournal,
  type MemoryAgentJournal,
  type MemoryAgentJournalOptions,
} from './journal.ts'
import { createScriptedToolRuntime, type ScriptedToolRuntime } from './tools.ts'
import {
  decodeActionId,
  decodeAgentOperationId,
  decodeConsumptionId,
} from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolDelivery,
} from '@omne-harness/tool-contract'
import { decodeToolDeliveryId, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import type { ToolReceiverDependencies, ToolReceptionTarget } from '../tool-receiving-types.ts'
import { canonical } from '../canonical.ts'
import { testEvidence } from './fixtures.ts'

export { createManualAgentClock } from './clock.ts'
export type { ManualAgentClock } from './clock.ts'
export {
  createScriptedAccessCheck,
  createScriptedActionAdmission,
  createScriptedDecisionCards,
  createScriptedExtensions,
  createScriptedMaterials,
  createScriptedMessageHandoff,
  createScriptedModelContext,
  createScriptedModelSelection,
  createScriptedReads,
  createScriptedRequestPreparation,
  createTableAdoptions,
  createTableConditions,
  readyPreparation,
  testAdoption,
  testEvidence,
  TEST_OWNER,
} from './fixtures.ts'
export type {
  ScriptedAccessCheck,
  ScriptedActionAdmission,
  ScriptedDecisionCards,
  ScriptedExtensions,
  ScriptedMaterials,
  ScriptedMessageHandoff,
  ScriptedModelContext,
  ScriptedModelSelection,
  ScriptedReads,
  ScriptedRequestPreparation,
  TableAdoptions,
  TableConditions,
} from './fixtures.ts'
export { createMemoryAgentJournal } from './journal.ts'
export type {
  JointCommitKind,
  JointFact,
  JournalRead,
  JournalWrite,
  MemoryAgentJournal,
  MemoryAgentJournalOptions,
  ParticipantResponse,
  WriteFault,
} from './journal.ts'
export type { Answer, Script } from './script.ts'
export { createScriptedToolRuntime } from './tools.ts'
export type { ScriptedToolRuntime } from './tools.ts'

/**
 * The Journal options of the test assembly. `coordination` is optional here only because this
 * assembly chooses a standalone binding when it is omitted; the double's own factory has no default.
 */
export type TestJournalOptions<P> = Omit<MemoryAgentJournalOptions<P>, 'coordination'> &
  Readonly<{ coordination?: MemoryAgentJournalOptions<P>['coordination'] }>

export type TestAgentDependenciesOptions<P> = Readonly<{
  /** Options of the memory Journal, such as its mode and declared participants. */
  journal?: TestJournalOptions<P>
  /** Enables the public Model testing pusher under an explicit tenant principal. */
  receivingPrincipal?: P
  /** The instance of the scripted Model provider. Default: `minst_agent-testing`. */
  modelInstance?: ModelInstanceId
  /** The start of the manual clock. Default: `1970-01-01T00:00:00Z`. */
  clockStart?: AgentInstant
  /** Tells the scripted Model provider whether two principals are the same one. */
  samePrincipal?: (left: P, right: P) => boolean
}>

/** The control handle of every dependency in `TestAgentDependencies.dependencies`. */
export type TestAgentControls<P> = Readonly<{
  journal: MemoryAgentJournal<P>
  receiver: AgentModelReceiver<P> | null
  pusher: ScriptedResultPusher<P> | null
  access: ScriptedAccessCheck<P>
  models: ScriptController<P>
  tools: ScriptedToolRuntime<P>
  adoptions: TableAdoptions<P>
  conditions: TableConditions<P>
  requests: ScriptedRequestPreparation<P>
  selection: ScriptedModelSelection<P>
  modelContext: ScriptedModelContext<P>
  extensions: ScriptedExtensions<P>
  cards: ScriptedDecisionCards<P>
  admission: ScriptedActionAdmission<P>
  handoff: ScriptedMessageHandoff<P>
  materials: ScriptedMaterials<P>
  reads: ScriptedReads<P>
  clock: ManualAgentClock
}>

export type TestAgentDependencies<P> = Readonly<{
  durability: 'none'
  dependencies: AgentDependencies<P, ContentBlock>
  controls: TestAgentControls<P>
}>

const DEFAULT_MODEL_INSTANCE = 'minst_agent-testing'

/**
 * Builds a fresh, non-durable set of all 17 dependencies of `createAgentRuntime`, with the control
 * handle of each. `registration` is null. `models` is the runtime of the scripted Model provider of
 * `@omne-harness/model-contract/testing`. Two calls share no state.
 *
 * A test convenience, not a default of the factory: the Journal binding and the configuration both
 * take `standalone` here unless `journal` says otherwise. `createAgentRuntime` itself compares the
 * configuration with the declaration of the binding on every call (SPEC "协调绑定").
 */
export function createTestAgentDependencies<P>(
  options: TestAgentDependenciesOptions<P> = {},
): TestAgentDependencies<P> {
  const instance = options.modelInstance ?? defaultModelInstance()
  const models = createScriptedModelProvider<P>({
    instance,
    ...(options.samePrincipal === undefined ? {} : { samePrincipal: options.samePrincipal }),
  })
  const journal = createMemoryAgentJournal<P>({ coordination: 'standalone', ...options.journal })
  const access = createScriptedAccessCheck<P>()
  const reception =
    options.receivingPrincipal === undefined
      ? null
      : createAgentModelReceiver(
          {
            provider: journal.provider,
            access: access.port,
            targets: journal.targets,
            outlet: createMemoryAgentAccountOutlet<P>(),
            models: models.provider.runtime.calls,
            capacity: () => ({
              records: 10000,
              bytes: 64 * 1024 * 1024,
              attachments: 10000,
              inFlight: 64,
            }),
          },
          createModelReceiverState<P>(),
        )
  if (reception && 'failure' in reception) throw new Error('Memory received capability missing')
  const receiver = reception?.ok ?? null
  const pusher =
    options.receivingPrincipal === undefined
      ? null
      : createScriptedResultPusher({
          scripted: models,
          principal: options.receivingPrincipal,
          resolveReceiver: () => receiver,
        })
  const controls: TestAgentControls<P> = {
    journal,
    access,
    receiver,
    pusher,
    models: pusher?.controller ?? models.controller,
    tools: createScriptedToolRuntime<P>(),
    adoptions: createTableAdoptions<P>(),
    conditions: createTableConditions<P>(),
    requests: createScriptedRequestPreparation<P>(),
    selection: createScriptedModelSelection<P>(),
    modelContext: createScriptedModelContext<P>(),
    extensions: createScriptedExtensions<P>(),
    cards: createScriptedDecisionCards<P>(),
    admission: createScriptedActionAdmission<P>(),
    handoff: createScriptedMessageHandoff<P>(),
    materials: createScriptedMaterials<P>(),
    reads: createScriptedReads<P>(),
    clock: createManualAgentClock(options.clockStart),
  }
  controls.materials.preserve.always(input => journal.provider.materials.preserve(input))
  controls.materials.read.always(input => journal.provider.materials.read(input))
  return {
    durability: 'none',
    controls,
    dependencies: {
      journal: controls.journal.port,
      access: controls.access.port,
      models: pusher?.provider.runtime ?? models.provider.runtime,
      tools: controls.tools.port,
      adoptions: controls.adoptions.port,
      conditions: controls.conditions.port,
      requests: controls.requests.port,
      selection: controls.selection.port,
      modelContext: controls.modelContext.port,
      extensions: controls.extensions.port,
      cards: controls.cards.port,
      admission: controls.admission.port,
      handoff: controls.handoff.port,
      materials: controls.materials.port,
      reads: controls.reads.port,
      registration: null,
      clock: controls.clock.port,
    },
  }
}

function defaultModelInstance(): ModelInstanceId {
  const decoded = decodeModelInstanceId(DEFAULT_MODEL_INSTANCE)
  if ('failure' in decoded)
    throw new Error(`invalid default model instance ${DEFAULT_MODEL_INSTANCE}`)
  return decoded.ok
}

export type { ModelReceiverFixture } from './model-receiver.ts'

/** A lawful original binding and common memory provider for host receiver tests. */
export function createModelReceiverFixture(): Promise<ModelReceiverFixture> {
  const { tenant } = createScriptedConformanceSubject()
  return assembleModelReceiverFixture(
    tenant,
    sampleReceivedModelAccount(tenant, 'receiver-fixture'),
  )
}

export type ToolReceiverFixture = Readonly<{
  durability: 'none'
  access: Access<string>
  execution: AgentExecutionId
  delivery: ToolDelivery<ContentBlock>
  dependencies: ToolReceiverDependencies<string>
  journal: MemoryAgentJournal<string>
}>

/** An associated Tool call committed through the same non-durable Journal used by the host. */
export async function createToolReceiverFixture(): Promise<ToolReceiverFixture> {
  const base = await createModelReceiverFixture()
  function value<T>(result: { ok: T } | { failure: unknown }): T {
    if ('failure' in result) throw new Error('invalid Tool receiver fixture')
    return result.ok
  }
  const snapshot = value(
    await base.journal.port.load({ ...base.access, execution: base.execution }),
  )
  if (!snapshot.executionAttachment) throw new Error('fixture attachment required')
  const reference = value(
    encodeToolInvocationRef({
      tenant: base.access.tenant,
      call: value(decodeToolCallId('receiver-tool')),
      admission: value(decodeToolOperationId('receiver-tool-admission')),
    }),
  )
  const pending: ToolReceptionTarget['pending'] = {
    kind: 'tool',
    association: 'associated',
    purpose: 'action',
    reference,
    action: value(decodeActionId('receiver-tool-action')),
    consumption: value(decodeConsumptionId('receiver-tool-consumption')),
    position: { owner: 'agent', work: 'opaque-tool-work', position: 'tool', purpose: 'result' },
    fixed: testEvidence('fixed-tool'),
  }
  value(
    await base.journal.port.commit({
      ...base.access,
      execution: base.execution,
      operation: value(decodeAgentOperationId('associate-tool')),
      authority: snapshot.executionAttachment,
      expected: snapshot.revision,
      checkpoint: { ...snapshot.checkpoint, calls: [pending] },
      state: { kind: 'advancing' },
      finish: null,
      handoff: null,
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const target: ToolReceptionTarget = {
    execution: base.execution,
    instance: snapshot.executionAttachment.instance,
    pending,
  }
  const dependencies: ToolReceiverDependencies<string> = {
    provider: base.journal.provider,
    access: base.dependencies.access,
    capacity: () => ({ records: 10, bytes: 1000000, attachments: 10, inFlight: 2 }),
    targets: {
      async resolve(input) {
        if (
          input.access.principal !== base.access.principal ||
          input.access.tenant !== base.access.tenant
        )
          return { failure: { kind: 'denied', action: 'receive-result' } }
        return {
          ok:
            input.reference === reference &&
            canonical(input.consumer) === canonical(pending.position)
              ? target
              : null,
        }
      },
      async forExecution(input) {
        if (
          input.access.principal !== base.access.principal ||
          input.access.tenant !== base.access.tenant ||
          input.execution !== base.execution
        )
          return { failure: { kind: 'denied', action: 'receive-result' } }
        return { ok: [target] }
      },
    },
  }
  const delivery: ToolDelivery<ContentBlock> = {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference,
      result: value(decodeToolResultVersion('result-1')),
    },
    consumer: pending.position,
    delivery: value(decodeToolDeliveryId('delivery-1')),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'not-occurred', evidence: testEvidence('effect') },
    source: testEvidence('tool-result'),
    value: { content: [], data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] },
    account: null,
  }
  return {
    durability: 'none' as const,
    access: base.access,
    execution: base.execution,
    journal: base.journal,
    dependencies,
    delivery,
  }
}
