import { expectTypeOf, it } from 'vitest'
import type {
  CallState,
  CommitQuery,
  CompleteRequestBudget,
  DispatchPlan,
  ExecutionRef,
  LateDispatchFact,
  MaterializationReceipt,
  ModelClock,
  ModelMediaLease,
  ModelMediaReader,
  ModelRetryPolicy,
  ModelToolPayloadAdapter,
  Publication,
  RecoveryRecord,
  RequestBudget,
  RetryDecision,
  RetryPosition,
  RetryResolution,
  SendDemand,
  Termination,
  TransportFailure,
  TransportTermination,
  WriteContext,
} from '@omne-harness/model-contract'
import {
  account,
  adoption,
  budget,
  call,
  capacity,
  consumer,
  dispatch,
  evidence,
  instance,
  operation,
  reference,
  request,
  revision,
  supplier,
  tenant,
  tool,
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

it('a materialization receipt needs a complete budget', () => {
  expectTypeOf<CompleteRequestBudget>().toExtend<RequestBudget>()
  const complete: CompleteRequestBudget = { ...budget, kind: 'complete' }
  const receipt: MaterializationReceipt = {
    supplier: adoption,
    budget: complete,
    representation: adoption,
    payloadDigest: 'd',
  }
  const deferred: RequestBudget = { ...budget, kind: 'deferred-media', references: [reference] }
  // @ts-expect-error a deferred-media budget cannot be a receipt budget
  const incomplete: MaterializationReceipt = { ...receipt, budget: deferred }
  // @ts-expect-error a receipt names its payload digest
  const noDigest: MaterializationReceipt = {
    supplier: adoption,
    budget: complete,
    representation: adoption,
  }
  void [incomplete, noDigest]
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
    { kind: 'account', event: 'e', value: account },
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
