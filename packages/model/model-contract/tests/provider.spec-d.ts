import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { expectTypeOf, it } from 'vitest'
import type {
  Access,
  CallAccess,
  CallState,
  MaterializationReceipt,
  ModelHandle,
  ModelRuntime,
  Mutation,
  RetryDecision,
  RetryPosition,
  RetryResolution,
  ReadId,
  Reply,
  ResultVersion,
  Settlement,
  Snapshot,
  Termination,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  CallAccountReport,
  CommitQuery,
  DispatchPlan,
  ExecutionRef,
  IndependentModelFact,
  LateDispatchFact,
  MaterializedTransport,
  ModelClock,
  ModelCommands,
  ModelInstanceHost,
  ModelMediaLease,
  ModelMediaReader,
  ModelProvider,
  ModelRetryPolicy,
  ModelSendBoundary,
  ModelToolPayloadAdapter,
  ModelTransport,
  PreparedTransport,
  Publication,
  RecoveryRecord,
  SendDemand,
  SendResult,
  ProviderDiagnostic,
  TransportDispatch,
  TransportFact,
  TransportTermination,
  WriteContext,
} from '@omne-harness/model-contract/provider'
import {
  message,
  report,
  adoption,
  block,
  budget,
  call,
  capacity,
  consumer,
  dispatch,
  evidence,
  incompleteCall,
  instance,
  operation,
  reference,
  request,
  revision,
  supplier,
  tenant,
  tool,
  toolCall,
} from './values.ts'

const execution: ExecutionRef = { tenant, call, instance, generation: '1' }
const position: RetryPosition = { operation, dispatch, policy: adoption, consumer }
const state: CallState = {
  call,
  revision,
  consumer,
  control: { kind: 'none' },
  custody: { kind: 'producer' },
  phase: 'accepted',
}

it('TransportFailure is the four failures that a transport can name', () => {
  expectTypeOf<TransportFailure['kind']>().toEqualTypeOf<
    'denied' | 'invalid' | 'unsupported' | 'unavailable'
  >()
  // @ts-expect-error commit-unknown is a provider fact, not a transport failure
  const unknown: TransportFailure = { kind: 'commit-unknown', operation }
  void unknown
})

it('an adapter can implement the payload converter and the media reader from the contract alone', () => {
  const payloads: ModelToolPayloadAdapter<{ name: string }> = {
    convertToModelPayload: declaration => ({ ok: { name: declaration.name } }),
  }
  const lease: ModelMediaLease = { bytes: (async function* () {})(), close: async () => {} }
  const reader: ModelMediaReader<string> = {
    open: async () => ({ ok: lease }),
  }
  void [payloads, reader, tool]
})

it('a media read names its invocation and cannot forge a managed identity for an independent call', () => {
  const independent = {
    principal: 'p',
    tenant,
    invocation: { kind: 'independent' },
    request,
    source: evidence,
    reference,
    recipient: 'r',
  } as const
  void independent
  expectTypeOf<ModelMediaReader<string>['open']>().parameter(0).toHaveProperty('invocation')
  const forged: Parameters<ModelMediaReader<string>['open']>[0]['invocation'] = {
    kind: 'independent',
    // @ts-expect-error an independent invocation has no managed call identity
    call,
  }
  void forged
})

it('TransportTermination replaces the control with a confirmed stop', () => {
  const stopped: TransportTermination = { kind: 'interrupted', stop: 'confirmed' }
  const done: TransportTermination = { kind: 'completed', reason: 'stop' }
  // @ts-expect-error a transport carries no managed control operation
  const managed: TransportTermination = { kind: 'interrupted', control: operation }
  void [stopped, done, managed]
  expectTypeOf<Termination>().not.toEqualTypeOf<TransportTermination>()
})

it('a materialization receipt names the supplier, the representation and the payload digest, and no budget', () => {
  const receipt: MaterializationReceipt = {
    supplier: adoption,
    representation: adoption,
    payloadDigest: 'd',
  }
  // @ts-expect-error a receipt names its payload digest
  const noDigest: MaterializationReceipt = { supplier: adoption, representation: adoption }
  const withBudget: MaterializationReceipt = {
    ...receipt,
    // @ts-expect-error a receipt carries no budget: the send path measures nothing
    budget,
  }
  expectTypeOf<keyof MaterializationReceipt>().toEqualTypeOf<
    'supplier' | 'representation' | 'payloadDigest' | 'replayFormat'
  >()
  void [noDigest, withBudget]
})

