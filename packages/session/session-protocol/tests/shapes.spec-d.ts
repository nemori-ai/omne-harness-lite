// The contract keeps the shapes of the `session-public/1` family. The differences are the ones the
// card allows: `create-session` may leave `definition` out, and `defineProtocol` adds
// `protocol-rejected` to every operation (it adds `denied`, `basis-unavailable` and, for a commit,
// `unknown`; the old family already lists those).
import { expectTypeOf, test } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Codec,
  SessionOutcomes,
  SessionRequestBodies,
  SessionSuccessBodies,
} from '@omne-harness/public-contract'
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
/** Spreads an intersection into one object type, member by member of a union. */
type Flat<T> = T extends unknown ? { readonly [K in keyof T]: T[K] } : never
type Outcomes<N extends Name> = Operations[N]['outcomes']
type ResultBody<N extends Name, K extends keyof Outcomes<N>> = ValueOf<Outcomes<N>[K]>

/** The rule engine reads an empty object rule to `{}`; the old family names it `EmptyBody`. */
type Empty = Readonly<Record<string, never>>
type Limited = { readonly resource: 'pending-inputs' | 'input-bytes'; readonly limit: number }

test('the operations are exactly the seven of session/v1', () => {
  expectTypeOf<Name>().toEqualTypeOf<
    | 'create-session'
    | 'query-create-session'
    | 'send-input'
    | 'query-send-input'
    | 'read-history'
    | 'cancel-run'
    | 'stop-call'
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
  // The one success body that differs: the page also carries the pinned revision `upper`.
  expectTypeOf<ResultBody<'read-history', 'succeeded'>>().toEqualTypeOf<
    Flat<SessionSuccessBodies['read-history'] & { readonly upper: string }>
  >()
  expectTypeOf<ResultBody<'cancel-run', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['cancel-run']
  >()
  expectTypeOf<ResultBody<'stop-call', 'succeeded'>>().toEqualTypeOf<
    SessionSuccessBodies['stop-call']
  >()
  // An empty object rule reads to `{}`; the two types accept each other.
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
  type Expected<N extends Name> = SessionOutcomes[N] | 'protocol-rejected'
  expectTypeOf<Names<'create-session'>>().toEqualTypeOf<Expected<'create-session'>>()
  expectTypeOf<Names<'query-create-session'>>().toEqualTypeOf<Expected<'query-create-session'>>()
  expectTypeOf<Names<'send-input'>>().toEqualTypeOf<Expected<'send-input'>>()
  expectTypeOf<Names<'query-send-input'>>().toEqualTypeOf<Expected<'query-send-input'>>()
  expectTypeOf<Names<'read-history'>>().toEqualTypeOf<Expected<'read-history'>>()
  expectTypeOf<Names<'cancel-run'>>().toEqualTypeOf<Expected<'cancel-run'>>()
  expectTypeOf<Names<'stop-call'>>().toEqualTypeOf<Expected<'stop-call'>>()
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
