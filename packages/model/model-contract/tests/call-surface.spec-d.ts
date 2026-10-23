import type {
  ModelInvocationRef,
  ModelReferenceAccess,
  ModelOperationId,
} from '@omne-harness/model-contract'
import { expectTypeOf, it } from 'vitest'
import type {
  Access,
  CallAccess,
  CallState,
  CustodyState,
  DispatchRecord,
  GrowingContentKind,
  LiveRoute,
  ModelBlock,
  ModelCalls,
  ModelConsumption,
  ModelDirectory,
  ModelHandle,
  ModelRuntime,
  Mutation,
  Observation,
  ReadId,
  ReadStart,
  ReadState,
  Reply,
  ResultPage,
  ResultPart,
  ToolSuggestion,
  ResultTrim,
  ResultVersion,
  Settlement,
  Snapshot,
  VisibleBlock,
} from '@omne-harness/model-contract'
import {
  account,
  adoption,
  block,
  call,
  capacity,
  consumer,
  cursor,
  dispatch,
  evidence,
  incompleteCall,
  instance,
  message,
  operation,
  read,
  request,
  result,
  revision,
  supplier,
  tenant,
  toolCall,
} from './values.ts'

it('GrowingContentKind names the four content that may still grow', () => {
  expectTypeOf<GrowingContentKind>().toEqualTypeOf<
    'text' | 'thinking' | 'tool-arguments' | 'voice'
  >()
})

it('DispatchRecord keeps the send state and the cost apart', () => {
  const sent: DispatchRecord = {
    dispatch,
    supplier,
    intent: operation,
    send: 'started',
    firstContent: 'observed',
    terminal: null,
    account,
    materialization: null,
  }
  const prepared: DispatchRecord = { ...sent, send: 'prepared', account: null, terminal: null }
  const recorded: DispatchRecord = { ...sent, messages: [message.id] }
  // @ts-expect-error the message sequence holds identities, never content
  const copied: DispatchRecord = { ...sent, messages: [message] }
  // @ts-expect-error an unlisted send state
  const guessed: DispatchRecord = { ...sent, send: 'sent' }
  const { account: _omitted, ...withoutAccount } = sent
  // @ts-expect-error a missing cost is null, not absent
  const noAccount: DispatchRecord = withoutAccount
  void [prepared, recorded, copied, guessed, noAccount]
})

it('an adapter can implement ModelCalls from the contract alone', () => {
  const calls: ModelCalls<string> = {
    admit: async () => ({ ok: { call, revision, recovered: false, reference } }),
    inspect: async _unused => ({ ok: { kind: 'not-accepted', operation: operation } }),
    dispatches: async () => ({ ok: [] }),
    cancel: async () => ({ ok: { kind: 'none' } }),
  }
  void calls
  expectTypeOf<ModelCalls<string>['cancel']>().parameter(0).toEqualTypeOf<Mutation<string>>()
  expectTypeOf<ModelCalls<string>['dispatches']>().returns.toEqualTypeOf<
    Reply<readonly DispatchRecord[]>
  >()
  expectTypeOf<ModelCalls<string>['admit']>().parameter(0).toExtend<Mutation<string>>()
  expectTypeOf<ModelCalls<string>['inspect']>()
    .parameter(0)
    .toEqualTypeOf<ModelReferenceAccess<string>>()
})

declare const reference: ModelInvocationRef
declare const calls: ModelCalls<string>

it('cancel carries no reason and admit needs the tenant', () => {
  void calls.cancel({
    principal: 'p',
    tenant,
    call,
    operation,
    // @ts-expect-error a cancel carries no reason
    reason: 'user asked',
  })
  // @ts-expect-error the tenant is required
  void calls.admit({ principal: 'p', call, operation, request, consumer, capacity })
  void [adoption, evidence]
})

const state: CallState = {
  call,
  revision,
  consumer,
  control: { kind: 'none' },
  custody: { kind: 'producer' },
  phase: 'accepted',
}
const settlement: Settlement = {
  version: result,
  termination: { kind: 'completed', reason: 'stop' },
  cursor,
  source: evidence,
}
const acknowledged: Extract<CustodyState, { kind: 'acknowledged' }> = {
  kind: 'acknowledged',
  operation,
  receipt: evidence,
  cleanup: 'pending',
  diagnostic: null,
}
const snapshot: Snapshot = { call, cursor, blocks: [], state }

