import type {
  MaterializedTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  checkModelProviderConformance,
  createScriptedConformanceSubject,
} from '@omne-harness/model-contract/testing'
import { failingObligations, failures, type Subject } from './conformance-support.ts'

const ENDED: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }

function streamOf(...facts: readonly TransportFact[]): AsyncIterable<TransportFact> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* facts
    },
  }
}

/** The subject with the prepared transport changed; its `sends` is the scripted one unless `sends` says otherwise. */
function through(
  subject: Subject,
  change: (prepared: PreparedTransport) => PreparedTransport,
  sends?: (inner: number) => number,
): Subject {
  const given = subject.transport
  if (given === undefined) throw new Error('the scripted subject has a transport')
  return {
    ...subject,
    transport: {
      ...given,
      sends: () => (sends === undefined ? given.sends() : sends(given.sends())),
      transport: {
        async prepare(request, supplier) {
          const outcome = await given.transport.prepare(request, supplier, { resent: [] })
          return 'ok' in outcome ? succeed(change(outcome.ok)) : outcome
        },
      },
    },
  }
}

/** The subject whose transport runs `before` each time that it is asked to prepare. */
function preparing(
  subject: Subject,
  before: () => void,
  sends: (inner: number) => number,
): Subject {
  const base = through(subject, prepared => prepared, sends)
  const given = base.transport
  if (given === undefined) throw new Error('the scripted subject has a transport')
  return {
    ...base,
    transport: {
      ...given,
      transport: {
        prepare(request, supplier) {
          before()
          return given.transport.prepare(request, supplier, { resent: [] })
        },
      },
    },
  }
}

/** Changes what `materialize` hands out. */
function materializing(change: (materialized: MaterializedTransport) => MaterializedTransport) {
  return (prepared: PreparedTransport): PreparedTransport => ({
    ...prepared,
    async materialize(signal) {
      const outcome = await prepared.materialize(signal)
      return 'ok' in outcome ? succeed(change(outcome.ok)) : outcome
    },
  })
}

/** Changes the facts that `start` hands out. */
function streaming(change: (facts: AsyncIterable<TransportFact>) => AsyncIterable<TransportFact>) {
  return materializing(materialized => ({
    ...materialized,
    start: signal => change(materialized.start(signal)),
  }))
}

