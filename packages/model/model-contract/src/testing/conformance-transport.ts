// The checks of a transport: nothing leaves it before `start`, a step runs once, the receipt
// grants nothing, the fact stream ends once, and closing is safe to repeat.
import type {
  MaterializedTransport,
  PreparedTransport,
  Supplier,
  FixedModelRequest,
  TransportFact,
} from '../index.ts'
import { DEFAULT_SUPPLIER } from './conformance-defaults.ts'
import {
  expect,
  releaseIterator,
  same,
  show,
  succeeded,
  transportOf,
  within,
} from './conformance-kit.ts'
import type { Check, ConformanceTransport, Scene } from './conformance-types.ts'

type Attempt<T> = Readonly<{ threw: true }> | Readonly<{ threw: false; value: T }>

/** Runs a step whose refusal may be a thrown error or a returned failure; the contract does not say which. */
async function attempt<T>(step: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { threw: false, value: await step() }
  } catch {
    return { threw: true }
  }
}

function inputOf<P>(scene: Scene<P>): Readonly<{ request: FixedModelRequest; supplier: Supplier }> {
  const given = transportOf(scene)
  return { request: given.request ?? scene.request, supplier: given.supplier ?? DEFAULT_SUPPLIER }
}

/** Prepares once, and closes what it prepared however the body ends. */
async function viaPrepared<P, T>(
  scene: Scene<P>,
  body: (prepared: PreparedTransport, given: ConformanceTransport) => Promise<T>,
): Promise<T> {
  const given = transportOf(scene)
  const { request, supplier } = inputOf(scene)
  const prepared = succeeded(await given.transport.prepare(request, supplier), 'prepare')
  try {
    return await body(prepared, given)
  } finally {
    await prepared.close()
  }
}

/** Materializes once, and closes it however the body ends. */
async function viaMaterialized<T>(
  prepared: PreparedTransport,
  signal: AbortSignal,
  body: (materialized: MaterializedTransport) => Promise<T>,
): Promise<T> {
  const materialized = succeeded(await prepared.materialize(signal), 'materialize')
  try {
    return await body(materialized)
  } finally {
    await materialized.close()
  }
}

async function collect<P>(
  scene: Scene<P>,
  stream: AsyncIterable<TransportFact>,
): Promise<readonly TransportFact[]> {
  const facts: TransportFact[] = []
  const iterator = stream[Symbol.asyncIterator]()
  let finished = false
  try {
    while (!finished) {
      const step = await within(scene.waitMs, iterator.next(), 'the next fact of the stream')
      finished = step.done === true
      if (step.done !== true) facts.push(step.value)
      expect(facts.length <= 10_000, 'the fact stream does not end')
    }
    return facts
  } finally {
    // A stream that ended has nothing left to release. Otherwise a failure of the release adds
    // nothing to the finding that brought the suite here.
    if (!finished)
      await releaseIterator(iterator, scene.waitMs, 'the release of the fact stream').catch(
        () => undefined,
      )
  }
}

/** Reads the whole stream of a materialization that the check does not own, and closes it. */
async function collectThenClose<P>(
  scene: Scene<P>,
  materialized: MaterializedTransport,
  signal: AbortSignal,
): Promise<readonly TransportFact[]> {
  try {
    return await collect(scene, materialized.start(signal))
  } finally {
    await materialized.close()
  }
}

export function transportChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'transport-sends-only-at-start',
      requires: ['transport'],
      async run(scene) {
        const base = transportOf(scene).sends()
        await viaPrepared(scene, async (prepared, given) => {
          expect(given.sends() === base, 'prepare sent a request')
          const signal = new AbortController().signal
          await viaMaterialized(prepared, signal, async materialized => {
            expect(given.sends() === base, `materialize sent ${given.sends() - base} request(s)`)
            const stream = materialized.start(signal)
            expect(
              given.sends() === base + 1,
              `start has sent ${given.sends() - base} request(s) before the first fact was read`,
            )
            await collect(scene, stream)
          })
        })
      },
    },
    {
      name: 'repeated-transport-step-sends-nothing',
      requires: ['transport'],
      async run(scene) {
        await viaPrepared(scene, async (prepared, given) => {
          const signal = new AbortController().signal
          await viaMaterialized(prepared, signal, async first => {
            const baseline = given.sends()
            const second = await attempt(() => prepared.materialize(signal))
            if (!second.threw && 'ok' in second.value) {
              const extra = second.value.ok
              const facts = await collectThenClose(scene, extra, signal)
              expect(
                facts.length === 0,
                `a second materialize of the same prepared transport gave facts: ${show(facts)}`,
              )
              expect(
                given.sends() === baseline,
                'a second materialize of the same prepared transport gave a stream that sends',
              )
            }
            await collect(scene, first.start(signal))
            const afterStart = given.sends()
            const again = await attempt(async () => collect(scene, first.start(signal)))
            expect(
              again.threw || again.value.length === 0,
              `a second start gave facts: ${again.threw ? '' : show(again.value)}`,
            )
            expect(given.sends() === afterStart, 'a second start sent again')
          })
        })
      },
    },
    {
      name: 'materialization-receipt-matches-request',
      requires: ['transport'],
      async run(scene) {
        const { request, supplier } = inputOf(scene)
        await viaPrepared(scene, async prepared => {
          await viaMaterialized(prepared, new AbortController().signal, async materialized => {
            const { receipt } = materialized
            expect(receipt.payloadDigest.length > 0, 'the receipt has no payload digest')
            expect(
              same(receipt.supplier, supplier.adoption),
              `the receipt names the supplier ${show(receipt.supplier)}`,
            )
            expect(
              same(receipt.representation, request.representation),
              `the receipt names the representation ${show(receipt.representation)}`,
            )
            expect(same(receipt, materialized.receipt), 'the receipt changes between two reads')
          })
        })
      },
    },
    {
      name: 'fact-stream-ends-once',
      requires: ['transport'],
      async run(scene) {
        await viaPrepared(scene, async prepared => {
          const signal = new AbortController().signal
          await viaMaterialized(prepared, signal, async materialized => {
            const facts = await collect(scene, materialized.start(signal))
            const endings = facts.filter(fact => fact.kind === 'ended')
            expect(endings.length === 1, `the stream has ${endings.length} ended facts`)
            expect(
              facts.findIndex(fact => fact.kind === 'ended') === facts.length - 1,
              'the stream gives facts after the ended fact',
            )
          })
        })
      },
    },
    {
      name: 'interruption-is-confirmed',
      requires: ['transport'],
      async run(scene) {
        await viaPrepared(scene, async prepared => {
          const aborted = new AbortController()
          aborted.abort()
          await viaMaterialized(prepared, new AbortController().signal, async materialized => {
            const facts = await collect(scene, materialized.start(aborted.signal))
            for (const fact of facts) {
              if (fact.kind !== 'ended' || fact.termination.kind !== 'interrupted') continue
              expect(
                fact.termination.stop === 'confirmed',
                `an interruption is not confirmed: ${show(fact.termination)}`,
              )
            }
          })
        })
      },
    },
    {
      name: 'transport-close-is-idempotent',
      requires: ['transport'],
      async run(scene) {
        await viaPrepared(scene, async (prepared, given) => {
          const materialized = succeeded(
            await prepared.materialize(new AbortController().signal),
            'materialize',
          )
          const base = given.sends()
          await materialized.close()
          await materialized.close()
          await prepared.close()
          await prepared.close()
          expect(given.sends() === base, 'closing sent a request')
        })
      },
    },
  ]
}
