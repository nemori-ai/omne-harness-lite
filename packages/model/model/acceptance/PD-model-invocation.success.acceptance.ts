// covers: PD-model-invocation S1
import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { judgePart } from '@omne-harness/message'
import type { Observation, ResultPart } from '@omne-harness/model-contract'
import { configuration, createAcceptanceAssembly, operation } from './fixtures/runtime.ts'

it('observes a real successful call, reads every page and acknowledges actual consumer processing', async () => {
  const blocks = ['Hello', ' world'].map((text, index) => {
    const block = judgePart({
      kind: 'text',
      id: `answer-${index}`,
      text,
      visibility: { toHuman: true, toModel: true },
    })
    if ('rejected' in block || block.ok.kind !== 'text') throw new Error('Invalid acceptance block')
    return block.ok
  })
  const f = createAcceptanceAssembly({
    paging: { parts: 1, targetBytes: 128 },
    facts: blocks.flatMap((block, index) => [
      {
        kind: 'block-open' as const,
        index: String(index),
        mode: 'append' as const,
        content: 'text' as const,
      },
      { kind: 'block-delta' as const, index: String(index), delta: block.text },
      { kind: 'block-seal' as const, index: String(index), block },
    ]),
    termination: { kind: 'completed', reason: 'stop' },
  })
  const provider = createModelRuntime(f.dependencies, configuration)
  const access = { ...f.access, call: f.call }
  const admission = operation('admit')
  const admitted = await provider.runtime.calls.admit({
    ...access,
    operation: admission,
    request: f.request,
    consumer: f.consumer,
    capacity: f.capacity,
  })
  expect(admitted).toMatchObject({ ok: { call: f.call, recovered: false } })
  const driving = provider.driver.drive(f.driveInput, new AbortController().signal)
  let observer: AsyncIterator<Observation> | undefined
  try {
    await Promise.race([
      f.publicationReady,
      driving.then(reply => {
        throw new Error(`Drive ended before observation: ${JSON.stringify(reply)}`)
      }),
    ])
    const connected = await provider.runtime.instances.connect(access)
    if ('failure' in connected || connected.ok.kind !== 'live') throw new Error('No live route')
    observer = connected.ok.handle
      .observe({ ...f.access, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    const first = await observer.next()
    expect(first).toMatchObject({
      done: false,
      value: { kind: 'snapshot', value: { call: f.call } },
    })
    f.upstream.resume()
    expect(await driving).toHaveProperty('ok')
    const observed = []
    while (true) {
      const next = await observer.next()
      if (next.done || next.value.kind === 'ended')
        throw new Error('Observation ended before settlement')
      expect(next.value.kind).toBe('changed')
      expect(next.value.value.call).toBe(f.call)
      observed.push(next.value.value)
      if (next.value.value.state.phase === 'settled') break
    }
    const final = observed.at(-1)
    expect(final?.blocks).toEqual(
      blocks.map((block, index) => ({ kind: 'sealed', index: String(index), block })),
    )
    expect(final?.state).toMatchObject({
      phase: 'settled',
      settlement: { termination: { kind: 'completed', reason: 'stop' } },
    })
    const lookup = await provider.runtime.calls.inspect({ ...access, admission })
    if ('failure' in lookup || lookup.ok.kind !== 'found' || lookup.ok.state.phase !== 'settled')
      throw new Error('No settled result')
    const settlement = lookup.ok.state.settlement
    expect(final?.state).toEqual(lookup.ok.state)
    const firstRead = await provider.runtime.consumption.beginRead({
      ...access,
      operation: operation('read'),
      result: settlement.version,
    })
    if ('failure' in firstRead || firstRead.ok.kind !== 'started')
      throw new Error('Read did not start')
    const reading = { ...access, read: firstRead.ok.read }
    const parts: ResultPart[] = []
    let pages = 0
    let state = firstRead.ok.value
    try {
      while (state.kind === 'reading') {
        expect(state.page.settlement).toEqual(settlement)
        parts.push(...state.page.parts)
        pages++
        if (state.page.next === null) break
        const next = await provider.runtime.consumption.readNext({
          ...reading,
          after: state.page.next,
        })
        if ('failure' in next) throw new Error(`Read failed: ${JSON.stringify(next.failure)}`)
        state = next.ok
      }
      expect(state.kind).toBe('reading')
    } finally {
      expect(await provider.runtime.consumption.closeRead(reading)).toEqual({
        ok: { kind: 'ended', reason: 'closed' },
      })
    }
    expect(pages).toBe(2)
    expect(parts).toEqual(blocks.map(block => ({ kind: 'sealed', block, trims: [] })))
    const outcome = parts
      .map(part => (part.kind === 'sealed' && part.block.kind === 'text' ? part.block.text : ''))
      .join('')
    expect(outcome).toBe('Hello world')
    const completion = f.completedRecords.finish({
      result: settlement.version,
      consumer: f.consumer,
      outcome,
    })
    const ackOperation = operation('ack')
    const acknowledged = await provider.runtime.consumption.acknowledge({
      ...access,
      operation: ackOperation,
      result: settlement.version,
      evidence: { kind: 'processed', completion },
    })
    expect(acknowledged).toMatchObject({
      ok: {
        call: f.call,
        result: settlement.version,
        custody: { kind: 'acknowledged', operation: ackOperation, cleanup: 'pending' },
      },
    })
    if ('failure' in acknowledged) throw new Error('ACK failed')
    const after = await provider.runtime.calls.inspect({ ...access, admission })
    expect(after).toMatchObject({
      ok: {
        kind: 'found',
        state: { call: f.call, phase: 'settled', settlement, custody: acknowledged.ok.custody },
      },
    })
    expect(f.counts.preserves).toBeGreaterThan(0)
    expect(f.counts.settlements).toBe(1)
    expect(f.upstream.counts()).toMatchObject({ start: 1, closeMaterialized: 1 })
  } finally {
    await observer?.return?.()
    f.upstream.resume()
    await driving
    await f.withdrawPublication()
  }
  expect(await provider.runtime.instances.connect(access)).toEqual({
    ok: { kind: 'no-live-route' },
  })
})
