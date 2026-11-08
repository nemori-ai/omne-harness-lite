import { setImmediate as nextTurn } from 'node:timers/promises'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { runtimeFixture, configuration } from './runtime-fixture.ts'
import { instance, op, proof, unbox } from './memory-fixture.ts'

setFlagsFromString('--expose-gc')
const gc: unknown = runInNewContext('gc')
async function collect() {
  if (typeof gc !== 'function') throw new Error('GC is required for the lifetime assertion')
  for (let round = 0; round < 4; round++) {
    await nextTurn()
    gc()
  }
}

it.each(['completed', 'stream-lost'] as const)(
  'releases the %s send stream while its public observation remains alive',
  async ending => {
    const f = runtimeFixture()
    const streams: WeakRef<AsyncIterable<TransportFact>>[] = []
    const provider = createModelRuntime(
      {
        ...f.dependencies,
        send: {
          async send(demand, signal) {
            const sent = await f.dependencies.send.send(demand, signal)
            if (sent.kind !== 'started') return sent
            const facts: AsyncIterable<TransportFact> = {
              [Symbol.asyncIterator]: () => sent.facts[Symbol.asyncIterator](),
            }
            streams.push(new WeakRef(facts))
            return { ...sent, facts }
          },
        },
      },
      configuration,
    )
    try {
      unbox(await f.dependencies.commands.admit(f.admit))
      const stream = f.channel(f.admit.call)
      stream.ready.resolve()
      stream.push([
        { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
        { kind: 'block-delta', index: '0', delta: 'complete' },
      ])
      if (ending === 'completed')
        stream.push([{ kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }])
      else stream.finish()
      const claim = {
        principal: f.principal,
        tenant: f.tenant,
        call: f.admit.call,
        operation: op('material-lifetime'),
        instance: instance(f.admit.call),
        continuity: proof(f.admit.call),
      }
      const expected =
        ending === 'completed'
          ? { ok: undefined }
          : { failure: { kind: 'unavailable', diagnostic: 'fact-stream-failed' } }
      expect(await provider.driver.drive(claim, new AbortController().signal)).toMatchObject(
        expected,
      )
      expect(stream.returns).toBe(ending === 'completed' ? 1 : 0)
      expect(stream.closes).toBe(1)
      expect(streams).toHaveLength(1)
      await collect()
      expect(streams[0]?.deref()).toBeUndefined()
      expect(await provider.driver.drive(claim, new AbortController().signal)).toMatchObject(
        expected,
      )
      expect(stream.starts).toBe(1)
      expect(stream.returns).toBe(ending === 'completed' ? 1 : 0)
      const route = unbox(
        await provider.runtime.instances.connect({
          principal: f.principal,
          tenant: f.tenant,
          reference: f.reference,
        }),
      )
      if (route.kind !== 'live') throw new Error('completed observation is unavailable')
      const observer = route.handle
        .observe({ ...f.admit, signal: new AbortController().signal })
        [Symbol.asyncIterator]()
      try {
        expect(await observer.next()).toMatchObject({
          value: {
            kind: 'snapshot',
            value: { blocks: [{ value: 'complete' }], state: { phase: 'settled' } },
          },
        })
      } finally {
        await observer.return?.()
      }
    } finally {
      await f.dispose()
    }
  },
)
