import { executeModel } from '@omne-harness/model'
import type {
  MaterializedTransport,
  PreparedTransport,
  TransportFailure,
} from '@omne-harness/model-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { controlled, delta, ended, receipt, request, SECRET, signal } from './execute-fixture.ts'

function throwingPayload<T>(result: Outcome<T, TransportFailure>): Outcome<T, TransportFailure> {
  return 'ok' in result
    ? {
        get ok(): never {
          throw new Error(SECRET)
        },
      }
    : {
        get failure(): never {
          throw new Error(SECRET)
        },
      }
}

describe('provider preparation outcomes through the public entry', () => {
  for (const at of ['prepare', 'materialize'] as const) {
    it.each(['ok', 'failure'] as const)(`sanitizes a throwing ${at}.%s getter`, async branch => {
      const failure = { kind: 'denied', action: 'send' } satisfies TransportFailure
      const given = controlled({
        ...(branch === 'failure' ? { rejection: { at, failure } } : {}),
        prepareOutcome: result => (at === 'prepare' ? throwingPayload(result) : result),
        materializeOutcome: result => (at === 'materialize' ? throwingPayload(result) : result),
      })
      const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
      const first = await iterator.next()
      expect(first).toEqual({
        done: false,
        value: {
          kind: 'not-started',
          reason: 'rejected',
          failure: {
            kind: 'unavailable',
            dependency: 'model-transport',
            diagnostic: `independent-${at}-failed`,
          },
        },
      })
      expect(JSON.stringify(first)).not.toContain(SECRET)
      expect(given.calls).toEqual(
        at === 'prepare' ? ['prepare'] : ['prepare', 'materialize', 'prepared.close'],
      )
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
    })

    it(`reads a successful ${at} payload once and closes the acquired resources`, async () => {
      let reads = 0
      const unexpected: string[] = []
      const alternateMaterialized: MaterializedTransport = {
        receipt,
        start() {
          unexpected.push('start')
          throw new Error('unexpected-materialized')
        },
        async close() {
          unexpected.push('materialized.close')
        },
      }
      const alternatePrepared: PreparedTransport = {
        async materialize() {
          unexpected.push('materialize')
          return succeed(alternateMaterialized)
        },
        async close() {
          unexpected.push('prepared.close')
        },
      }
      const given = controlled({
        prepareOutcome: result => {
          if (at !== 'prepare' || 'failure' in result) return result
          const acquired = result.ok
          return {
            get ok() {
              reads += 1
              return reads === 1 ? acquired : alternatePrepared
            },
          }
        },
        materializeOutcome: result => {
          if (at !== 'materialize' || 'failure' in result) return result
          const acquired = result.ok
          return {
            get ok() {
              reads += 1
              return reads === 1 ? acquired : alternateMaterialized
            },
          }
        },
      })
      const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
      expect(await iterator.next()).toEqual({ done: false, value: delta })
      expect(await iterator.next()).toEqual({ done: false, value: ended })
      expect(reads).toBe(1)
      expect(unexpected).toEqual([])
      expect(given.calls).toEqual([
        'prepare',
        'materialize',
        'start',
        'iterator',
        'next',
        'next',
        'return',
        'materialized.close',
        'prepared.close',
      ])
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
    })

    it(`reads a declared ${at} failure once and retains its identity`, async () => {
      let reads = 0
      const failure = { kind: 'denied', action: 'send' } satisfies TransportFailure
      const outcome = {
        get failure() {
          reads += 1
          return failure
        },
      }
      const given = controlled({
        prepareOutcome: result => (at === 'prepare' ? outcome : result),
        materializeOutcome: result => (at === 'materialize' ? outcome : result),
      })
      const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
      const first = await iterator.next()
      expect(first).toEqual({
        done: false,
        value: { kind: 'not-started', reason: 'rejected', failure },
      })
      if (first.done || first.value.kind !== 'not-started' || first.value.reason !== 'rejected')
        throw new Error('expected rejection')
      expect(first.value.failure).toBe(failure)
      expect(reads).toBe(1)
      expect(given.calls).toEqual(
        at === 'prepare' ? ['prepare'] : ['prepare', 'materialize', 'prepared.close'],
      )
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
    })
  }
})
