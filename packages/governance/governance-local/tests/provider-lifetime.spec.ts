import { expect, it } from 'vitest'
import { GovernanceProviderLifetime } from '../src/provider-lifetime.ts'
import { scope } from './operation-world.ts'

it('retries unavailable isolation but never repeats an isolation still in flight', async () => {
  const isolation = Promise.withResolvers<{ kind: 'isolated' }>()
  let calls = 0
  let stops = 0
  const lifetime = new GovernanceProviderLifetime({
    stopAccepting: () => {
      stops++
    },
    recoveryPagesPerPass: 1,
    lifecycle: {
      async isolate() {
        calls++
        if (calls === 1) return { kind: 'unavailable', owner: 'governance-lifecycle' }
        return isolation.promise
      },
      async recoverPage() {
        return { kind: 'page', next: null, unsettled: 0 }
      },
    },
  })
  expect(await lifetime.close(1000)).toEqual({ kind: 'pending', phase: 'isolation', inFlight: 0 })
  expect(await lifetime.close(0)).toEqual({ kind: 'pending', phase: 'isolation', inFlight: 0 })
  expect(await lifetime.close(0)).toEqual({ kind: 'pending', phase: 'isolation', inFlight: 0 })
  expect(calls).toBe(2)
  expect(stops).toBe(1)
  isolation.resolve({ kind: 'isolated' })
  expect(await lifetime.close(1000)).toEqual({ kind: 'closed' })
})

it('continues bounded recovery pages and retries unresolved custody before claiming closed', async () => {
  const next = {
    scope,
    owner: 'contribute' as const,
    principalRef: 'principal',
    operationId: 'one',
  }
  const seen: unknown[] = []
  let calls = 0
  const lifetime = new GovernanceProviderLifetime({
    stopAccepting() {},
    recoveryPagesPerPass: 1,
    lifecycle: {
      async isolate() {
        return { kind: 'isolated' }
      },
      async recoverPage(after) {
        seen.push(after)
        calls++
        if (calls === 1) return { kind: 'page', next, unsettled: 1 }
        return { kind: 'page', next: null, unsettled: 0 }
      },
    },
  })
  expect(await lifetime.close(1000)).toEqual({ kind: 'pending', phase: 'recovery', inFlight: 0 })
  expect(await lifetime.close(1000)).toEqual({ kind: 'pending', phase: 'recovery', inFlight: 0 })
  expect(await lifetime.close(1000)).toEqual({ kind: 'closed' })
  expect(seen).toEqual([null, next, null])
})

it('retains recovery responsibility after a failed recovery read', async () => {
  let calls = 0
  const lifetime = new GovernanceProviderLifetime({
    stopAccepting() {},
    recoveryPagesPerPass: 1,
    lifecycle: {
      async isolate() {
        return { kind: 'isolated' }
      },
      async recoverPage() {
        if (++calls === 1) throw new Error('transport lost')
        return { kind: 'page', next: null, unsettled: 0 }
      },
    },
  })
  expect(await lifetime.close(1000)).toMatchObject({ kind: 'pending', phase: 'recovery' })
  expect(await lifetime.close(1000)).toEqual({ kind: 'closed' })
})
