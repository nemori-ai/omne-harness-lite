// Compile-time checks of the public contract. Each `@ts-expect-error` names the diagnostic that
// the accepted types must produce. The cases come from the #342 type probes.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import { expectTypeOf, it } from 'vitest'
import {
  decodeToolCallId,
  type ControlDispatch,
  type IndependentToolScopeInput,
  type ToolAskRequest,
  type ToolCallId,
  type ToolExecutionContext,
  type ToolExecutorBinding,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolProcessUpdate,
  type ToolResultData,
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
