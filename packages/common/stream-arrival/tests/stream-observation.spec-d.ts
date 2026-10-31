import type { Access, TenantId } from '@omne-harness/legal-identity'
import type {
  StreamCursor,
  StreamFrame,
  StreamObserver,
  StreamRef,
} from '@omne-harness/stream-arrival'
import { expectTypeOf, test } from 'vitest'

type Principal = Readonly<{ subject: string }>
type Observer = StreamObserver<Principal, string, number>
type Input = Parameters<Observer['observe']>[0]

test('public observer consumes the sole Access type and has no replay argument', () => {
  expectTypeOf<Input>().toEqualTypeOf<
    Readonly<{ ref: StreamRef; access: Access<Principal>; signal: AbortSignal }>
  >()
  expectTypeOf<ReturnType<Observer['observe']>>().toEqualTypeOf<
    AsyncIterable<StreamFrame<string, number>>
  >()
  expectTypeOf<keyof Input>().toEqualTypeOf<'ref' | 'access' | 'signal'>()
  expectTypeOf<Access<Principal>['tenant']>().toEqualTypeOf<TenantId>()
})

test('frame variants keep cursor and producer end requirements', () => {
  type Frame = StreamFrame<string, number, { code: 'closed' }>
  expectTypeOf<Extract<Frame, { kind: 'snapshot' }>>().toEqualTypeOf<
    Readonly<{ kind: 'snapshot'; cursor: StreamCursor; value: string }>
  >()
  expectTypeOf<Extract<Frame, { kind: 'delta' }>>().toEqualTypeOf<
    Readonly<{ kind: 'delta'; from: StreamCursor; cursor: StreamCursor; value: number }>
  >()
  expectTypeOf<
    Extract<StreamFrame<string, number>, { reason: 'producer-ended' }>['value']
  >().toEqualTypeOf<never>()
  expectTypeOf<Extract<Frame, { reason: 'producer-ended' }>['value']>().toEqualTypeOf<{
    code: 'closed'
  }>()
})

function rejectedShapes(observer: Observer, input: Input, cursor: StreamCursor): void {
  // @ts-expect-error Replay is absent from this public port.
  observer.observe({ ...input, after: cursor })
  // @ts-expect-error A snapshot needs its confirmed cursor.
  const missingCursor: StreamFrame<string, number> = { kind: 'snapshot', value: 'x' }
  // @ts-expect-error A delta needs the observer's last delivered cursor.
  const missingFrom: StreamFrame<string, number> = { kind: 'delta', cursor, value: 1 }
  // @ts-expect-error A gap always reports its continuity boundary.
  const missingAfter: StreamFrame<string, number> = { kind: 'gap', reason: 'buffer' }
  // @ts-expect-error Producer-ended requires its owned end value.
  const missingEnd: StreamFrame<string, number, string> = {
    kind: 'ended',
    reason: 'producer-ended',
  }
  const unexpectedEnd: StreamFrame<string, number> = {
    kind: 'ended',
    reason: 'producer-ended',
    // @ts-expect-error The default never does not admit a producer end value.
    value: 'closed',
  }
  const wrongBrand: StreamFrame<string, number> = {
    kind: 'snapshot',
    // @ts-expect-error StreamRef cannot replace a cursor.
    cursor: input.ref,
    value: 'x',
  }
  // @ts-expect-error Unknown frame kinds are not public frames.
  const wrongKind: StreamFrame<string, number> = { kind: 'event', cursor, value: 'x' }
  observer.observe({
    ...input,
    access: {
      principal: input.access.principal,
      // @ts-expect-error An unminted tenant shape is not a TenantId.
      tenant: { organization: 'org_x', account: 'acc_x' },
    },
  })
  void [missingCursor, missingFrom, missingAfter, missingEnd, unexpectedEnd, wrongBrand, wrongKind]
}
void rejectedShapes
