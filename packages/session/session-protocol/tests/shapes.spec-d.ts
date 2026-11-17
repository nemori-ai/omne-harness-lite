import { expectTypeOf, test } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { Codec, RuleValue, TenantId } from '@omne-harness/public-contract'
import {
  sessionProtocol,
  type ObserveSessionFrame,
  type ObserveSessionOpen,
  type SessionProtocol,
} from '@omne-harness/session-protocol'

type Operations = SessionProtocol['operations']
type Name = keyof Operations
type ValueOf<C> = C extends Codec<infer T> ? T : never
type BodyOf<N extends Name> = Operations[N] extends { readonly body: infer B } ? ValueOf<B> : never
type Flat<T> = T extends unknown ? { readonly [K in keyof T]: T[K] } : never
type Outcomes<N extends Name> = Operations[N]['outcomes']
type ResultBody<N extends Name, K extends keyof Outcomes<N>> = ValueOf<Outcomes<N>[K]>

type Empty = Readonly<Record<string, never>>
type Instant = RuleValue<{ readonly kind: 'instant' }>
type Limited = { readonly resource: 'pending-inputs' | 'input-bytes'; readonly limit: number }

type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>
type Target = { readonly tenant: TenantId; readonly session: string }
type ProducerRef = { readonly kind: 'model' | 'tool'; readonly call: string }
type TerminalSource = {
  readonly owner: string
  readonly record: string
  readonly revision: string
  readonly digest: string
}

type SessionRequestBodies = {
  'create-session': {
    readonly createCallId: string
    readonly definition: string
    readonly purpose: string
  }
  'query-create-session': { readonly tenant: TenantId; readonly createCallId: string }
  'send-input': Target & {
    readonly acceptId: string
    readonly inputId: string
    readonly message: JsonObject
  }
  'query-send-input': Target & { readonly acceptId: string }
  'read-history':
    | (Target & {
        readonly cursor: null
        readonly direction: 'forward' | 'backward'
        readonly pageBytes: string
      })
    | (Target & { readonly cursor: string })
  'cancel-run': Target & {
    readonly controlId: string
    readonly run: string
    readonly urgency: 'graceful' | 'force'
  }
  'stop-call': Target & {
    readonly controlId: string
    readonly producer: ProducerRef
    readonly reason?: string | null
  }
}

type SessionSuccessBodies = {
  'create-session': { readonly session: string; readonly recovered: boolean }
  'query-create-session': { readonly session: string }
  'send-input': { readonly recovered: boolean }
  'query-send-input': Empty
  'read-history': {
    readonly entries: readonly {
      readonly entryId: string
      readonly revision: string
      readonly kind: string
      readonly payload: JsonValue
    }[]
    readonly next: string | null
    readonly exhausted: boolean
    readonly scannedThrough: string
  }
  'cancel-run':
    | { readonly kind: 'requested'; readonly controlId: string; readonly run: string }
    | {
        readonly kind: 'ended'
        readonly controlId: string
        readonly run: string
        readonly terminal: {
          readonly outcome: 'completed' | 'failed' | 'cancelled'
          readonly source: TerminalSource
        }
      }
  'stop-call':
    | { readonly kind: 'requested'; readonly controlId: string; readonly producer: ProducerRef }
    | {
        readonly kind: 'ended'
        readonly controlId: string
        readonly producer: ProducerRef
        readonly terminal: {
          readonly version: string
          readonly outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response'
          readonly source: TerminalSource
        }
      }
}

type SessionOutcomes = {
  'create-session':
    | 'limited'
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
  'query-create-session': 'succeeded' | 'denied' | 'basis-unavailable' | 'unknown'
  'send-input':
    | 'limited'
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'archived'
    | 'frozen'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
  'query-send-input': 'succeeded' | 'not-committed' | 'denied' | 'basis-unavailable' | 'unknown'
  'read-history': 'succeeded' | 'denied' | 'invalid' | 'basis-unavailable'
  'cancel-run':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'not-found'
    | 'basis-unavailable'
    | 'unknown'
  'stop-call':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'not-found'
    | 'basis-unavailable'
    | 'unknown'
    | 'unsupported'
}

test('the operations are exactly the thirteen of session/v1', () => {
  expectTypeOf<Name>().toEqualTypeOf<
    | 'create-session'
    | 'query-create-session'
    | 'send-input'
    | 'interrupt-input'
    | 'query-send-input'
    | 'read-history'
    | 'read-waiting'
    | 'list-sessions'
    | 'cancel-run'
    | 'stop-call'
    | 'retry-run'
    | 'background-call'
    | 'list-background-calls'
  >()
  expectTypeOf<keyof SessionProtocol['observations']>().toEqualTypeOf<'observe-session'>()
  expectTypeOf(sessionProtocol.name).toEqualTypeOf<'session'>()
  expectTypeOf(sessionProtocol.major).toEqualTypeOf<1>()
})

