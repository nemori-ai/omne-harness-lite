// Fixture of the custody ACK composition (R2-D257). It does not import vitest.
//
// Real parts: the release rows below the Journal (`storage` on the real SQLite provider,
// `session-storage`, the release `agent-journal` row with its session-log Journal), the trust table
// of the release, the release evidence adapter (`createModelEvidence` with `agentCustodyOf`, read in
// a row that sees what `model-records` sees), the Agent result receiver of `@omne-harness/agent`,
// the result push, ACK and cleanup of `ModelRuntimeLocalPlugin`, and the Model runtime of
// `@omne-harness/model` with its driver and send boundary.
// Stand-ins, each named: the Session access check allows everything (the contract double of the
// storage fixture); the Model commands are the in-memory commands of `@omne-harness/model/testing`
// (they stand for the SQL records, which keep the same share rule: a call's share comes back with
// its cleanup) and outlive a reload of the tree, as the durable records do; the transport is the
// scripted transport; the Agent's access check and account outlet allow and receive everything.
// The evidence adapter of the in-memory commands is the fixture's for continuity, materialization
// and receive, and the release one for `handoff`.
import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import {
  createAgentModelReceiver,
  createModelReceiverState,
  type ModelReceiverDependencies,
} from '@omne-harness/agent'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeInputId,
  decodeStepId,
  type AcceptedInput,
  type AgentCheckpoint,
  type AgentExecutionId,
  type AgentJournal,
  type DurableEvidence,
  type ModelReceptionTargets,
  type PendingCall,
} from '@omne-harness/agent-contract'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentModelReceptionTargetsKey,
  agentReceivedCommitsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  createModelRuntime,
  type ModelConfiguration,
  type SendResources,
} from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  type ConsumerRef,
  type FixedModelRequest,
  type ModelCallId,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  MODEL_SEND,
  type ModelCommands,
  type ModelDriveInput,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import {
  ModelClockService,
  ModelCommandsService,
  ModelHostAuthorityService,
  modelRuntimeKey,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  createMemoryResultPushLedger,
  createModelRuntimeLocalPlugin,
} from '@omne-harness/model-host-local/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionCommand,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { agentCustodyOf, createModelEvidence } from '../../src/model/evidence.ts'
import { defineRow } from '../../src/row.ts'
import { agentJournalCombination, agentJournalRow } from '../../src/rows/agent-journal/index.ts'
import { sessionStorageRow } from '../../src/rows/session-storage/index.ts'
import { storageRow } from '../../src/rows/storage/index.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../rows/session-fixtures/tree.ts'
import { accessPolicyRow, providerConfig } from '../rows/storage/fixtures/tree.ts'

export function ok<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}
const must = <T>(outcome: Outcome<T, unknown>): T => ok(outcome as Outcome<T, never>)

/** The consumer owner of every Agent call (agent loop/identities.ts AGENT_OWNER). */
const AGENT = '@omne-harness/agent'
/** The share of the tenant, and the share of one call, as the release gives them (R2-D256). */
export const SHARE = { bytes: '1000000', blocks: '200', attachmentBytes: '0' } as const
export const CALL_SHARE = { bytes: '524288', blocks: '20', attachmentBytes: '0' } as const