it('VisibleBlock keeps a sealed block apart from a growing value', () => {
  const sealed: VisibleBlock = { kind: 'sealed', index: '0', block: toolCall }
  const growing: VisibleBlock = {
    kind: 'growing',
    index: '1',
    mode: 'append',
    content: 'tool-arguments',
    value: '{"a":',
  }
  // @ts-expect-error a sealed block never carries a call that is still arriving
  const open: VisibleBlock = { kind: 'sealed', index: '0', block: incompleteCall }
  // @ts-expect-error a growing value is text of one of the four growing kinds
  const image: VisibleBlock = { ...growing, content: 'image' }
  // @ts-expect-error the growth mode is append or replace
  const mode: VisibleBlock = { ...growing, mode: 'prepend' }
  // @ts-expect-error the index is the text of an ordinal, not a number
  const index: VisibleBlock = { kind: 'sealed', index: 0, block }
  void [sealed, growing, open, image, mode, index]
})

it('Snapshot hands out a read-only list of visible blocks', () => {
  // @ts-expect-error a consumer cannot mutate the blocks of a snapshot
  const writable: VisibleBlock[] = snapshot.blocks
  // @ts-expect-error a snapshot names its state
  const noState: Snapshot = { call, cursor, blocks: [] }
  void [writable, noState]
  expectTypeOf<Snapshot['state']>().toEqualTypeOf<CallState>()
  expectTypeOf<Snapshot['blocks']>().toEqualTypeOf<readonly VisibleBlock[]>()
})

it('Observation separates a state view from the end of observing', () => {
  const seen: Observation[] = [
    { kind: 'snapshot', value: snapshot },
    { kind: 'changed', value: snapshot },
    { kind: 'ended', reason: 'stale-instance' },
  ]
  // @ts-expect-error an end names a reason and carries no snapshot
  const endedWithValue: Observation = { kind: 'ended', reason: 'denied', value: snapshot }
  // @ts-expect-error an unlisted end reason
  const reason: Observation = { kind: 'ended', reason: 'settled' }
  // @ts-expect-error a snapshot without a value
  const empty: Observation = { kind: 'snapshot' }
  void [seen, endedWithValue, reason, empty]
})

it('ResultPage keeps read-only sealed or partial parts with the actual settlement', () => {
  const page: ResultPage = {
    parts: [block, toolCall].map(block => ({ kind: 'sealed', block, trims: [] })),
    next: null,
    settlement,
  }
  expectTypeOf(page.parts).toEqualTypeOf<readonly ResultPart[]>()
  expectTypeOf(incompleteCall).not.toExtend<
    Extract<ResultPage['parts'][number], { kind: 'sealed' }>['block']
  >()
  // @ts-expect-error a page without a settlement
  const unsettled: ResultPage = { parts: [], next: null }
  expectTypeOf<ResultPage['parts']>().not.toExtend<ResultPart[]>()
  void unsettled
  const partial: Extract<ResultPart, { kind: 'partial' }> = {
    kind: 'partial',
    content: 'tool-arguments',
    value: '{}',
    trims: [],
  }
  expectTypeOf(partial).not.toExtend<ModelBlock>()
  expectTypeOf(partial).not.toExtend<Extract<ModelBlock, { kind: 'tool_call' }>>()
  expectTypeOf<ResultPart>().not.toExtend<ModelBlock>()
  expectTypeOf<ResultPart>().not.toExtend<ToolSuggestion>()
  expectTypeOf<ResultTrim>().toEqualTypeOf<Readonly<{ removed: string; reason: string }>>()
  expectTypeOf<ResultPage['next']>().toEqualTypeOf<string | null>()
})

it('ReadState and ReadStart tie a read to a page, or to the custody that already took the result', () => {
  const page: ResultPage = { parts: [], next: 'n', settlement }
  const reading: ReadState = { kind: 'reading', page }
  const ended: ReadState = { kind: 'ended', reason: 'owner-lost' }
  const started: ReadStart = { kind: 'started', read, value: reading }
  const taken: ReadStart = { kind: 'acknowledged', custody: acknowledged }
  // @ts-expect-error a reading state carries its page
  const noPage: ReadState = { kind: 'reading' }
  // @ts-expect-error an unlisted end reason
  const reason: ReadState = { kind: 'ended', reason: 'saved' }
  // @ts-expect-error an acknowledged start carries the acknowledged custody, not the producer
  const producer: ReadStart = { kind: 'acknowledged', custody: { kind: 'producer' } }
  // @ts-expect-error a started read names its read id
  const noRead: ReadStart = { kind: 'started', value: reading }
  void [ended, started, taken, noPage, reason, producer, noRead]
})

const observed: Observation = { kind: 'ended', reason: 'observer-closed' }

