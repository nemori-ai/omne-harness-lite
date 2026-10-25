// Compile-time checks of the public contract. Each `@ts-expect-error` names the diagnostic that
// the accepted types must produce. The cases come from the #342 type probes.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import { organizationCodec } from '@omne-harness/legal-identity'
import { expectTypeOf, it } from 'vitest'
import {
  decodeToolCallId,
  type AccountScope,
  type ControlDispatch,
  type IndependentToolScopeInput,
  type ToolAskRequest,
  type ToolCallId,
  type ToolExecutionContext,
  type ToolExecutorBinding,
  type ToolInstanceId,
  type ToolInvocationRef,
  type ToolInvokeRequest,
  type ToolOperationId,
  type ToolOperationRef,
  type ToolProcessUpdate,
  type ToolResultData,
  type ToolReleaseDeliveryOutcome,
  type ReleasedDelivery,
  type ToolReturnDeclaration,
  type ToolRuntime,
  type ToolState,
  type ToolTask,
  type ToolTerminal,
  type ToolWaitProtocolDefinition,
  type ToolWaitResponseValidator,
  type WaitState,
} from '@omne-harness/tool-contract'

type Principal = Readonly<{ user: string }>
declare const base: ToolState
declare const ask: Extract<WaitState, { kind: 'ask' }>
declare const call: ToolCallId
declare const instance: ToolInstanceId
declare const operation: ToolOperationId
declare const runtime: ToolRuntime<Principal, ContentBlock>
declare const invocationRef: ToolInvocationRef
declare const payload: ToolInvokeRequest
declare const operationRef: ToolOperationRef
declare const liveOnly: Extract<
  ToolExecutorBinding<Principal, ContentBlock, object>,
  { kind: 'live-only' }
>
declare const execution: ToolExecutionContext
declare const validator: ToolWaitResponseValidator<Principal>
declare const askRequest: ToolAskRequest
declare const background: Extract<ToolState, { phase: 'settled'; relation: 'background' }>

it('keeps branded identities apart', () => {
  // @ts-expect-error TS2322: 'ToolOperationId' is not assignable to type 'ToolCallId'.
  const wrong: ToolCallId = operation
  // @ts-expect-error TS2322: Type 'string' is not assignable to type 'ToolCallId'.
  const raw: ToolCallId = 'call_1'
  void wrong
  void raw
})

it('gives a decoded call text the call brand and no other brand', () => {
  const decoded = decodeToolCallId('call_1')
  if ('ok' in decoded) {
    expectTypeOf(decoded.ok).toEqualTypeOf<ToolCallId>()
    // @ts-expect-error TS2322: 'ToolCallId' is not assignable to type 'ToolOperationId'.
    const wrong: ToolOperationId = decoded.ok
    void wrong
  }
})

it('rejects no-response as the terminal of a background call', () => {
  const terminal: ToolTerminal = { kind: 'no-response', wait: ask.wait, reason: 'no reply' }
  // @ts-expect-error TS2322: Type '"no-response"' is not assignable to the background terminal kinds.
  const settled: ToolState = { ...background, terminal }
  void settled
})

it('allows an ask wait only on a foreground running call', () => {
  const foreground: ToolState = {
    ...base,
    phase: 'running',
    instance,
    relation: 'foreground',
    wait: ask,
  }
  // @ts-expect-error TS2322: The types of 'wait.kind' are incompatible: '"ask"' is not assignable to '"none"'.
  const backgroundWait: ToolState = {
    ...base,
    phase: 'running',
    instance,
    relation: 'background',
    wait: ask,
  }
  void foreground
  void backgroundWait
})

it('gives an Ask no deadline', () => {
  // @ts-expect-error TS2353: 'deadline' does not exist in the ask WaitState.
  const timedState: typeof ask = { ...ask, deadline: 'later' }
  // @ts-expect-error TS2353: 'deadline' does not exist in type ToolAskRequest.
  const timedRequest: ToolAskRequest = { ...askRequest, deadline: '2030-01-01T00:00:00Z' }
  const expiring: ToolWaitProtocolDefinition<JsonValue, 'ask'> = {
    ...askRequest.contract,
    // @ts-expect-error TS2322: Type '"supported"' is not assignable to type '"forbidden"'.
    expiry: 'supported',
  }
  void timedState
  void timedRequest
  void expiring
})

it('keeps provider operations out of consumer surfaces', () => {
  // @ts-expect-error TS2339: Property 'suspend' does not exist on a live-only binding.
  void liveOnly.suspend
  // @ts-expect-error TS2339: Property 'prepareStart' does not exist on type 'ToolRuntime'.
  void runtime.prepareStart
  // @ts-expect-error TS2339: Property 'finish' does not exist on type 'ToolExecutionContext'.
  void execution.finish
  // @ts-expect-error TS2339: Property 'acceptDecision' does not exist on type 'ToolWaitResponseValidator'.
  void validator.acceptDecision
})

