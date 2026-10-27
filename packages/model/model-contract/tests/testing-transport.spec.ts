import { describe, expect, it } from 'vitest'
import type { Adoption, MaterializationReceipt } from '@omne-harness/model-contract'
import type { MaterializedTransport, TransportFact } from '@omne-harness/model-contract/provider'
import {
  createScriptedTransport,
  type ScriptedTransportScript,
} from '@omne-harness/model-contract/testing'
import { failureOf, must, request, textBlock } from './scripted-support.ts'

const adoption = (name: string): Adoption => ({
  owner: 'test',
  name,
  revision: '1',
  digest: `digest-${name}`,
})

const receipt: MaterializationReceipt = {
  supplier: adoption('supplier'),
  representation: adoption('representation'),
  payloadDigest: 'payload',
}

const facts: ScriptedTransportScript['facts'] = [
  { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
  { kind: 'block-delta', index: '0', delta: 'Hello' },
  { kind: 'block-seal', index: '0', block: textBlock('b1', 'Hello') },
]

const script = (over: Partial<ScriptedTransportScript> = {}): ScriptedTransportScript => ({
  receipt,
  facts,
  ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
  rejection: null,
  ...over,
})

const supplier = request.suppliers[0]

async function materialize(scripted: ReturnType<typeof createScriptedTransport>) {
  const prepared = must(await scripted.transport.prepare(request, supplier, { resent: [] }))
  const materialized = must(await prepared.materialize(new AbortController().signal))
  return { prepared, materialized }
}

async function collect(stream: AsyncIterable<TransportFact>): Promise<TransportFact[]> {
  const seen: TransportFact[] = []
  for await (const fact of stream) seen.push(fact)
  return seen
}

describe('a scripted transport that ends properly', () => {
  it('goes through prepare, materialize and start, and ends the stream once with the scripted termination', async () => {
    const scripted = createScriptedTransport(script())
    const { prepared, materialized } = await materialize(scripted)
    expect(materialized.receipt).toEqual(receipt)
    const seen = await collect(materialized.start(new AbortController().signal))
    expect(seen).toEqual([
      ...facts,
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ])
    await materialized.close()
    await prepared.close()
    expect(scripted.counts()).toEqual({
      prepare: 1,
      materialize: 1,
      start: 1,
      closePrepared: 1,
      closeMaterialized: 1,
    })
  })

  it('reports a confirmed interruption as the scripted ending', async () => {
    const scripted = createScriptedTransport(
      script({
        ending: { kind: 'terminated', termination: { kind: 'interrupted', stop: 'confirmed' } },
      }),
    )
    const { materialized } = await materialize(scripted)
    const seen = await collect(materialized.start(new AbortController().signal))
    expect(seen.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'interrupted', stop: 'confirmed' },
    })
  })
})

describe('a scripted transport that loses the stream', () => {
  it('runs out of facts without an ended fact, so that the consumer sees the missing end', async () => {
    const scripted = createScriptedTransport(script({ ending: { kind: 'exhausted' } }))
    const { materialized } = await materialize(scripted)
    const seen = await collect(materialized.start(new AbortController().signal))
    expect(seen).toEqual(facts)
    expect(seen.some(fact => fact.kind === 'ended')).toBe(false)
  })

  it('throws the scripted error after the last fact, the same error instance', async () => {
    const failure = new Error('connection reset')
    const scripted = createScriptedTransport(script({ ending: { kind: 'throws', error: failure } }))
    const { materialized } = await materialize(scripted)
    const seen: TransportFact[] = []
    const caught = await (async () => {
      try {
        for await (const fact of materialized.start(new AbortController().signal)) seen.push(fact)
      } catch (error) {
        return error
      }
      return null
    })()
    expect(caught).toBe(failure)
    expect(seen).toEqual(facts)
  })
})