it('a materialization receipt may name the replay format that its dispatch produces', () => {
  const formatted: MaterializationReceipt = {
    supplier: adoption,
    representation: adoption,
    payloadDigest: 'd',
    replayFormat: 'vendor-format-v1',
  }
  // @ts-expect-error the replay format is a text, not a structured value
  const structured: MaterializationReceipt = { ...formatted, replayFormat: { format: 'x' } }
  expectTypeOf<MaterializationReceipt['replayFormat']>().toEqualTypeOf<string | undefined>()
  void structured
})

it('execution and write context fix the target, the generation and the expected revision', () => {
  const write: WriteContext = { ...execution, operation, expected: revision }
  // @ts-expect-error a write names the expected revision
  const noExpected: WriteContext = { ...execution, operation }
  // @ts-expect-error a plain string is not a revision
  const loose: WriteContext = { ...execution, operation, expected: '1' }
  void [write, noExpected, loose]
  expectTypeOf<WriteContext>().toExtend<ExecutionRef>()
})

it('CommitQuery separates a committed value from the three other answers', () => {
  const answers: CommitQuery<{ revision: typeof revision }>[] = [
    { kind: 'committed', value: { revision } },
    { kind: 'rolled-back' },
    { kind: 'unknown' },
    { kind: 'not-committed' },
  ]
  // @ts-expect-error a committed answer carries its value
  const empty: CommitQuery<number> = { kind: 'committed' }
  void [answers, empty]
})

it('dispatch plans and retry facts keep the policy position and the decision apart', () => {
  const plan: DispatchPlan = { dispatch, supplier, policyDecision: null }
  const stop: RetryDecision = {
    kind: 'stop',
    fault: { cause: 'upstream-unavailable', diagnostic: 'd', upstreamStatus: '503' },
  }
  const retry: RetryDecision = {
    kind: 'retry',
    supplier,
    notBefore: '2026-10-17T00:00:00Z',
    basis: adoption,
  }
  const pending: RetryResolution = { kind: 'pending', position }
  const decided: RetryResolution = { kind: 'decided', position, decision: stop, source: evidence }
  // @ts-expect-error a decided resolution names its evidence
  const noSource: RetryResolution = { kind: 'decided', position, decision: stop }
  void [plan, retry, pending, decided, noSource]
})

it('RecoveryRecord holds the original request, the actor and the open work', () => {
  const record: RecoveryRecord = {
    state,
    request,
    capacity,
    initiator: { owner: 'o', subject: 's', revision: '1' },
    admission: operation,
    execution: null,
    retry: null,
    retryPosition: null,
    unresolved: [],
    tasks: ['execute', 'cleanup'],
  }
  // @ts-expect-error an unlisted task
  const task: RecoveryRecord['tasks'] = ['restart']
  void [record, task]
})

it('late facts are either an account or an actual termination of a known dispatch', () => {
  const facts: LateDispatchFact[] = [
    { kind: 'account', event: 'e', value: report },
    { kind: 'terminal', event: 'e', actual: { kind: 'completed', reason: 'stop' } },
  ]
  // @ts-expect-error a late fact is not a settlement
  const settled: LateDispatchFact = { kind: 'settlement', event: 'e' }
  void [facts, settled]
})

it('SendDemand and ModelRetryPolicy are implementable from the contract alone', () => {
  const demand: SendDemand<string> = {
    principal: 'p',
    tenant,
    call,
    execution,
    dispatch,
    request,
    supplier,
    consumer,
    initiator: { owner: 'o', subject: 's', revision: '1' },
  }
  const policy: ModelRetryPolicy<string> = {
    decide: async input => ({ ok: { kind: 'pending', position: input.position } }),
    inspect: async input => ({ ok: { kind: 'pending', position: input.position } }),
  }
  // @ts-expect-error the original actor is required
  const noInitiator: SendDemand<string> = { ...demand, initiator: undefined }
  void [demand, policy, noInitiator]
})

