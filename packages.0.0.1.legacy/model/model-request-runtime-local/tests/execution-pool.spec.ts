import { expect, it } from 'vitest'
import { parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type {
  ModelExecutionRef,
  ModelInvocationHandle,
} from '@omne-harness-lite/model-request-runtime'
import { createModelExecutionPool } from '../src/index.ts'
import { adapter, deferred, fixturePlan, policy, request } from './invoke-policy-fixture.ts'

function execution(organization = 'pool-org') {
  const tenant = parseTenantId({ organization, account: 'pool-account' })
  const session = parseOpaqueIdentifier('pool-session', 'SessionRef')
  if (!('ok' in tenant) || !('ok' in session)) throw new Error('invalid fixture')
  const wire = adapter()
  const input = {
    ...request(),
    transport: wire.transport,
    credential: 'controlled-key',
    signal: new AbortController().signal,
    policy: policy(),
  }
  const ref: ModelExecutionRef = {
    tenant: tenant.ok,
    session: session.ok,
    callId: input.target.callId,
    dispatch: input.target.dispatch,
  }
  return { ref, input, wire }
}
function accepted(
  value: ReturnType<ReturnType<typeof createModelExecutionPool>['execute']>,
): ModelInvocationHandle {
  if (!('invocation' in value)) throw new Error(`execution rejected: ${value.rejected}`)
  return value.invocation
}

it('executes the original input and removes stopped entries without retaining results', async () => {
  const pool = createModelExecutionPool()
  const value = execution()
  const handle = accepted(pool.execute(value))
  expect(pool.executionSource.snapshot(value.ref)).toEqual([{ ref: value.ref, state: 'active' }])
  expect(await handle.outcome).toHaveProperty('outcome', 'complete')
  await handle.stopped
  expect(pool.executionSource.snapshot(value.ref)).toEqual([])
  expect(value.wire.sends()).toBe(1)
  expect(await pool.close()).toEqual({ released: true })
})

it('rejects duplicate active identities and isolates identical call IDs across tenants', async () => {
  const pool = createModelExecutionPool()
  const gate = deferred()
  const entered = deferred()
  const one = execution()
  const two = execution('other-org')
  one.input.transport = adapter({
    pause: () => {
      entered.resolve()
      return gate.promise
    },
  }).transport
  const first = accepted(pool.execute(one))
  await entered.promise
  try {
    expect(pool.execute(one)).toEqual({ rejected: 'duplicateActive' })
    expect(
      pool.execute({ ...one, ref: { ...one.ref, dispatch: new LosslessNumber('1.00') } }),
    ).toEqual({ rejected: 'duplicateActive' })
    const second = accepted(pool.execute(two))
    expect(pool.executionSource.snapshot(two.ref)).toHaveLength(1)
    expect(pool.executionSource.snapshot(one.ref)[0]?.ref.tenant).toEqual(one.ref.tenant)
    await second.stopped
    expect(pool.executionSource.snapshot(two.ref)).toEqual([])
  } finally {
    gate.resolve()
    await first.stopped
    await pool.close()
  }
})

it('registers before planning so a synchronous close cannot miss the new invocation', async () => {
  const pool = createModelExecutionPool()
  const value = execution()
  let closing: ReturnType<typeof pool.close> | undefined
  const original = value.input.transport
  value.input.transport = {
    ...original,
    plan: (input, signal) => {
      closing = pool.close()
      return original.plan(input, signal)
    },
  }
  const handle = accepted(pool.execute(value))
  expect(await handle.outcome).toEqual({ cancelledBeforeSend: true })
  expect(await closing).toEqual({ released: true })
  expect(value.wire.sends()).toBe(0)
  expect(pool.executionSource.snapshot(value.ref)).toEqual([])
})

it('returns owned metadata snapshots without pinning a stopped invocation', async () => {
  const pool = createModelExecutionPool()
  const value = execution()
  const handle = accepted(pool.execute(value))
  const captured = pool.executionSource.snapshot(value.ref)
  expect(Object.isFrozen(captured)).toBe(true)
  expect(Object.isFrozen(captured[0]?.ref.tenant)).toBe(true)
  await handle.stopped
  expect(captured).toHaveLength(1)
  expect(pool.executionSource.snapshot(value.ref)).toEqual([])
  expect(await pool.close()).toEqual({ released: true })
})

it('rejects mismatched request identities before any send', async () => {
  const pool = createModelExecutionPool()
  const value = execution()
  expect(pool.execute({ ...value, ref: { ...value.ref, dispatch: 2 } })).toEqual({
    rejected: 'invalidInput',
  })
  expect(value.wire.sends()).toBe(0)
  expect(await pool.close()).toEqual({ released: true })
})

it('keeps close pending for the original callback after physical outcome completion', async () => {
  const pool = createModelExecutionPool()
  const value = execution()
  const gate = deferred()
  const entered = deferred()
  const handle = accepted(
    pool.execute({
      ...value,
      input: {
        ...value.input,
        beforeFirstContent: () => {
          entered.resolve()
          return gate.promise
        },
      },
    }),
  )
  await entered.promise
  const closing = pool.close()
  try {
    await handle.outcome
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(pool.execute(execution('next-org'))).toEqual({ rejected: 'closed' })
  } finally {
    gate.resolve()
    expect(await closing).toEqual({ released: true })
  }
})

it('retains stop failure as metadata and never reports released', async () => {
  const pool = createModelExecutionPool()
  const value = execution()
  const iterator = value.wire.transport.read({}, fixturePlan(request()), value.input.signal)
  iterator.next = async () => {
    throw new Error('read failed')
  }
  iterator.return = async () => {
    throw new Error('close failed')
  }
  value.input.transport = { ...value.input.transport, read: () => iterator }
  const handle = accepted(pool.execute(value))
  await Promise.all([
    expect(handle.outcome).rejects.toThrow('close failed'),
    expect(handle.stopped).rejects.toThrow('stop unconfirmed'),
  ])
  expect(pool.executionSource.snapshot(value.ref)).toEqual([
    { ref: value.ref, state: 'stopUnconfirmed' },
  ])
  expect(await pool.close()).toEqual({ unavailable: true })
})