it('a ModelHandle names its instance and observes only for an authorized tenant', () => {
  const handle: ModelHandle<string> = {
    instance,
    observe: () =>
      (async function* () {
        yield observed
      })(),
  }
  expectTypeOf<ModelHandle<string>['observe']>()
    .parameter(0)
    .toEqualTypeOf<Access<string> & Readonly<{ signal: AbortSignal }>>()
  expectTypeOf<ModelHandle<string>['observe']>().returns.toEqualTypeOf<AsyncIterable<Observation>>()
  const signal = new AbortController().signal
  // @ts-expect-error observing needs the tenant
  void handle.observe({ principal: 'p', signal })
  // @ts-expect-error an observer is cancelled through its signal, not left open
  void handle.observe({ principal: 'p', tenant })
  // @ts-expect-error the instance is fixed by the handle
  handle.instance = instance
  // @ts-expect-error a call id is not an instance id
  const mixed: ModelHandle<string> = { ...handle, instance: call }
  void mixed
})

it('LiveRoute either carries the handle or says there is no live route', () => {
  const handle: ModelHandle<string> = { instance, observe: () => (async function* () {})() }
  const routes: LiveRoute<string>[] = [{ kind: 'live', handle }, { kind: 'no-live-route' }]
  // @ts-expect-error a live route carries its handle
  const noHandle: LiveRoute<string> = { kind: 'live' }
  // @ts-expect-error no route means no handle
  const stray: LiveRoute<string> = { kind: 'no-live-route', handle }
  void [routes, noHandle, stray]
})

it('an adapter can implement ModelConsumption and ModelDirectory from the contract alone', () => {
  const consumption: ModelConsumption<string> = {
    beginRead: async () => ({ ok: { kind: 'acknowledged', custody: acknowledged } }),
    readNext: async () => ({ ok: { kind: 'ended', reason: 'complete' } }),
    closeRead: async () => ({ ok: { kind: 'ended', reason: 'closed' } }),
    acknowledge: async input => ({
      ok: { call: input.call, result: input.result, custody: acknowledged },
    }),
  }
  const directory: ModelDirectory<string> = {
    connect: async () => ({ ok: { kind: 'no-live-route' } }),
  }
  void [consumption, directory]
  expectTypeOf<ModelConsumption<string>['beginRead']>()
    .parameter(0)
    .toEqualTypeOf<
      ModelReferenceAccess<string> &
        Readonly<{ operation: ModelOperationId; result: ResultVersion }>
    >()
  expectTypeOf<ModelConsumption<string>['beginRead']>().returns.toEqualTypeOf<Reply<ReadStart>>()
  expectTypeOf<ModelConsumption<string>['readNext']>()
    .parameter(0)
    .toEqualTypeOf<CallAccess<string> & Readonly<{ read: ReadId; after: string }>>()
  expectTypeOf<ModelDirectory<string>['connect']>().returns.toEqualTypeOf<
    Reply<LiveRoute<string>>
  >()
})

declare const consumption: ModelConsumption<string>
declare const directory: ModelDirectory<string>

it('reading needs the read id and the cursor, and connecting needs the call', () => {
  // @ts-expect-error a read continues after a cursor
  void consumption.readNext({ principal: 'p', tenant, call, read })
  // @ts-expect-error closing a read names the read
  void consumption.closeRead({ principal: 'p', tenant, call })
  // @ts-expect-error beginning a read is a mutation: it carries an operation
  void consumption.beginRead({ principal: 'p', tenant, call, result })
  // @ts-expect-error a connection names the call
  void directory.connect({ principal: 'p', tenant })
})

it('the ordinary runtime has no driver, no publication and no replaceable parts', () => {
  const runtime: ModelRuntime<string> = {
    calls: {
      admit: calls.admit,
      inspect: calls.inspect,
      dispatches: calls.dispatches,
      cancel: calls.cancel,
    },
    consumption,
    instances: directory,
  }
  // @ts-expect-error the runtime parts are fixed
  runtime.calls = calls
  // @ts-expect-error an ordinary consumer has no driver
  void runtime.driver
  // @ts-expect-error an ordinary consumer cannot publish an instance
  void runtime.instances.publish
  expectTypeOf<ModelRuntime<string>>().toEqualTypeOf<
    Readonly<{
      calls: ModelCalls<string>
      consumption: ModelConsumption<string>
      instances: ModelDirectory<string>
    }>
  >()
})

it('requires invocation references at ordinary boundaries and keeps read operations separate', () => {
  void calls.inspect({ principal: 'p', tenant, reference })
  void directory.connect({ principal: 'p', tenant, reference })
  void consumption.beginRead({ principal: 'p', tenant, reference, operation, result })
  // @ts-expect-error The old call/admission input no longer exists.
  void calls.inspect({ principal: 'p', tenant, call, admission: operation })
  // @ts-expect-error The provider directory's call identity is not a public connection input.
  void directory.connect({ principal: 'p', tenant, call })
  // @ts-expect-error A read requires its independent operation.
  void consumption.beginRead({ principal: 'p', tenant, reference, result })
})