const ADOPTION = {
  owner: 'o',
  name: 'agent-consumer-evidence',
  revision: '1',
  digest: '0'.repeat(64),
}
const PRINCIPAL = Object.freeze({ subject: 'model-host' })
const SETTINGS = { concurrencyLimit: 4, wakeCapacity: 16, scanBatchSize: 10, scanIntervalMs: 0 }
const LIMITS = {
  maxConcurrentCalls: 4,
  maxRedeliveries: 2,
  maxCleanupSteps: 8,
  maxPendingAccountsPerTenant: 4,
  maxPendingAccounts: 8,
}
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 1,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 4096,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
const request: FixedModelRequest = {
  profile: ADOPTION,
  suppliers: [
    {
      adoption: ADOPTION,
      recipient: 'test.invalid',
      model: 'test',
      credential: { kind: 'factory' },
    },
  ],
  fallback: false,
  retryPolicy: ADOPTION,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: ADOPTION,
  parameterAdoptions: [],
  source: ADOPTION,
}
const ANSWER: readonly Exclude<TransportFact, { kind: 'ended' }>[] = [
  { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
  { kind: 'block-delta', index: '0', delta: 'kept' },
]
const ENDING = { kind: 'completed', reason: 'limit' } as const

const callOf = (name: string): ModelCallId => must(decodeModelCallId(`mcall_${name}`))
const modelOp = (name: string) => must(decodeModelOperationId(`mop_${name}`))
const agentOp = (text: string) => must(decodeAgentOperationId(text))

function checkpoint(): AgentCheckpoint {
  const adoption = { owner: 'test', name: 'checkpoint', revision: '1', digest: 'test:checkpoint' }
  return {
    schema: adoption,
    definition: adoption,
    step: must(decodeStepId('step-1')),
    position: 'E3',
    calls: [],
    passages: [],
    batch: null,
    inputBatch: null,
    requestPreparation: null,
    compaction: null,
    adoptedContext: null,
    guard: null,
    completedPassages: [],
    priorConditions: null,
    currentHandoff: null,
    replyAdmissionRead: { kind: 'unverified' },
    voided: [],
  }
}

const DEFINITION = { owner: 'test', name: 'definition', revision: '1', digest: 'test:definition' }
const PROVIDER = { owner: 'test', name: 'message-handoff', revision: '1', digest: 'test:handoff' }

function openInputOf(
  access: SessionAccess<string>,
  execution: AgentExecutionId,
  grant: DurableEvidence,
  initial: AcceptedInput,
): Parameters<AgentJournal<string>['open']>[0] {
  const entry = agentOp(`open-${access.session}`)
  const runtime = {
    instance: must(decodeAgentInstanceId('instance-1')),
    scope: evidence(`scope/${execution}`),
    definition: DEFINITION,
    grant,
  }
  const invoke = {
    kind: 'invoke' as const,
    operation: entry,
    execution,
    initial,
  }
  const handoff = { kind: 'input' as const, execution, entry, input: initial.id }
  return {
    ...access,
    execution,
    operation: entry,
    original: {
      entry: invoke,
      handoff,
      outcome: {
        request: {
          kind: 'input',
          reference: handoff,
          entry: invoke,
          source: { kind: 'external-input', input: initial.id },
        },
        origin: { kind: 'invoke', ...runtime },
        provider: PROVIDER,
        qualification: evidence(`qualification/${entry}`),
        record: evidence(`record/${entry}`),
        decision: {
          kind: 'prepared',
          message: initial.content,
          admission: evidence(`admission/${entry}`),
        },
      },
    },
    runtime,
    checkpoint: checkpoint(),
  }
}

/** The release rows below the Journal, and a row that sees what `model-records` sees. */
async function journalTree(base: ReturnType<typeof makeBase>) {
  const combination = agentJournalCombination()
  const policy = accessPolicyRow(request => ({
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }))
  const seen: { ctx?: Context } = {}
  // Same row id as the release row, so the loader gives it the trusted names of `model-records`.
  const probe = defineRow({
    row: 'model-records',
    implementation: 'contract-double',
    manifest: { provides: [], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'model-records-view',
      apply(ctx: Context) {
        seen.ctx = ctx
      },
    } satisfies Plugin.Object,
  })
  const tree = await loadTree({
    base,
    rows: [
      declared(
        storageRow,
        providerConfig(base.storageRoot, {
          maxCommandsPerCommit: 256,
          maxJsonDepth: 256,
          maxJsonMembers: 1048576,
        }),
      ),
      declared(policy.plugin),
      declared(sessionStorageRow, {
        combinationVersion: combination.combinationVersion,
        directoryFile: base.directoryFile,
        domainRule: 'organization-account/1',
      }),
      declared(agentJournalRow, combination),
      declared(probe),
    ],
  })
  const view = seen.ctx
  if (view === undefined) throw new Error('the model-records view did not load')
  const service = <T>(key: string): T => {
    const found = tree.service<T>(key)
    if (found === undefined) throw new Error(`the tree provides no ${key}`)
    return found
  }
  return { tree, view, service }
}

type JournalTree = Awaited<ReturnType<typeof journalTree>>

/** One session with an active Run whose execution the Journal opened. */
async function openRun(t: JournalTree, access: SessionAccess<string>) {
  const port = t.service<SessionTransactionPort<string>>(sessionTransactionsKey)
  const journal = t.service<AgentJournal<string>>(agentJournalKey)
  const value = creation({ initial: ordinaryInput('input-1') })
  const create: SessionCommand = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId(`create-${access.session}`),
      creation: value,
    },
  }
  ok(
    await port.commit({
      access,
      command: create,
      guards: [
        initializationFixtureGuard(
          initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
        ),
      ],
    }),
  )
  const started = ok(
    await port.commit({
      access,
      command: {
        kind: 'startRun',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId(`start-${access.session}`),
          entry: 'interactive',
          candidate: value.definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [
        guard('evidence-bridge', 'login-entry', { session: access.session, operation: 'start' }),
      ],
    }),
  )
  const snapshot = ok(await port.readWork(access))
  if (snapshot.run.kind !== 'active') throw new Error('not active')
  const execution = must(decodeAgentExecutionId(snapshot.run.execution.execution))
  const admitted = ok(await port.readInput({ ...access, input: snapshot.run.first }))
  const initial: AcceptedInput = {
    id: must(decodeInputId(admitted.input)),
    content: admitted.message,
    source: started.receipt.source,
    priority: 'ordinary',
  }
  const opened = ok(
    await journal.open(openInputOf(access, execution, started.receipt.source, initial)),
  )
  ok(
    await port.commit({
      access,
      command: {
        kind: 'receive',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId(`handed-${access.session}`),
          fact: {
            kind: 'input-handover',
            input: String(initial.id) as never,
            execution,
            result: { kind: 'accepted', receipt: opened.receipt.evidence as DurableEvidence },
          },
        },
      },
      guards: [],
    }),
  )
  return execution
}