describe('the conformance suite on a transport', () => {
  it('fails a transport that sends only when the first fact is read', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => ({
          ...materialized,
          start: signal => ({
            async *[Symbol.asyncIterator]() {
              yield* materialized.start(signal)
            },
          }),
        })),
        inner => inner + 3,
      ),
    )
    expect(failing).toEqual(['transport-sends-only-at-start'])
    expect(reasons).toEqual(['start has sent 0 request(s) before the first fact was read'])
  })

  it('fails a transport that sends while it materializes', async () => {
    const { failing, reasons } = await failures(subject => {
      let extra = 0
      return through(
        subject,
        prepared => ({
          ...prepared,
          async materialize(signal) {
            extra += 1
            return prepared.materialize(signal)
          },
        }),
        inner => inner + 3 + extra,
      )
    })
    expect(failing).toEqual(['transport-sends-only-at-start'])
    expect(reasons[0]).toBe('materialize sent 1 request(s)')
  })

  it('fails a transport that materializes the same prepared transport twice', async () => {
    const { failing, reasons } = await failures(subject =>
      through(subject, prepared => {
        let first: MaterializedTransport | undefined
        return {
          ...prepared,
          async materialize(signal) {
            if (first !== undefined)
              return succeed({
                receipt: first.receipt,
                start: () => streamOf(ENDED),
                close: async () => undefined,
              })
            const outcome = await prepared.materialize(signal)
            if ('ok' in outcome) first = outcome.ok
            return outcome
          },
        }
      }),
    )
    expect(failing).toEqual(['repeated-transport-step-sends-nothing'])
    expect(reasons).toEqual([
      expect.stringContaining('a second materialize of the same prepared transport gave facts'),
    ])
  })

  it('fails a transport that starts the same materialized transport twice', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => {
          let started = false
          return {
            ...materialized,
            start(signal) {
              if (started) return streamOf(ENDED)
              started = true
              return materialized.start(signal)
            },
          }
        }),
      ),
    )
    expect(failing).toEqual(['repeated-transport-step-sends-nothing'])
    expect(reasons).toEqual([expect.stringContaining('a second start gave facts')])
  })

  it('fails a transport whose receipt has no payload digest', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => ({
          ...materialized,
          receipt: { ...materialized.receipt, payloadDigest: '' },
        })),
      ),
    )
    expect(failing).toEqual(['materialization-receipt-matches-request'])
    expect(reasons).toEqual([expect.stringContaining('the receipt has no payload digest')])
  })

  it('fails a transport whose receipt names another supplier', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => ({
          ...materialized,
          receipt: {
            ...materialized.receipt,
            supplier: { ...materialized.receipt.supplier, digest: 'another-supplier' },
          },
        })),
      ),
    )
    expect(failing).toEqual(['materialization-receipt-matches-request'])
    expect(reasons).toEqual([expect.stringContaining('the receipt names the supplier')])
  })

  it('passes a transport whose receipt names a replay tag as its replay format', async () => {
    const { failing } = await failures(subject =>
      through(
        subject,
        materializing(materialized => ({
          ...materialized,
          receipt: { ...materialized.receipt, replayFormat: 'scripted-replay-v1' },
        })),
      ),
    )
    expect(failing).toEqual([])
  })

  it('fails a transport whose receipt names a replay format that is not a replay tag', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => ({
          ...materialized,
          receipt: { ...materialized.receipt, replayFormat: '' },
        })),
      ),
    )
    expect(failing).toEqual(['materialization-receipt-matches-request'])
    expect(reasons).toEqual([expect.stringContaining('which is not a replay tag')])
  })

  it('fails a transport whose replay format changes between two reads of one receipt', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => {
          let reads = 0
          // One receipt object, so the two reads of the receipt are the same; its format is not.
          const receipt = Object.defineProperty({ ...materialized.receipt }, 'replayFormat', {
            enumerable: true,
            get: () => `scripted-replay-v${++reads}`,
          })
          return { ...materialized, receipt }
        }),
      ),
    )
    expect(failing).toEqual(['materialization-receipt-matches-request'])
    expect(reasons).toEqual([
      expect.stringContaining('the replay format changes between two reads'),
    ])
  })

  it('fails a transport that ends its stream twice', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        streaming(facts => ({
          async *[Symbol.asyncIterator]() {
            for await (const fact of facts) {
              yield fact
              if (fact.kind === 'ended') yield fact
            }
          },
        })),
      ),
    )
    expect(failing).toEqual(['fact-stream-ends-once'])
    expect(reasons).toEqual([expect.stringContaining('the stream has 2 ended facts')])
  })

  it('fails a transport that gives a fact after it ended its stream', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        streaming(facts => ({
          async *[Symbol.asyncIterator]() {
            for await (const fact of facts) {
              yield fact
              if (fact.kind === 'ended') yield { kind: 'block-delta', index: '0', delta: 'late' }
            }
          },
        })),
      ),
    )
    expect(failing).toEqual(['fact-stream-ends-once'])
    expect(reasons).toEqual([
      expect.stringContaining('the stream gives facts after the ended fact'),
    ])
  })

  it('fails a transport whose interruption is not confirmed', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        streaming(facts => ({
          async *[Symbol.asyncIterator]() {
            for await (const fact of facts) {
              if (fact.kind !== 'ended' || fact.termination.kind !== 'interrupted') {
                yield fact
                continue
              }
              const termination = structuredClone(fact.termination)
              Reflect.deleteProperty(termination, 'stop')
              yield { kind: 'ended', termination }
            }
          },
        })),
      ),
    )
    expect(failing).toEqual(['interruption-is-confirmed'])
    expect(reasons).toEqual([expect.stringContaining('an interruption is not confirmed')])
  })

  it('fails a transport that cannot be closed twice', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => {
          let closed = false
          return {
            ...materialized,
            async close() {
              if (closed) throw new Error('closed twice')
              closed = true
              await materialized.close()
            },
          }
        }),
      ),
    )
    expect(failing).toEqual(['transport-close-is-idempotent'])
    expect(reasons).toEqual([expect.stringContaining('the subject threw Error')])
  })
})