describe('the protocol of a scripted transport', () => {
  it('starts the send when start is called, not when the stream is first read', async () => {
    const scripted = createScriptedTransport(script())
    const { materialized } = await materialize(scripted)
    expect(scripted.counts().start).toBe(0)
    materialized.start(new AbortController().signal)
    expect(scripted.counts().start).toBe(1)
  })

  it('refuses to materialize or start twice, and still counts the attempt', async () => {
    const scripted = createScriptedTransport(script())
    const { prepared, materialized } = await materialize(scripted)
    await expect(prepared.materialize(new AbortController().signal)).rejects.toMatchObject({
      name: 'ScriptedModelError',
      reason: 'repeated-step',
      message: 'this transport already materialized',
    })
    materialized.start(new AbortController().signal)
    expect(() => materialized.start(new AbortController().signal)).toThrow(
      expect.objectContaining({
        name: 'ScriptedModelError',
        reason: 'repeated-step',
        message: 'this transport already started',
      }),
    )
    expect(scripted.counts()).toMatchObject({ materialize: 2, start: 2 })
  })

  const failure = { kind: 'unavailable', dependency: 'upstream', diagnostic: 'down' } as const

  it('answers the scripted failure at prepare and goes no further', async () => {
    const scripted = createScriptedTransport(script({ rejection: { at: 'prepare', failure } }))
    expect(failureOf(await scripted.transport.prepare(request, supplier, { resent: [] }))).toEqual(
      failure,
    )
    expect(scripted.counts()).toMatchObject({ prepare: 1, materialize: 0, start: 0 })
  })

  it('answers the scripted failure at materialize and goes no further', async () => {
    const scripted = createScriptedTransport(script({ rejection: { at: 'materialize', failure } }))
    const prepared = must(await scripted.transport.prepare(request, supplier, { resent: [] }))
    const step = await prepared.materialize(new AbortController().signal)
    expect(failureOf(step)).toEqual(failure)
    expect(scripted.counts()).toMatchObject({ prepare: 1, materialize: 1, start: 0 })
  })

  it('counts every prepare, also of requests that are never materialized', async () => {
    const scripted = createScriptedTransport(script())
    await scripted.transport.prepare(request, supplier, { resent: [] })
    await scripted.transport.prepare(request, supplier, { resent: [] })
    expect(scripted.counts()).toEqual({
      prepare: 2,
      materialize: 0,
      start: 0,
      closePrepared: 0,
      closeMaterialized: 0,
    })
  })

  it('hands out counts that later steps do not change', async () => {
    const scripted = createScriptedTransport(script())
    const before = scripted.counts()
    await scripted.transport.prepare(request, supplier, { resent: [] })
    expect(before.prepare).toBe(0)
  })

  it('does not share the facts it gives out with the script or with another start', async () => {
    const first = createScriptedTransport(script())
    const second = createScriptedTransport(script())
    const one = await collect(
      (await materialize(first)).materialized.start(new AbortController().signal),
    )
    const firstFact = one[0]
    if (firstFact?.kind !== 'block-open') throw new Error('fact')
    Object.assign(firstFact, { index: 'changed' })
    const two = await collect(
      (await materialize(second)).materialized.start(new AbortController().signal),
    )
    expect(two[0]).toEqual({ kind: 'block-open', index: '0', mode: 'append', content: 'text' })
  })

  it('does not share the receipt with the script', async () => {
    const scripted = createScriptedTransport(script())
    const { materialized } = await materialize(scripted)
    expect(materialized.receipt).not.toBe(receipt)
  })
})

describe('cancelling a scripted stream', () => {
  async function started(over: Partial<ScriptedTransportScript>): Promise<{
    materialized: MaterializedTransport
    abort: AbortController
  }> {
    const { materialized } = await materialize(createScriptedTransport(script(over)))
    return { materialized, abort: new AbortController() }
  }

  it('ends with a confirmed interruption when the signal aborts between facts', async () => {
    const { materialized, abort } = await started({})
    const seen: TransportFact[] = []
    for await (const fact of materialized.start(abort.signal)) {
      seen.push(fact)
      abort.abort()
    }
    expect(seen).toEqual([
      facts[0],
      { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
    ])
  })

  it('ends with a confirmed interruption when the signal aborts after the last fact', async () => {
    const { materialized, abort } = await started({ facts: [facts[0]!] })
    const seen: TransportFact[] = []
    for await (const fact of materialized.start(abort.signal)) {
      seen.push(fact)
      abort.abort()
    }
    expect(seen.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'interrupted', stop: 'confirmed' },
    })
    expect(seen).toHaveLength(2)
  })

  it('gives only the interruption when the signal was already aborted', async () => {
    const { materialized, abort } = await started({})
    abort.abort()
    expect(await collect(materialized.start(abort.signal))).toEqual([
      { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
    ])
  })
})