test('each body is the old request body', () => {
  expectTypeOf<BodyOf<'query-create-session'>>().toEqualTypeOf<
    SessionRequestBodies['query-create-session']
  >()
  expectTypeOf<BodyOf<'send-input'>>().toEqualTypeOf<Flat<SessionRequestBodies['send-input']>>()
  expectTypeOf<BodyOf<'query-send-input'>>().toEqualTypeOf<
    Flat<SessionRequestBodies['query-send-input']>
  >()
  expectTypeOf<BodyOf<'read-history'>>().toEqualTypeOf<Flat<SessionRequestBodies['read-history']>>()
  expectTypeOf<BodyOf<'cancel-run'>>().toEqualTypeOf<Flat<SessionRequestBodies['cancel-run']>>()
  expectTypeOf<BodyOf<'stop-call'>>().toEqualTypeOf<Flat<SessionRequestBodies['stop-call']>>()
})

test('list-sessions has a body and a success body of its own, and `invalid` is empty', () => {
  expectTypeOf<BodyOf<'list-sessions'>>().toEqualTypeOf<{
    readonly tenant: TenantId
    readonly cursor: string | null
    readonly limit?: number
    readonly includeArchived?: boolean
  }>()
  expectTypeOf<ResultBody<'list-sessions', 'succeeded'>>().toEqualTypeOf<{
    readonly sessions: readonly {
      readonly session: string
      readonly createdAt: Instant | null
      readonly lastActivityAt: Instant | null
      readonly lifecycle: 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived'
      readonly title: string | null
    }[]
    readonly next: string | null
    readonly completeness: 'complete' | 'partial'
  }>()
  expectTypeOf<ResultBody<'list-sessions', 'invalid'>>().toExtend<Empty>()
  expectTypeOf<Outcomes<'list-sessions'>['denied']>().toEqualTypeOf<true>()
  expectTypeOf<Outcomes<'list-sessions'>['basis-unavailable']>().toEqualTypeOf<true>()
})

test('create-session differs only in that definition may be left out', () => {
  expectTypeOf<BodyOf<'create-session'>>().toEqualTypeOf<
    Flat<
      Omit<SessionRequestBodies['create-session'], 'definition'> & {
        readonly definition?: string
      }
    >
  >()
})

test('each succeeded body is the old success body', () => {
  expectTypeOf<ResultBody<'create-session', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['create-session']
  >()
  expectTypeOf<ResultBody<'query-create-session', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['query-create-session']
  >()
  expectTypeOf<ResultBody<'send-input', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['send-input']
  >()
  expectTypeOf<ResultBody<'read-history', 'succeeded'>>().toEqualTypeOf<
    Flat<SessionSuccessBodies['read-history'] & { readonly upper: string }>
  >()
  expectTypeOf<ResultBody<'cancel-run', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['cancel-run']
  >()
  expectTypeOf<ResultBody<'stop-call', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['stop-call']
  >()
  expectTypeOf<ResultBody<'query-send-input', 'succeeded'>>().toExtend<
    SessionSuccessBodies['query-send-input']
  >()
  expectTypeOf<SessionSuccessBodies['query-send-input']>().toExtend<
    ResultBody<'query-send-input', 'succeeded'>
  >()
})

test('limited carries the resource and its limit; the other non-fixed outcomes are empty', () => {
  expectTypeOf<ResultBody<'create-session', 'limited'>>().toEqualTypeOf<Limited>()
  expectTypeOf<ResultBody<'send-input', 'limited'>>().toEqualTypeOf<Limited>()
  expectTypeOf<ResultBody<'create-session', 'invalid'>>().toExtend<Empty>()
  expectTypeOf<ResultBody<'send-input', 'frozen'>>().toExtend<Empty>()
  expectTypeOf<ResultBody<'query-send-input', 'not-committed'>>().toExtend<Empty>()
  expectTypeOf<ResultBody<'stop-call', 'unsupported'>>().toExtend<Empty>()
  expectTypeOf<ResultBody<'cancel-run', 'not-found'>>().toExtend<Empty>()
})

test('the outcome names are the old ones plus protocol-rejected', () => {
  type Names<N extends Name> = keyof Outcomes<N>
  type Expected<N extends keyof SessionOutcomes> = SessionOutcomes[N] | 'protocol-rejected'
  expectTypeOf<Names<'create-session'>>().toEqualTypeOf<Expected<'create-session'>>()
  expectTypeOf<Names<'query-create-session'>>().toEqualTypeOf<Expected<'query-create-session'>>()
  expectTypeOf<Names<'send-input'>>().toEqualTypeOf<Expected<'send-input'>>()
  expectTypeOf<Names<'query-send-input'>>().toEqualTypeOf<Expected<'query-send-input'>>()
  expectTypeOf<Names<'read-history'>>().toEqualTypeOf<Expected<'read-history'>>()
  expectTypeOf<Names<'cancel-run'>>().toEqualTypeOf<Expected<'cancel-run'>>()
  expectTypeOf<Names<'stop-call'>>().toEqualTypeOf<Expected<'stop-call'>>()
  expectTypeOf<Names<'list-sessions'>>().toEqualTypeOf<
    'succeeded' | 'invalid' | 'denied' | 'basis-unavailable' | 'protocol-rejected'
  >()
  expectTypeOf<Names<'retry-run'>>().toEqualTypeOf<
    | 'succeeded'
    | 'invalid'
    | 'archived'
    | 'frozen'
    | 'not-found'
    | 'no-change'
    | 'conflict'
    | 'unknown'
    | 'denied'
    | 'basis-unavailable'
    | 'protocol-rejected'
  >()
  expectTypeOf<ResultBody<'retry-run', 'succeeded'>>().toEqualTypeOf<{
    readonly recovered: boolean
  }>()
  expectTypeOf<Names<'read-waiting'>>().toEqualTypeOf<
    'succeeded' | 'invalid' | 'denied' | 'basis-unavailable' | 'protocol-rejected'
  >()
})

