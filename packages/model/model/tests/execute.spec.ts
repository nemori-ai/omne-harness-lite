import { executeModel } from '@omne-harness/model'
import type { Adoption, TransportFailure } from '@omne-harness/model-contract'
import type { ModelTransport } from '@omne-harness/model-contract/provider'
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  adoption,
  collect,
  controlled,
  delta,
  ended,
  gate,
  receipt,
  request,
  scripted,
  SECRET,
  signal,
} from './execute-fixture.ts'

describe('independent execution through the public entry', () => {
  it('composes scripted preparation without sending until synchronous start', async () => {
    const given = scripted()
    const stages: number[] = []
    const transport: ModelTransport = {
      async prepare(fixed, supplier, dispatch) {
        const prepared = await given.transport.prepare(fixed, supplier, dispatch)
        if ('failure' in prepared) return prepared
        stages.push(given.counts().start)
        return succeed({
          async materialize(abort) {
            const materialized = await prepared.ok.materialize(abort)
            if ('failure' in materialized || !('start' in materialized.ok)) return materialized
            stages.push(given.counts().start)
            const request = materialized.ok
            return succeed({
              receipt: request.receipt,
              start(signal) {
                const stream = request.start(signal)
                stages.push(given.counts().start)
                return stream
              },
              close: () => request.close(),
            })
          },
          close: () => prepared.ok.close(),
        })
      },
    }
    expect(await collect(executeModel(request, transport, signal()))).toEqual([delta, ended])
    expect(stages).toEqual([0, 0, 1])
  })

  it('starts lazily once across repeated iteration and concurrent next calls', async () => {
    const given = scripted()
    const execution = executeModel(request, given.transport, signal())
    const iterator = execution[Symbol.asyncIterator]()
    expect(execution[Symbol.asyncIterator]()).toBe(iterator)
    expect(given.counts()).toEqual({
      prepare: 0,
      materialize: 0,
      start: 0,
      closePrepared: 0,
      closeMaterialized: 0,
    })
    expect(await Promise.all([iterator.next(), iterator.next(), iterator.next()])).toEqual([
      { done: false, value: delta },
      { done: false, value: ended },
      { done: true, value: undefined },
    ])
    expect(given.counts()).toEqual({
      prepare: 1,
      materialize: 1,
      start: 1,
      closePrepared: 1,
      closeMaterialized: 1,
    })
  })

  it('uses only the first supplier and preserves facts up to the first terminal', async () => {
    const given = controlled({ facts: [delta, ended, delta, ended] })
    const suppliers: unknown[] = []
    const transport = {
      prepare: (...input: Parameters<typeof given.transport.prepare>) => {
        suppliers.push(input[1])
        return given.transport.prepare(...input)
      },
    }
    const fixed = {
      ...request,
      suppliers: [request.suppliers[0], { ...request.suppliers[0], adoption: adoption('unused') }],
    } satisfies typeof request
    expect(await collect(executeModel(fixed, transport, signal()))).toEqual([delta, ended])
    expect(suppliers).toEqual([request.suppliers[0]])
    expect(given.calls.filter(call => call === 'next')).toHaveLength(2)
    expect(given.calls.slice(-3)).toEqual(['return', 'materialized.close', 'prepared.close'])
  })

  const failures: TransportFailure[] = [
    { kind: 'denied', action: 'send' },
    { kind: 'invalid', field: 'input', reason: 'invalid' },
    { kind: 'unsupported', field: 'media', adapter: adoption('adapter') },
    { kind: 'unavailable', dependency: 'transport', diagnostic: 'declared-failure' },
  ]
  for (const at of ['prepare', 'materialize'] as const) {
    it.each(failures)(`preserves a declared ${at} failure: $kind`, async failure => {
      const given = controlled({ rejection: { at, failure } })
      const facts = await collect(executeModel(request, given.transport, signal()))
      expect(facts).toEqual([{ kind: 'not-started', reason: 'rejected', failure }])
      const fact = facts[0]
      if (fact?.kind !== 'not-started' || fact.reason !== 'rejected')
        throw new Error('expected rejection')
      expect(fact.failure).toBe(failure)
      expect(given.calls).toEqual(
        at === 'prepare' ? ['prepare'] : ['prepare', 'materialize', 'prepared.close'],
      )
    })

    it(`sanitizes unexpected ${at} exceptions`, async () => {
      const given = controlled({
        [at]: async () => {
          throw new Error(SECRET)
        },
      })
      const facts = await collect(executeModel(request, given.transport, signal()))
      expect(facts).toEqual([
        {
          kind: 'not-started',
          reason: 'rejected',
          failure: {
            kind: 'unavailable',
            dependency: 'model-transport',
            diagnostic: `independent-${at}-failed`,
          },
        },
      ])
      expect(JSON.stringify(facts)).not.toContain(SECRET)
      expect(given.calls).toEqual(
        at === 'prepare' ? ['prepare'] : ['prepare', 'materialize', 'prepared.close'],
      )
    })
  }

  it.each(['owner', 'name', 'revision', 'digest'] as const)(
    'rejects mismatched supplier adoption %s',
    async field => {
      const given = controlled({
        receipt: () => ({ ...receipt, supplier: { ...receipt.supplier, [field]: 'changed' } }),
      })
      expect(await collect(executeModel(request, given.transport, signal()))).toMatchObject([
        {
          kind: 'not-started',
          reason: 'rejected',
          failure: {
            kind: 'invalid',
            field: 'receipt',
            reason: expect.stringMatching(/\S/),
          },
        },
      ])
      expect(given.calls).toEqual([
        'prepare',
        'materialize',
        'materialized.close',
        'prepared.close',
      ])
    },
  )

  it.each(['owner', 'name', 'revision', 'digest'] as const)(
    'rejects mismatched representation adoption %s',
    async field => {
      const given = controlled({
        receipt: () => ({
          ...receipt,
          representation: { ...receipt.representation, [field]: 'changed' },
        }),
      })
      expect(await collect(executeModel(request, given.transport, signal()))).toMatchObject([
        {
          kind: 'not-started',
          reason: 'rejected',
          failure: {
            kind: 'invalid',
            field: 'receipt',
            reason: expect.stringMatching(/\S/),
          },
        },
      ])
      expect(given.calls).not.toContain('start')
    },
  )

  it.each(['empty', 'unstable', 'throws'] as const)(
    'rejects an %s receipt before start',
    async mode => {
      let reads = 0
      const given = controlled({
        receipt: () => {
          reads += 1
          if (mode === 'throws') throw new Error(SECRET)
          return { ...receipt, payloadDigest: mode === 'empty' ? '' : String(reads) }
        },
      })
      const facts = await collect(executeModel(request, given.transport, signal()))
      expect(facts).toMatchObject([
        {
          kind: 'not-started',
          reason: 'rejected',
          failure: { kind: mode === 'throws' ? 'unavailable' : 'invalid' },
        },
      ])
      const fact = facts[0]
      if (fact?.kind !== 'not-started' || fact.reason !== 'rejected')
        throw new Error('expected receipt rejection')
      if (mode === 'throws')
        expect(fact.failure).toMatchObject({
          dependency: 'model-transport',
          diagnostic: expect.stringContaining('receipt'),
        })
      else
        expect(fact.failure).toMatchObject({
          field: 'receipt',
          reason: expect.stringMatching(/\S/),
        })
      expect(JSON.stringify(facts)).not.toContain(SECRET)
      expect(given.calls).toEqual([
        'prepare',
        'materialize',
        'materialized.close',
        'prepared.close',
      ])
    },
  )

  it.each([
    ['replay format', (read: number) => ({ replayFormat: `format-${read}` })],
    ['replay prefix', (read: number) => ({ replayFormat: 'format-1', replayPrefix: `h:${read}` })],
    [
      'carried mark',
      (read: number) => ({
        replayFormat: 'format-1',
        ...(read % 2 === 1 ? { replayCarried: true as const } : {}),
      }),
    ],
    [
      'encoded media',
      (read: number) => ({
        media: [
          {
            reference: { storage: 's', key: 'k', mediaType: 'image/png', bytes: '9', digest: 'd' },
            mediaType: 'image/png',
            bytes: String(read % 2 === 1 ? 9 : 4),
          },
        ],
      }),
    ],
    [
      'reference of an encoded medium',
      (read: number) => ({
        media: [
          {
            reference: {
              storage: 's',
              key: read % 2 === 1 ? 'k' : 'v',
              mediaType: 'image/png',
              bytes: '9',
              digest: 'd',
            },
            mediaType: 'image/png',
            bytes: '9',
          },
        ],
      }),
    ],
  ] as const)(
    'rejects a receipt whose %s changes between two reads, and starts on a stable one',
    async (_, marks) => {
      let reads = 0
      const unstable = controlled({ receipt: () => ({ ...receipt, ...marks((reads += 1)) }) })
      expect(await collect(executeModel(request, unstable.transport, signal()))).toMatchObject([
        { kind: 'not-started', reason: 'rejected', failure: { kind: 'invalid', field: 'receipt' } },
      ])
      expect(unstable.calls).not.toContain('start')
      const stable = controlled({ receipt: () => ({ ...receipt, ...marks(1) }) })
      await collect(executeModel(request, stable.transport, signal()))
      expect(stable.calls).toContain('start')
    },
  )

  it('fixes receipt expectations before asynchronous preparation', async () => {
    const fixed = structuredClone(request)
    const delayed = gate()
    const entered = gate()
    const changed = { ...receipt, representation: { ...receipt.representation, digest: 'changed' } }
    const given = controlled({
      prepare: async () => {
        entered.open()
        await delayed.wait
      },
      receipt: () => changed,
    })
    const result = collect(executeModel(fixed, given.transport, signal()))
    await entered.wait
    Object.assign(fixed.representation, changed.representation)
    delayed.open()
    expect(await result).toMatchObject([
      {
        kind: 'not-started',
        reason: 'rejected',
        failure: {
          kind: 'invalid',
          field: 'receipt',
          reason: expect.stringMatching(/\S/),
        },
      },
    ])
    expect(given.calls).not.toContain('start')
  })

  it('checks cancellation after a successful receipt read and before synchronous start', async () => {
    const abort = new AbortController()
    const given = controlled({
      receipt: () => {
        abort.abort(SECRET)
        return receipt
      },
    })
    expect(await collect(executeModel(request, given.transport, abort.signal))).toEqual([
      { kind: 'not-started', reason: 'cancelled' },
    ])
    expect(given.calls).toEqual(['prepare', 'materialize', 'materialized.close', 'prepared.close'])
  })

  it('accepts receipt adoption fields exposed by inherited getters', async () => {
    class AdoptionView implements Adoption {
      constructor(private readonly value: Adoption) {}
      get owner() {
        return this.value.owner
      }
      get name() {
        return this.value.name
      }
      get revision() {
        return this.value.revision
      }
      get digest() {
        return this.value.digest
      }
    }
    const given = controlled({
      receipt: () => ({
        ...receipt,
        supplier: new AdoptionView(receipt.supplier),
        representation: new AdoptionView(receipt.representation),
      }),
    })
    expect(await collect(executeModel(request, given.transport, signal()))).toEqual([delta, ended])
  })
})