it('Publication and ModelClock name the registration and the instant as plain facts', () => {
  const publication: Publication = { execution, registration: 'r' }
  const clock: ModelClock = {
    now: () => '2026-10-17T00:00:00Z',
    waitUntil: async () => 'elapsed',
  }
  // @ts-expect-error a wait ends elapsed or cancelled
  const bad: Awaited<ReturnType<ModelClock['waitUntil']>> = 'timeout'
  void [publication, clock, bad]
})

it('a provider reports an account without the call and without the receipt', () => {
  const report: CallAccountReport = {
    usage: [],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'p',
    duration: { state: 'unknown' },
    revision: '1',
  }
  const withSubject: CallAccountReport = {
    ...report,
    // @ts-expect-error the runtime adds the subject when it keeps the account
    subject: { kind: 'model_call', id: 'c' },
  }
  // @ts-expect-error the runtime decides whether the account is late
  const withReceipt: CallAccountReport = { ...report, receipt: 'late' }
  expectTypeOf<keyof CallAccountReport>().toEqualTypeOf<
    'usage' | 'cost' | 'trimmed' | 'place' | 'duration' | 'revision'
  >()
  void [withSubject, withReceipt]
})

it('ProviderDiagnostic is the closed set of four diagnostics without a payload', () => {
  const diagnostics: ProviderDiagnostic[] = [
    { kind: 'replay-omitted', message: message.id, scope: 's', format: 'f', omittedParts: 1 },
    { kind: 'reasoning-disabled', reason: 'foreign-prefix' },
    { kind: 'reasoning-state-dropped', reason: 'payload-too-long', length: 9 },
    { kind: 'usage-inconsistent', field: 'completion_tokens' },
  ]
  expectTypeOf<ProviderDiagnostic['kind']>().toEqualTypeOf<
    'replay-omitted' | 'reasoning-disabled' | 'reasoning-state-dropped' | 'usage-inconsistent'
  >()
  const payload: ProviderDiagnostic = {
    kind: 'reasoning-state-dropped',
    reason: 'payload-too-long',
    length: 1,
    // @ts-expect-error a dropped state carries its length, never its payload
    payload: 'x',
  }
  void [diagnostics, payload]
})

it('TransportFact is the closed set of eight facts that a transport hands over', () => {
  const facts: TransportFact[] = [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'x' },
    { kind: 'block-replace', index: '0', value: 'x' },
    { kind: 'block-seal', index: '1', block: toolCall },
    { kind: 'block-seal', index: '2', block },
    { kind: 'trim', index: '0', removed: 'tail', reason: 'limit' },
    { kind: 'account', event: 'e', value: report },
    { kind: 'diagnostic', value: { kind: 'reasoning-disabled', reason: 'foreign-prefix' } },
    { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
  ]
  // @ts-expect-error a seal never carries a call whose arguments did not all arrive
  const open: TransportFact = { kind: 'block-seal', index: '1', block: incompleteCall }
  // @ts-expect-error a growing block is one of the four growing kinds
  const image: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'image' }
  // @ts-expect-error a delta carries text, not a snapshot
  const snapshot: TransportFact = { kind: 'block-delta', index: '0', value: 'x' }
  const managed: TransportFact = {
    kind: 'ended',
    // @ts-expect-error a transport reports a confirmed stop, not a managed control
    termination: { kind: 'interrupted', control: operation },
  }
  const settled: TransportFact = {
    // @ts-expect-error a transport knows no settlement
    kind: 'settled',
    termination: { kind: 'completed', reason: 'stop' },
  }
  void [facts, open, image, snapshot, managed, settled]
})

it('SendResult separates a started stream, a refused send and an unknown send', () => {
  const started: SendResult = {
    kind: 'started',
    window: 'receive-window',
    facts: (async function* (): AsyncGenerator<TransportFact> {})(),
  }
  const refused: SendResult = {
    kind: 'not-started',
    failure: { kind: 'stale-instance', instance },
  }
  const unknown: SendResult = { kind: 'unknown', dispatch, diagnostic: 'd' }
  // @ts-expect-error a started send carries its facts
  const noFacts: SendResult = { kind: 'started', window: 'receive-window' }
  // @ts-expect-error a started send carries its confirmed receive window
  const noWindow: SendResult = { kind: 'started', facts: started.facts }
  // @ts-expect-error an unknown send names its dispatch
  const noDispatch: SendResult = { kind: 'unknown', diagnostic: 'd' }
  // @ts-expect-error a bare sent flag is not a result
  const flag: SendResult = { kind: 'sent' }
  void [started, refused, unknown, noFacts, noWindow, noDispatch, flag]
})