test('read-waiting names a session and answers the waiting Run, the pending count and the cause', () => {
  expectTypeOf<BodyOf<'read-waiting'>>().toEqualTypeOf<{
    readonly tenant: TenantId
    readonly session: string
  }>()
  expectTypeOf<ResultBody<'read-waiting', 'succeeded'>>().toEqualTypeOf<{
    readonly waiting: {
      readonly run: string
      readonly pending: number
      readonly cause: { readonly kind: string; readonly detail: string | null } | null
    } | null
  }>()
  expectTypeOf<ResultBody<'read-waiting', 'invalid'>>().toExtend<Empty>()
})

test('fixed outcomes are declared as true, so their body is always empty', () => {
  expectTypeOf<Outcomes<'create-session'>['denied']>().toEqualTypeOf<true>()
  expectTypeOf<Outcomes<'create-session'>['unknown']>().toEqualTypeOf<true>()
  expectTypeOf<Outcomes<'query-create-session'>['unknown']>().toEqualTypeOf<true>()
  expectTypeOf<Outcomes<'query-send-input'>['unknown']>().toEqualTypeOf<true>()
  expectTypeOf<Outcomes<'read-history'>['basis-unavailable']>().toEqualTypeOf<true>()
})

test('observe-session opens on a tenant and a session and has five frame kinds', () => {
  type Observation = SessionProtocol['observations']['observe-session']
  expectTypeOf<Observation['identity']>().toEqualTypeOf<'login'>()
  expectTypeOf<Observation['ends']>().toEqualTypeOf<readonly ['refresh-exhausted']>()
  expectTypeOf<ObserveSessionOpen>().toEqualTypeOf<
    Pick<SessionRequestBodies['query-send-input'], 'tenant' | 'session'>
  >()
  expectTypeOf<ObserveSessionFrame['kind']>().toEqualTypeOf<
    'state' | 'snapshot' | 'delta' | 'gap' | 'refreshing'
  >()
  expectTypeOf<ObserveSessionFrame>().toEqualTypeOf<
    | {
        readonly kind: 'state'
        readonly run: string | null
        readonly revision: string
        readonly phase: string | null
        readonly target: { readonly projection: 'model-output-v1' } | null
      }
    | {
        readonly kind: 'snapshot'
        readonly projection: 'model-output-v1'
        readonly value: JsonValue
      }
    | { readonly kind: 'delta'; readonly projection: 'model-output-v1'; readonly value: JsonValue }
    | { readonly kind: 'gap'; readonly reason: 'buffer' | 'source-history' }
    | { readonly kind: 'refreshing' }
  >()
  expectTypeOf<ValueOf<Observation['frame']>>().toEqualTypeOf<ObserveSessionFrame>()
})

test('background-call names one Tool call and answers requested or background', () => {
  type ToolCall = { readonly kind: 'tool'; readonly call: string }
  expectTypeOf<BodyOf<'background-call'>>().toEqualTypeOf<
    Flat<Target & { readonly controlId: string; readonly producer: ToolCall }>
  >()
  expectTypeOf<ResultBody<'background-call', 'succeeded'>>().toEqualTypeOf<{
    readonly kind: 'requested' | 'background'
    readonly controlId: string
    readonly producer: ToolCall
  }>()
  expectTypeOf<ResultBody<'list-background-calls', 'succeeded'>>().toEqualTypeOf<{
    readonly calls: readonly {
      readonly id: string
      readonly producer: ToolCall
      readonly label: {
        readonly intent: string | null
        readonly tool: string
        readonly command: string | null
        readonly preview: string
      }
      readonly source: 'launched' | 'control' | 'threshold' | 'foreground-limit'
      readonly status: 'queued' | 'running' | 'ended-pending' | 'stopping' | 'unknown'
      readonly stop: {
        readonly initiator: 'user' | 'agent' | 'system'
        readonly reason: string | null
        readonly progress: 'requested' | 'accepted' | 'proven'
      } | null
      readonly lastLine: string | null
    }[]
  }>()
})