/** The consumer of one Agent Model call of `execution`, as the Agent loop names it. */
function consumerOf(execution: AgentExecutionId): ConsumerRef {
  return { owner: AGENT, work: `${execution}/step-1`, position: 'I3', purpose: 'main' }
}

/**
 * The Agent records that `names` are Model calls it waits on: one PendingCall each, with the
 * reference the Model admission will have. The receiver resolves a delivery to this binding.
 */
async function waitOn(
  t: JournalTree,
  access: SessionAccess<string>,
  execution: AgentExecutionId,
  names: readonly string[],
) {
  const journal = t.service<AgentJournal<string>>(agentJournalKey)
  const loaded = ok(await journal.load({ ...access, execution }))
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('fixture: attached')
  const calls = names.map((name): Extract<PendingCall, { kind: 'model' }> => ({
    kind: 'model',
    purpose: 'main',
    action: must(decodeActionId(`action-${name}`)),
    reference: must(
      encodeModelInvocationRef({
        tenant: access.tenant,
        call: callOf(name),
        admission: modelOp(`admit-${name}`),
      }),
    ),
    consumption: must(decodeConsumptionId(`cons-${name}`)),
    position: consumerOf(execution),
    fixed: evidence(`request-${name}`),
  }))
  const waits = calls.map(pending => ({ kind: 'producer' as const, pending }))
  ok(
    await journal.commit({
      ...access,
      execution,
      operation: agentOp('pending-calls'),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, calls },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: calls.map(pending => ({ pending, action: pending.action, authority })),
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

/** The in-memory Model records with the release handoff evidence. They outlive a reload. */
function modelRecords(custody: { open: boolean; view?: Context }) {
  const handoffs: unknown[] = []
  const release = createModelEvidence(ADOPTION, {
    initial: () => undefined,
    reader: () => undefined,
    custody: () => (custody.open && custody.view ? agentCustodyOf(custody.view) : undefined),
  })
  const memory = createTestModelDependencies<unknown>({
    start: '2026-11-04T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 32,
    sends: [],
    owners: [{ consumerOwner: AGENT, work: { kind: 'exempt' }, evidence: ADOPTION }],
    authority: {
      authorize: ({ access, action }) =>
        access.principal === PRINCIPAL
          ? { ok: { owner: 'identity', subject: 'model-host', revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
    },
    evidence: [
      {
        adoption: ADOPTION,
        continuity: given => ({ ok: given.source }),
        materialization: given => ({
          ok: {
            owner: 'host',
            record: `${given.call}/${given.dispatch}`,
            revision: '1',
            digest: '1'.repeat(64),
          },
        }),
        receive: given => ({
          ok: {
            window: given.window,
            batchDigest: given.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: () => ({ failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } }),
        retry: () => ({
          failure: { kind: 'unavailable', dependency: 'retry', diagnostic: 'none' },
        }),
        // The release adapter of the Agent consumer owner (src/model/evidence.ts).
        handoff: given => release.handoff(given),
      },
    ],
    limits: {
      scanPageCalls: 10,
      resultPageParts: 4,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      capacity: SHARE,
    },
    sending: {
      maxRetainedAttempts: 8,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'value', scope: 'factory', value: 'synthetic-credential' }),
        resolveFor: input =>
          input.purpose === MODEL_SEND
            ? { kind: 'value', scope: 'factory', value: 'synthetic-credential' }
            : { kind: 'unavailable' },
      },
      sources: [
        {
          profile: ADOPTION,
          supplier: ADOPTION,
          recipient: 'test.invalid',
          model: 'test',
          credential: {
            kind: 'factory',
            official: true,
            queryId: must(decodeCredentialId('custody-test-query')),
          },
          current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
        },
      ],
    },
  })
  const raw = memory.dependencies.commands
  const commands: ModelCommands<unknown> = {
    ...raw,
    handoff: async ack => {
      handoffs.push(ack.operation)
      return raw.handoff(ack)
    },
  }
  return { memory, raw, commands, handoffs, ledger: createMemoryResultPushLedger() }
}

type Records = ReturnType<typeof modelRecords>
type Provider = ModelReceiverDependencies<unknown>['provider']

/** The Model host on `root` over `records`, with the Agent receiver registered for its owner. */
async function modelHost(root: Context, t: JournalTree, records: Records) {
  const resources: SendResources<unknown> = {
    async acquire(demand) {
      const script = createScriptedTransport({
        receipt: {
          supplier: demand.supplier.adoption,
          representation: demand.request.representation,
          payloadDigest: 'a'.repeat(64),
        },
        facts: ANSWER,
        ending: { kind: 'terminated', termination: ENDING },
        rejection: null,
      })
      return {
        ok: {
          transport: script.transport,
          startWithCredential: (materialized, _value, signal) => materialized.start(signal),
          release: async () => {},
        },
      }
    },
  }
  class Authority extends ModelHostAuthorityService<unknown> {
    readonly resolve = async (target: { tenant: TenantId; call: ModelCallId }) => ({
      ok: {
        principal: PRINCIPAL,
        tenant: target.tenant,
        call: target.call,
        instance: must(decodeModelInstanceId(`minst_${target.call.slice('mcall_'.length)}`)),
        operation: modelOp(`claim-${target.call.slice('mcall_'.length)}`),
        continuity: { owner: 'host', record: target.call, revision: '1', digest: '1'.repeat(64) },
      } satisfies ModelDriveInput<unknown>,
    })
  }
  class Clock extends ModelClockService {
    readonly now = () => new Date().toISOString()
    readonly waitUntil = (instant: string, signal: AbortSignal) =>
      new Promise<'elapsed' | 'cancelled'>(resolve => {
        const timer = setTimeout(
          () => resolve('elapsed'),
          Math.max(0, Date.parse(instant) - Date.now()),
        )
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve('cancelled')
        })
      })
  }
  const commands = records.commands
  class Commands extends ModelCommandsService<unknown> {
    declare readonly admit: ModelCommands<unknown>['admit']
    declare readonly recall: ModelCommands<unknown>['recall']
    declare readonly scanPending: ModelCommands<unknown>['scanPending']
    declare readonly loadRecovery: ModelCommands<unknown>['loadRecovery']
    declare readonly claim: ModelCommands<unknown>['claim']
    declare readonly prepareDispatch: ModelCommands<unknown>['prepareDispatch']
    declare readonly recordMaterialization: ModelCommands<unknown>['recordMaterialization']
    declare readonly recordSend: ModelCommands<unknown>['recordSend']
    declare readonly openReceiveWindow: ModelCommands<unknown>['openReceiveWindow']
    declare readonly preserve: ModelCommands<unknown>['preserve']
    declare readonly recordLateFact: ModelCommands<unknown>['recordLateFact']
    declare readonly prepareRetry: ModelCommands<unknown>['prepareRetry']
    declare readonly decideRetry: ModelCommands<unknown>['decideRetry']
    declare readonly settle: ModelCommands<unknown>['settle']
    declare readonly control: ModelCommands<unknown>['control']
    declare readonly acquireRead: ModelCommands<unknown>['acquireRead']
    declare readonly nextRead: ModelCommands<unknown>['nextRead']
    declare readonly endRead: ModelCommands<unknown>['endRead']
    declare readonly handoff: ModelCommands<unknown>['handoff']
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
  const Host = createModelRuntimeLocalPlugin({
    provider: given =>
      createModelRuntime(
        {
          commands: given.commands,
          send: records.memory.controls.send.createSender({ resources, commands: given.commands }),
          retry: records.memory.dependencies.retry,
          instances: given.host,
          clock: given.clock,
        },
        CONFIGURATION,
      ),
    qualifyObservation: async () => ({ ok: undefined }),
    results: { ledger: records.ledger, limits: LIMITS },
  })
  const fibers: Fiber[] = [root.plugin(Authority), root.plugin(Clock), root.plugin(Commands)]
  for (const fiber of fibers) await fiber
  const host = root.plugin(Host, { ...SETTINGS })
  await host
  fibers.push(host)
  const receiver = ok(
    createAgentModelReceiver<unknown>(
      {
        provider: {
          journal: t.service<Provider['journal']>(agentJournalKey),
          entries: t.service<Provider['entries']>(agentJournalEntriesKey),
          materials: t.service<Provider['materials']>(agentMaterialsKey),
          received: t.service<NonNullable<Provider['received']>>(agentReceivedCommitsKey),
        },
        access: {
          check: async () => ({ kind: 'allowed', evidence: evidence('agent-access') }),
        },
        targets: t.service<ModelReceptionTargets<unknown>>(agentModelReceptionTargetsKey),
        outlet: { deliver: async () => ({ kind: 'received' }) },
        models: root.get(modelRuntimeKey)!.calls,
        capacity: () => ({ records: 10, bytes: 1_000_000, attachments: 10, inFlight: 4 }),
      },
      createModelReceiverState<unknown>(),
    ),
  )
  const registrar = root.plugin({
    name: 'agent-receiver-registration',
    inject: [modelRuntimeKey],
    apply: (inner: Context) => {
      inner.modelRuntime.registerResultReceiver(AGENT, receiver)
    },
  })
  await registrar
  fibers.push(registrar)
  return {
    admit(access: SessionAccess<string>, execution: AgentExecutionId, name: string) {
      return root.get(modelRuntimeKey)!.calls.admit({
        principal: PRINCIPAL,
        tenant: access.tenant,
        call: callOf(name),
        operation: modelOp(`admit-${name}`),
        request,
        consumer: consumerOf(execution),
        capacity: CALL_SHARE,
      })
    },
    async stop() {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    },
  }
}

/** The custody of call `name` in the Model records. */
export async function custodyOf(records: Records, access: SessionAccess<string>, name: string) {
  const found = ok(
    await records.raw.recall({
      principal: PRINCIPAL,
      tenant: access.tenant,
      call: callOf(name),
      admission: modelOp(`admit-${name}`),
    }),
  )
  if (found.kind !== 'found') throw new Error(`call ${name} is not found`)
  return found.state.custody
}

/** The push record of call `name`. */
export function pushRecord(records: Records, access: SessionAccess<string>, name: string) {
  return records.ledger.read({ tenant: access.tenant, call: callOf(name) })
}

export async function until(check: () => boolean | Promise<boolean>, label: string) {
  for (let tries = 0; tries < 1500; tries += 1) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/**
 * One world: a session whose execution waits on the Model calls `names`, the Model records, and
 * a host over the current tree. `reload` disposes the host and the tree and loads both again on the
 * same storage, with the same Model records and push ledger.
 */
export async function custodyWorld(names: readonly string[], open = true) {
  const base = makeBase()
  const custody: { open: boolean; view?: Context } = { open }
  const access = memoryAccess('custody', 'custody-session')
  const records = modelRecords(custody)
  let t = await journalTree(base)
  custody.view = t.view
  const execution = await openRun(t, access)
  await waitOn(t, access, execution, names)
  let host = await modelHost(t.tree.root, t, records)
  return {
    access,
    execution,
    records,
    custody,
    admit: (name: string) => host.admit(access, execution, name),
    /** An ACK of call `name` under `operation` with the retained evidence `custody`. */
    async acknowledge(name: string, operation: string, custody: DurableEvidence) {
      const found = ok(
        await records.raw.recall({
          principal: PRINCIPAL,
          tenant: access.tenant,
          call: callOf(name),
          admission: modelOp(`admit-${name}`),
        }),
      )
      if (found.kind !== 'found' || found.state.phase !== 'settled')
        throw new Error(`call ${name} is not settled`)
      return records.commands.handoff({
        principal: PRINCIPAL,
        tenant: access.tenant,
        call: callOf(name),
        operation: modelOp(operation),
        result: found.state.settlement.version,
        evidence: { kind: 'retained', custody },
      })
    },
    tree: (): LoadedTree => t.tree,
    async reload(openAfter: boolean) {
      await host.stop()
      await t.tree.dispose()
      custody.open = openAfter
      t = await journalTree(base)
      custody.view = t.view
      host = await modelHost(t.tree.root, t, records)
    },
    async dispose() {
      await host.stop()
      await t.tree.dispose()
      base.release()
    },
  }
}
