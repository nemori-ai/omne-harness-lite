import type { TenantId } from '@omne-harness/legal-identity'
import { expectTypeOf, test } from 'vitest'
import {
  encodeSessionRequest,
  encodeSessionResponse,
  type SessionOutcomes,
  type SessionRequest,
  type SessionRequestBodies,
  type SessionResponse,
  type SessionResponseEncodeInput,
  type SessionSuccessBodies,
} from '@omne-harness/public-contract'

declare const tenant: TenantId
/** Flattens an intersection so the exact-shape comparison does not see how it was composed. */
type Flat<T> = { [K in keyof T]: T[K] }
const limits = {
  maxBytes: 1000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 10,
  maxStringLength: 100,
  maxNumberLength: 10,
}
const session = '0'.repeat(64)
const proof = { kind: 'present', value: 'p' } as const
const source = { owner: 'o', record: 'r', revision: '1', digest: 'd' }

test('the interruption outcome sets are closed and only stop-call can be unsupported', () => {
  expectTypeOf<SessionOutcomes['cancel-run']>().toEqualTypeOf<
    'succeeded' | 'denied' | 'invalid' | 'conflict' | 'not-found' | 'basis-unavailable' | 'unknown'
  >()
  expectTypeOf<SessionOutcomes['stop-call']>().toEqualTypeOf<
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'conflict'
    | 'not-found'
    | 'basis-unavailable'
    | 'unknown'
    | 'unsupported'
  >()
})

test('the request bodies are exactly the wire bodies', () => {
  expectTypeOf<Flat<SessionRequestBodies['cancel-run']>>().toEqualTypeOf<{
    readonly tenant: TenantId
    readonly session: string
    readonly controlId: string
    readonly run: string
    readonly urgency: 'graceful' | 'force'
  }>()
  expectTypeOf<Flat<SessionRequestBodies['stop-call']>>().toEqualTypeOf<{
    readonly tenant: TenantId
    readonly session: string
    readonly controlId: string
    readonly producer: { readonly kind: 'model' | 'tool'; readonly call: string }
  }>()
})

test('the interruption requests carry a proof and never actingTenant', () => {
  const cancel: SessionRequest<'cancel-run'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    operation: 'cancel-run',
    proof,
    body: { tenant, session, controlId: 'c', run: 'r', urgency: 'force' },
  }
  expectTypeOf(encodeSessionRequest({ request: cancel, limits }).kind).toEqualTypeOf<
    'encoded' | 'invalid'
  >()
  // @ts-expect-error Only create-session carries actingTenant.
  const acting: SessionRequest<'cancel-run'> = { ...cancel, actingTenant: tenant }
  void acting
  // @ts-expect-error The urgency is closed.
  const urgent: SessionRequest<'cancel-run'>['body'] = { ...cancel.body, urgency: 'soon' }
  void urgent
  // @ts-expect-error The client does not fill a login.
  const login: SessionRequest<'cancel-run'>['body'] = { ...cancel.body, login: 'l' }
  void login
  const stop: SessionRequest<'stop-call'>['body'] = {
    tenant,
    session,
    controlId: 'c',
    producer: { kind: 'tool', call: 'x' },
  }
  void stop
  const agent: SessionRequest<'stop-call'>['body'] = {
    ...stop,
    // @ts-expect-error The producer kind is closed.
    producer: { kind: 'agent', call: 'x' },
  }
  void agent
  // @ts-expect-error stop-call takes a producer, not a run.
  const run: SessionRequest<'stop-call'>['body'] = { ...stop, run: 'r' }
  void run
})

test('the succeeded bodies are two exclusive branches per operation', () => {
  type Producer = { readonly kind: 'model' | 'tool'; readonly call: string }
  type Source = {
    readonly owner: string
    readonly record: string
    readonly revision: string
    readonly digest: string
  }
  expectTypeOf<SessionSuccessBodies['cancel-run']>().toEqualTypeOf<
    | { readonly kind: 'requested'; readonly controlId: string; readonly run: string }
    | {
        readonly kind: 'ended'
        readonly controlId: string
        readonly run: string
        readonly terminal: {
          readonly outcome: 'completed' | 'failed' | 'cancelled'
          readonly source: Source
        }
      }
  >()
  expectTypeOf<SessionSuccessBodies['stop-call']>().toEqualTypeOf<
    | { readonly kind: 'requested'; readonly controlId: string; readonly producer: Producer }
    | {
        readonly kind: 'ended'
        readonly controlId: string
        readonly producer: Producer
        readonly terminal: {
          readonly version: string
          readonly outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response'
          readonly source: Source
        }
      }
  >()
})

test('responses stay correlated to the interruption operation', () => {
  const ended: SessionResponse<'cancel-run'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'succeeded',
    body: {
      kind: 'ended',
      controlId: 'c',
      run: 'r',
      terminal: { outcome: 'cancelled', source },
    },
  }
  void ended
  const notFound: SessionResponse<'cancel-run'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'not-found',
    body: {},
  }
  void notFound
  const noUnsupported: SessionResponse<'cancel-run'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    // @ts-expect-error cancel-run has no unsupported outcome.
    outcome: 'unsupported',
    body: {},
  }
  void noUnsupported
  const unsupported: SessionResponse<'stop-call'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'unsupported',
    body: {},
  }
  void unsupported
  const noNotFound: SessionResponse<'read-history'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    // @ts-expect-error Existing operations have no not-found outcome.
    outcome: 'not-found',
    body: {},
  }
  void noNotFound
  const notEmpty: SessionResponse<'stop-call'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'conflict',
    // @ts-expect-error Failure bodies are empty.
    body: { kind: 'requested' },
  }
  void notEmpty
  const mixed: SessionResponse<'cancel-run'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'succeeded',
    body: {
      kind: 'requested',
      controlId: 'c',
      run: 'r',
      // @ts-expect-error The requested branch has no terminal.
      terminal: { outcome: 'cancelled', source },
    },
  }
  void mixed
  const endedWithoutTerminal: SessionResponse<'cancel-run'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'succeeded',
    // @ts-expect-error The ended branch needs its terminal.
    body: { kind: 'ended', controlId: 'c', run: 'r' },
  }
  void endedWithoutTerminal
  const recorded: SessionResponse<'stop-call'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'succeeded',
    body: {
      kind: 'ended',
      controlId: 'c',
      producer: { kind: 'model', call: 'x' },
      terminal: {
        version: 'v',
        outcome: 'completed',
        // @ts-expect-error The wire source has no recorded field.
        source: { ...source, recorded: 'x' },
      },
    },
  }
  void recorded
  const mismatched: SessionResponseEncodeInput = {
    operation: 'cancel-run',
    response: {
      protocolVersion: 'session-public/1',
      messageId: 'm',
      outcome: 'succeeded',
      // @ts-expect-error The cancel-run body is not the send-input body.
      body: { recovered: true },
    },
    limits,
  }
  void mismatched
  // @ts-expect-error Business outcomes require operation context.
  encodeSessionResponse({
    response: {
      protocolVersion: 'session-public/1',
      messageId: 'm',
      outcome: 'not-found',
      body: {},
    },
    limits,
  })
})