declare const sendDemand: SendDemand<string>

it('an adapter can implement ModelSendBoundary from the contract alone', () => {
  const boundary: ModelSendBoundary<string> = {
    send: async () => ({
      kind: 'started',
      window: 'adapter-window',
      facts: (async function* (): AsyncGenerator<TransportFact> {})(),
    }),
  }
  expectTypeOf<ModelSendBoundary<string>['send']>().parameter(0).toEqualTypeOf<SendDemand<string>>()
  expectTypeOf<ModelSendBoundary<string>['send']>().returns.toEqualTypeOf<Promise<SendResult>>()
  // @ts-expect-error a send is cancelled through its signal
  void boundary.send(sendDemand)
})

it('IndependentModelFact adds the two ways an independent call can not start', () => {
  const facts: IndependentModelFact[] = [
    { kind: 'block-delta', index: '0', delta: 'x' },
    { kind: 'not-started', reason: 'cancelled' },
    { kind: 'not-started', reason: 'rejected', failure: { kind: 'denied', action: 'send' } },
  ]
  // @ts-expect-error a rejection names the failure
  const noFailure: IndependentModelFact = { kind: 'not-started', reason: 'rejected' }
  const provider: IndependentModelFact = {
    kind: 'not-started',
    reason: 'rejected',
    // @ts-expect-error a rejection carries a transport failure, not a provider fact
    failure: { kind: 'stale-instance', instance },
  }
  const cancelled: IndependentModelFact = {
    kind: 'not-started',
    reason: 'cancelled',
    // @ts-expect-error a cancellation carries no failure
    failure: { kind: 'denied', action: 'send' },
  }
  // @ts-expect-error an unlisted reason
  const timeout: IndependentModelFact = { kind: 'not-started', reason: 'timeout' }
  void [facts, noFailure, provider, cancelled, timeout]
})

const receipt: MaterializationReceipt = {
  supplier: adoption,
  representation: adoption,
  payloadDigest: 'd',
}

it('an adapter can implement the transport chain from prepare to the fact stream', () => {
  const materialized: MaterializedTransport = {
    receipt,
    start: () => (async function* (): AsyncGenerator<TransportFact> {})(),
    close: async () => {},
  }
  const prepared: PreparedTransport = {
    materialize: async () => ({ ok: materialized }),
    close: async () => {},
  }
  const transport: ModelTransport = { prepare: async () => ({ ok: prepared }) }
  void transport
  expectTypeOf<MaterializedTransport['receipt']>().toEqualTypeOf<MaterializationReceipt>()
  expectTypeOf<ModelTransport['prepare']>().parameters.toEqualTypeOf<
    [request: typeof request, supplier: typeof supplier, dispatch: TransportDispatch]
  >()
  const refused: PreparedTransport = {
    // @ts-expect-error materializing a refused send names a transport failure, not a provider fact
    materialize: async () => ({ error: { kind: 'commit-unknown', operation } }),
    close: async () => {},
  }
  // @ts-expect-error a materialized transport carries the receipt that records what was read
  const noReceipt: MaterializedTransport = { start: materialized.start, close: materialized.close }
  void [refused, noReceipt]
})

declare const commands: ModelCommands<string>
declare const otherRuntime: ModelRuntime<string>
declare const writeContext: WriteContext

