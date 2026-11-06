// The additive shapes of the 2026-07-28 write-back: optional fields and the new port members.
// Each check compiles only when the contract accepts the shape that SPEC names.
import { expectTypeOf, test } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import type {
  ActionDiscovery,
  CallOutcome,
  ContinueRequest,
  EndpointRef,
  McpClock,
  McpPorts,
  Millis,
  OutputValidator,
  RequestState,
  TaskReport,
  Untrusted,
} from '@omne-harness/mcp-contract'
import type { CallRequest, ListingPage, WithheldReason } from '@omne-harness/mcp-contract/provider'

type Principal = Readonly<{ id: string }>

test('a continuation may carry the request state alone (item 15)', () => {
  expectTypeOf<Extract<CallRequest['continuation'], object>>().toMatchTypeOf<
    Readonly<{ requestState?: RequestState; inputResponses?: JsonValue }>
  >()
  const continuation: CallRequest['continuation'] = { requestState: '' as RequestState }
  expectTypeOf(continuation).toMatchTypeOf<CallRequest['continuation']>()
})

test('the refresh request takes an abort signal of its own (item 1)', () => {
  type Request = Parameters<ActionDiscovery<Principal>['refresh']>[1]
  expectTypeOf<Request>().toEqualTypeOf<
    Readonly<{ ref: EndpointRef; connectBound?: Millis; signal?: AbortSignal }>
  >()
  expectTypeOf<Parameters<ActionDiscovery<Principal>['refresh']>[0]>().toEqualTypeOf<
    Access<Principal>
  >()
})

test('the ports take an optional clock that answers the present instant (item 2)', () => {
  expectTypeOf<McpPorts<Principal, string>['clock']>().toEqualTypeOf<McpClock | undefined>()
  expectTypeOf<ReturnType<McpClock['now']>>().toEqualTypeOf<Date>()
})

test('a listing page lists the tools the transport withheld (item 8)', () => {
  expectTypeOf<ListingPage['withheld']>().toEqualTypeOf<
    readonly Readonly<{ name: Untrusted<string>; reason: WithheldReason }>[] | undefined
  >()
  expectTypeOf<WithheldReason>().toEqualTypeOf<'header-invalid'>()
})

test('a task report and a task outcome carry the three optional task hints (item 12)', () => {
  expectTypeOf<TaskReport['pollIntervalMs']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<TaskReport['ttlMs']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<TaskReport['statusMessage']>().toEqualTypeOf<Untrusted<string> | undefined>()
  type Task = Extract<CallOutcome, { kind: 'task' }>
  expectTypeOf<Task['pollIntervalMs']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<Task['ttlMs']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<Task['statusMessage']>().toEqualTypeOf<Untrusted<string> | undefined>()
})

test('a continue request may carry the request state alone (S2)', () => {
  expectTypeOf<ContinueRequest['inputResponses']>().toEqualTypeOf<JsonValue | undefined>()
  expectTypeOf<ContinueRequest['requestState']>().toEqualTypeOf<RequestState | undefined>()
})

test('the ports take the output validator that classifyOutcome is given (S3, O1)', () => {
  expectTypeOf<McpPorts<Principal, string>['checkOutput']>().toEqualTypeOf<OutputValidator>()
  // @ts-expect-error the output validator is required: without it no output check is honest
  const ports: Pick<McpPorts<Principal, string>, 'checkOutput'> = {}
  void ports
})