describe('the conformance suite on the other ways that a transport can go wrong', () => {
  const unusable = {
    kind: 'unavailable',
    dependency: 'transport',
    diagnostic: 'refused',
  } as const

  it('says that prepare failed when it does', async () => {
    const { failing, reasons } = await failures(subject => {
      const given = subject.transport
      if (given === undefined) throw new Error('the scripted subject has a transport')
      return {
        ...subject,
        transport: { ...given, transport: { prepare: async () => fail(unusable) } },
      }
    })
    expect(failing).toEqual([
      'transport-sends-only-at-start',
      'repeated-transport-step-sends-nothing',
      'materialization-receipt-matches-request',
      'fact-stream-ends-once',
      'interruption-is-confirmed',
      'transport-close-is-idempotent',
    ])
    expect(reasons[0]).toBe(`prepare failed with ${JSON.stringify(unusable)}`)
  })

  it('says that materialize failed when it does', async () => {
    const { failing, reasons } = await failures(subject =>
      through(subject, prepared => ({
        ...prepared,
        materialize: async () => fail(unusable),
      })),
    )
    expect(failing).toEqual([
      'transport-sends-only-at-start',
      'repeated-transport-step-sends-nothing',
      'materialization-receipt-matches-request',
      'fact-stream-ends-once',
      'interruption-is-confirmed',
      'transport-close-is-idempotent',
    ])
    expect(new Set(reasons)).toEqual(
      new Set([`materialize failed with ${JSON.stringify(unusable)}`]),
    )
  })

  it('fails a transport whose fact stream hangs, and says what it waited for', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        streaming(() => ({
          [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }),
        })),
      ),
    )
    expect(failing).toEqual([
      'transport-sends-only-at-start',
      'repeated-transport-step-sends-nothing',
      'fact-stream-ends-once',
      'interruption-is-confirmed',
    ])
    expect(reasons[0]).toBe('the next fact of the stream did not arrive within 300 ms')
  })

  it('releases the fact stream that does not answer in time', async () => {
    let released = 0
    const { failing } = await failures(subject =>
      through(
        subject,
        streaming(() => ({
          [Symbol.asyncIterator]: () => ({
            next: () => new Promise<never>(() => undefined),
            return: async () => {
              released += 1
              return { done: true, value: undefined }
            },
          }),
        })),
      ),
    )
    expect(failing).toHaveLength(4)
    expect(released).toBe(4)
  })

  it('does not release a fact stream that ended', async () => {
    let released = 0
    const failing = await failingObligations(subject =>
      through(
        subject,
        streaming(facts => ({
          [Symbol.asyncIterator]() {
            const iterator = facts[Symbol.asyncIterator]()
            return {
              next: () => iterator.next(),
              return: async () => {
                released += 1
                return { done: true, value: undefined }
              },
            }
          },
        })),
      ),
    )
    expect(failing).toEqual([])
    expect(released).toBe(0)
  })

  it('closes the second materialization when reading its stream fails', async () => {
    let closed = 0
    const { failing, reasons } = await failures(subject =>
      through(subject, prepared => {
        let first: MaterializedTransport | undefined
        return {
          ...prepared,
          async materialize(signal) {
            if (first === undefined) {
              const outcome = await prepared.materialize(signal)
              first = 'ok' in outcome ? outcome.ok : undefined
              return outcome
            }
            return succeed({
              receipt: first.receipt,
              start: () => ({
                [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }),
              }),
              async close() {
                closed += 1
              },
            })
          },
        }
      }),
    )
    expect(failing).toEqual(['repeated-transport-step-sends-nothing'])
    expect(reasons).toEqual(['the next fact of the stream did not arrive within 300 ms'])
    expect(closed).toBe(1)
  })

  it('fails a transport whose receipt changes between two reads', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => {
          let reads = 0
          return {
            ...materialized,
            get receipt() {
              reads += 1
              return { ...materialized.receipt, payloadDigest: `digest-${reads}` }
            },
          }
        }),
      ),
    )
    expect(failing).toEqual(['materialization-receipt-matches-request'])
    expect(reasons[0]).toBe('the receipt changes between two reads')
  })

  it('fails a transport that sends while it prepares', async () => {
    const { failing, reasons } = await failures(subject => {
      let extra = 0
      return preparing(
        subject,
        () => {
          extra += 1
        },
        inner => inner + extra,
      )
    })
    expect(failing).toEqual(['transport-sends-only-at-start'])
    expect(reasons[0]).toBe('prepare sent a request')
  })

  it('fails a transport whose second materialize gives a stream that sends and says nothing', async () => {
    const { failing, reasons } = await failures(subject => {
      let extra = 0
      return through(
        subject,
        prepared => {
          let first: MaterializedTransport | undefined
          return {
            ...prepared,
            async materialize(signal) {
              if (first !== undefined)
                return succeed({
                  receipt: first.receipt,
                  start: () => {
                    extra += 1
                    return streamOf()
                  },
                  close: async () => undefined,
                })
              const outcome = await prepared.materialize(signal)
              if ('ok' in outcome) first = outcome.ok
              return outcome
            },
          }
        },
        inner => inner + extra,
      )
    })
    expect(failing).toEqual(['repeated-transport-step-sends-nothing'])
    expect(reasons[0]).toContain('gave a stream that sends')
  })

  it('keeps a transport whose second materialize gives a stream with no fact that sends nothing', async () => {
    const failing = await failingObligations(subject =>
      through(subject, prepared => {
        let first: MaterializedTransport | undefined
        return {
          ...prepared,
          async materialize(signal) {
            if (first !== undefined)
              return succeed({
                receipt: first.receipt,
                start: () => streamOf(),
                close: async () => undefined,
              })
            const outcome = await prepared.materialize(signal)
            if ('ok' in outcome) first = outcome.ok
            return outcome
          },
        }
      }),
    )
    expect(failing).toEqual([])
  })

  it('fails a transport that sends when it is closed', async () => {
    const { failing, reasons } = await failures(subject => {
      let extra = 0
      return through(
        subject,
        materializing(materialized => ({
          ...materialized,
          async close() {
            extra += 1
            await materialized.close()
          },
        })),
        inner => inner + extra,
      )
    })
    expect(failing).toEqual(['transport-close-is-idempotent'])
    expect(reasons).toEqual(['closing sent a request'])
  })

  it('keeps a transport whose second start gives an empty stream and sends nothing', async () => {
    const failing = await failingObligations(subject =>
      through(
        subject,
        materializing(materialized => {
          let started = false
          return {
            ...materialized,
            start(signal) {
              if (started) return streamOf()
              started = true
              return materialized.start(signal)
            },
          }
        }),
      ),
    )
    expect(failing).toEqual([])
  })

  it('fails a transport whose second start sends again and gives no fact', async () => {
    const { failing, reasons } = await failures(subject => {
      let extra = 0
      return through(
        subject,
        materializing(materialized => {
          let started = false
          return {
            ...materialized,
            start(signal) {
              if (started) {
                extra += 1
                return streamOf()
              }
              started = true
              return materialized.start(signal)
            },
          }
        }),
        inner => inner + extra,
      )
    })
    expect(failing).toEqual(['repeated-transport-step-sends-nothing'])
    expect(reasons[0]).toBe('a second start sent again')
  })

  it('fails a transport whose second start gives a fact', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => {
          let started = false
          return {
            ...materialized,
            start(signal) {
              if (started) return streamOf(ENDED)
              started = true
              return materialized.start(signal)
            },
          }
        }),
      ),
    )
    expect(failing).toEqual(['repeated-transport-step-sends-nothing'])
    expect(reasons).toEqual([expect.stringContaining('a second start gave facts')])
  })

  it('fails a transport whose stream never ends', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        streaming(() => ({
          async *[Symbol.asyncIterator]() {
            for (;;) yield { kind: 'block-delta', index: '0', delta: 'x' } as const
          },
        })),
      ),
    )
    expect(failing).toEqual([
      'transport-sends-only-at-start',
      'repeated-transport-step-sends-nothing',
      'fact-stream-ends-once',
      'interruption-is-confirmed',
    ])
    expect(reasons[0]).toBe('the fact stream does not end')
  })

  it('fails a transport whose stream ends without any end fact', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        streaming(() => streamOf({ kind: 'block-delta', index: '0', delta: 'x' })),
      ),
    )
    expect(failing).toEqual(['fact-stream-ends-once'])
    expect(reasons[0]).toBe('the stream has 0 ended facts')
  })

  it('fails a transport whose receipt names another representation', async () => {
    const { failing, reasons } = await failures(subject =>
      through(
        subject,
        materializing(materialized => ({
          ...materialized,
          receipt: {
            ...materialized.receipt,
            representation: { ...materialized.receipt.representation, digest: 'another' },
          },
        })),
      ),
    )
    expect(failing).toEqual(['materialization-receipt-matches-request'])
    expect(reasons[0]).toContain('the receipt names the representation')
  })

  it('keeps a transport whose aborted stream ends as completed', async () => {
    const failing = await failingObligations(subject =>
      through(
        subject,
        streaming(facts => ({
          async *[Symbol.asyncIterator]() {
            for await (const fact of facts)
              yield fact.kind === 'ended' && fact.termination.kind === 'interrupted' ? ENDED : fact
          },
        })),
      ),
    )
    expect(failing).toEqual([])
  })

  it('closes every transport that it prepared and every one that it materialized', async () => {
    const closed = { prepared: 0, materialized: 0 }
    const opened = { prepared: 0, materialized: 0 }
    await checkModelProviderConformance({
      subject: () =>
        through(createScriptedConformanceSubject(), prepared => {
          opened.prepared += 1
          return {
            ...prepared,
            async close() {
              closed.prepared += 1
              await prepared.close()
            },
            async materialize(signal) {
              const outcome = await prepared.materialize(signal)
              if (!('ok' in outcome)) return outcome
              opened.materialized += 1
              const { close } = outcome.ok
              return succeed({
                ...outcome.ok,
                start: signal2 => outcome.ok.start(signal2),
                async close() {
                  closed.materialized += 1
                  await close()
                },
              })
            },
          }
        }),
      waitMs: 300,
    })
    expect(opened.prepared).toBeGreaterThan(0)
    expect(opened.materialized).toBeGreaterThan(0)
    expect(closed.prepared).toBeGreaterThanOrEqual(opened.prepared)
    expect(closed.materialized).toBeGreaterThanOrEqual(opened.materialized)
  })
})