it('ModelCommands writes with the generation and the expected revision, and reads without them', () => {
  const access = { principal: 'p', tenant, call } as const
  void commands.recordSend({ ...writeContext, dispatch, state: 'started' })
  // @ts-expect-error prepared is recorded by prepareDispatch, not by recordSend
  void commands.recordSend({ ...writeContext, dispatch, state: 'prepared' })
  // @ts-expect-error a settlement is written against the expected revision
  void commands.settle({
    ...execution,
    operation,
    termination: { kind: 'completed', reason: 'stop' },
  })
  void commands.advanceCleanup({ ...execution, operation })
  // @ts-expect-error cleanup is advanced by the current generation: no principal is accepted
  void commands.advanceCleanup({ ...access, instance, operation })
  void commands.claim({ ...access, instance, operation, continuity: evidence })
  // @ts-expect-error a claim carries the continuity evidence
  void commands.claim({ ...access, instance, operation })
  void commands.control({
    ...access,
    operation,
    // @ts-expect-error a control carries no reason
    reason: 'r',
  })
  expectTypeOf<ModelCommands<string>['preserve']>().returns.toEqualTypeOf<Reply<Snapshot>>()
  expectTypeOf<ModelCommands<string>['settle']>().returns.toEqualTypeOf<Reply<Settlement>>()
  expectTypeOf<ModelCommands<string>['recordMaterialization']>()
    .parameter(0)
    .toEqualTypeOf<
      WriteContext & Readonly<{ dispatch: typeof dispatch; receipt: MaterializationReceipt }>
    >()
  expectTypeOf<ModelCommands<string>['acquireRead']>()
    .parameter(0)
    .toEqualTypeOf<Mutation<string> & Readonly<{ result: ResultVersion }>>()
  expectTypeOf<ModelCommands<string>['nextRead']>()
    .parameter(0)
    .toEqualTypeOf<CallAccess<string> & Readonly<{ read: ReadId; after: string }>>()
  expectTypeOf<ModelCommands<string>['query']>().returns.toEqualTypeOf<
    Reply<CommitQuery<Readonly<{ revision: typeof revision }>>>
  >()
})

it('only the host publishes a live instance, and withdrawing needs the publication', () => {
  const host: ModelInstanceHost<string> = {
    schedule: async () => ({ ok: { queued: true } }),
    publish: async input => ({ ok: { execution: input, registration: 'r' } }),
    withdraw: async () => ({ ok: { removed: true } }),
    directory: { connect: async () => ({ ok: { kind: 'no-live-route' } }) },
  }
  expectTypeOf<ModelInstanceHost<string>['publish']>().parameters.toEqualTypeOf<
    [ExecutionRef, ModelHandle<string>]
  >()
  expectTypeOf<ModelInstanceHost<string>['withdraw']>().parameter(0).toEqualTypeOf<Publication>()
  // @ts-expect-error scheduling reports that work is queued, never that it ran
  const ran: ModelInstanceHost<string>['schedule'] = async () => ({ ok: { queued: false } })
  // @ts-expect-error publishing needs the execution identity, not a caller principal
  const forged: ModelInstanceHost<string>['publish'] = async (
    _input: CallAccess<string>,
    _handle: ModelHandle<string>,
  ) => ({ ok: { execution, registration: 'r' } })
  void [host, ran, forged]
})

it('a ModelProvider exposes the ordinary runtime and the operator entries, and no driver', () => {
  const provider: ModelProvider<string> = {
    runtime: {
      calls: {
        admit: commands.admit,
        inspect: input => {
          const resolved = resolveModelInvocationRef(input.reference, input.tenant)
          if ('failure' in resolved) throw new Error('bad fixture')
          return commands.recall({ principal: input.principal, ...resolved.ok })
        },
        dispatches: commands.dispatches,
        cancel: commands.control,
      },
      consumption: {
        beginRead: input => {
          const resolved = resolveModelInvocationRef(input.reference, input.tenant)
          if ('failure' in resolved) throw new Error('bad fixture')
          return commands.acquireRead({ ...input, ...resolved.ok })
        },
        readNext: commands.nextRead,
        closeRead: commands.endRead,
        acknowledge: commands.handoff,
      },
      instances: { connect: async () => ({ ok: { kind: 'no-live-route' } }) },
    },
    recover: async () => ({ ok: { scheduled: '0' } }),
    quiesce: async () => ({ ok: { pending: '0', running: '0' } }),
  }
  expectTypeOf<ModelProvider<string>['recover']>().parameter(0).toEqualTypeOf<Access<string>>()
  expectTypeOf<ModelProvider<string>['quiesce']>().parameters.toEqualTypeOf<[]>()
  // @ts-expect-error a provider hands out no driver
  void provider.driver
  // @ts-expect-error quiesce is a provider entry, not part of the ordinary runtime
  void provider.runtime.quiesce
  // @ts-expect-error the runtime part is fixed
  provider.runtime = otherRuntime
})
