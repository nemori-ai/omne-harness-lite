import { expect, it } from 'vitest'
import { unwrap, parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createModelExecutionPool, invokeModel } from '../src/index.ts'
import { adapter, policy, request } from './invoke-policy-fixture.ts'

it.each(['send', 'read'] as const)(
  'keeps physical stop unconfirmed when %s throws without a stop witness',
  async stage => {
    const wire = adapter()
    const failure = new Error(`${stage} failed with ownership unknown`)
    const diagnostics: string[] = []
    const transport = {
      ...wire.transport,
      ...(stage === 'send'
        ? {
            send: async () => {
              throw failure
            },
          }
        : {
            read: () => {
              throw failure
            },
          }),
    }
    const handle = invokeModel({
      ...request(),
      transport,
      credential: 'controlled-key',
      signal: new AbortController().signal,
      policy: policy(event => {
        diagnostics.push(event.kind)
      }),
    })
    await Promise.all([
      expect(handle.outcome).rejects.toBe(failure),
      expect(handle.stopped).rejects.toThrow('stop unconfirmed'),
    ])
    expect(diagnostics).toContain('model_invocation.stop_unconfirmed')
    expect(diagnostics).not.toContain('model_invocation.stopped')
  },
)

it('rechecks admission after input access closes the pool', async () => {
  const pool = createModelExecutionPool()
  const wire = adapter()
  const input = {
    ...request(),
    transport: wire.transport,
    credential: 'controlled-key',
    signal: new AbortController().signal,
    policy: policy(),
  }
  const ref = {
    tenant: unwrap(parseTenantId({ organization: 'pool-org', account: 'pool-account' })),
    session: unwrap(parseOpaqueIdentifier('pool-session', 'SessionRef')),
    callId: input.target.callId,
    dispatch: input.target.dispatch,
  }
  let closing: ReturnType<typeof pool.close> | undefined
  const submission = {
    ref,
    get input() {
      closing = pool.close()
      return input
    },
  }
  const result = pool.execute(submission)
  if ('invocation' in result) {
    result.invocation.abort()
    await result.invocation.stopped
  }
  expect(result).toEqual({ rejected: 'closed' })
  expect(await closing).toEqual({ released: true })
  expect(wire.sends()).toBe(0)
  expect(pool.executionSource.snapshot(ref)).toEqual([])
})