it('keeps the internal admission and the flat call or operation methods out of the ordinary runtime', () => {
  // @ts-expect-error TS2339: Property 'admit' does not exist on type 'ToolRuntime'.
  void runtime.admit
  // @ts-expect-error TS2339: Property 'lookup' does not exist on type 'ToolRuntime'.
  void runtime.lookup
  // @ts-expect-error TS2339: Property 'queryOperation' does not exist on type 'ToolRuntime'.
  void runtime.queryOperation
  // @ts-expect-error TS2339: Property 'control' does not exist on type 'ToolRuntime'.
  void runtime.control
  // @ts-expect-error TS2339: Property 'acceptDecision' does not exist on type 'ToolRuntime'.
  void runtime.acceptDecision
  // @ts-expect-error TS2339: Property 'acceptResource' does not exist on type 'ToolRuntime'.
  void runtime.acceptResource
  // @ts-expect-error TS2339: Property 'readResult' does not exist on type 'ToolRuntime'.
  void runtime.readResult
  // @ts-expect-error TS2339: Property 'releaseDelivery' does not exist on type 'ToolRuntime'.
  void runtime.releaseDelivery
  // @ts-expect-error TS2339: Property 'account' does not exist on type 'ToolRuntime'.
  void runtime.account
})

it('keeps the invocation and operation reference brands apart, and both from plain text', () => {
  // @ts-expect-error TS2322: 'ToolOperationRef' is not assignable to type 'ToolInvocationRef'.
  const wrongInvocation: ToolInvocationRef = operationRef
  // @ts-expect-error TS2322: 'ToolInvocationRef' is not assignable to type 'ToolOperationRef'.
  const wrongOperation: ToolOperationRef = invocationRef
  // @ts-expect-error TS2322: Type 'string' is not assignable to type 'ToolInvocationRef'.
  const rawInvocation: ToolInvocationRef = '["tool-invocation",1]'
  // @ts-expect-error TS2322: Type 'string' is not assignable to type 'ToolOperationRef'.
  const rawOperation: ToolOperationRef = '["tool-operation",1]'
  void wrongInvocation
  void wrongOperation
  void rawInvocation
  void rawOperation
})

it('requires the record that each task or dispatch continues', () => {
  // @ts-expect-error TS2322: Property 'response' is missing in the answer task.
  const answer: ToolTask = { kind: 'answer', operation, state: 'pending', diagnostic: null }
  // @ts-expect-error TS2353: 'reason' does not exist in type 'ControlDispatch'.
  const stop: ControlDispatch = { reason: 'user' }
  void answer
  void stop
})

it('does not let an author choose a process sequence', () => {
  const update: ToolProcessUpdate = {
    kind: 'append-text',
    index: 'log',
    text: 'x',
    close: false,
    // @ts-expect-error TS2353: 'sequence' does not exist in the append-text update.
    sequence: '10',
  }
  void update
})

it('requires the program contract of returned data and of return declarations', () => {
  // @ts-expect-error TS2322: Properties 'contract' and 'schema' are missing in the json data.
  const data: ToolResultData = { kind: 'json', value: { kind: 'null' } }
  // @ts-expect-error TS2741: Property 'program' is missing in type ToolReturnDeclaration.
  const returns: ToolReturnDeclaration = { kind: 'ordinary' }
  void data
  void returns
})

it('requires explicit limits for an independent scope', () => {
  // @ts-expect-error TS2741: Property 'limits' is missing in type IndependentToolScopeInput.
  const input: IndependentToolScopeInput = {
    signal: AbortSignal.abort(),
    process: null,
    waits: null,
  }
  void input
  void call
})

it('ordinary payloads and commands cannot select trusted invocation sources or responses', () => {
  // @ts-expect-error TS2353: ordinary payloads do not carry an invocation.
  const sourced: ToolInvokeRequest = { ...payload, invocation: { kind: 'direct' } }
  // @ts-expect-error TS2353: ordinary payloads do not carry a call identity.
  const identified: ToolInvokeRequest = { ...payload, call }
  // @ts-expect-error TS2353: ordinary payloads do not carry an operation identity.
  const operated: ToolInvokeRequest = { ...payload, operation }
  // @ts-expect-error TS2339: trusted response submission is not an ordinary command.
  void runtime.commands.acceptDecision
  // @ts-expect-error TS2339: trusted response submission is not an ordinary command.
  void runtime.commands.acceptResource
  void sourced
  void identified
  void operated
})

it('a successful delivery release has no operation claim and cannot return a pending receipt', () => {
  type Released = Extract<ToolReleaseDeliveryOutcome, { kind: 'released' }>
  function declareReleaseShape(released: Released) {
    expectTypeOf(released.receipt).toEqualTypeOf<ReleasedDelivery>()
    // @ts-expect-error TS2339: a successful release does not expose this attempt's operation.
    void released.operation
    // @ts-expect-error TS2322: a released receipt cannot have the pending discriminant.
    const pending: ReleasedDelivery = { ...released.receipt, kind: 'pending' }
    void pending
  }
  void declareReleaseShape
})

it('an account scope names its organization with a minted OrganizationId', () => {
  const parsed = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
  if (!parsed.ok) throw new Error('fixture organization')
  const scope: AccountScope = { kind: 'organization', organization: parsed.value }
  const bare: AccountScope = {
    kind: 'organization',
    // @ts-expect-error an organization scope takes a minted OrganizationId, not bare text
    organization: 'org_0123456789abcdefghjkmnpqrs',
  }
  void scope
  void bare
})
