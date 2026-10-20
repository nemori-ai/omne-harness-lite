import { expect, it } from 'vitest'
import { resultFacts } from './runtime-settlement-facts.ts'
import { eventually, runtimeFixture } from './runtime-fixture.ts'
import { settleRuntime, partialParts } from './runtime-consumption-fixture.ts'
import { callId, identity, op, proof, unbox } from './memory-fixture.ts'

for (const target of [1024, 128]) {
  it(`freezes the real result at 2/${target}, enforces issued boundaries and retains whole pages`, async () => {
    const f = runtimeFixture()
    try {
      const settlement = await settleRuntime(f, partialParts, {
        resultPageParts: 2,
        resultPageTargetBytes: target,
      })
      f.denied.add('recovery')
      f.denied.add('control')
      const input = { ...f.admit, operation: op('read'), result: settlement.version }
      const first = unbox(await f.provider.runtime.consumption.beginRead(input))
      if (first.kind !== 'started' || first.value.kind !== 'reading')
        throw new Error('missing page')
      expect(first.value.page.parts.length).toBe(target === 1024 ? 2 : 1)
      expect(() =>
        f.controls.commands.configureResultPaging({
          ...f.admit,
          resultPageParts: 1,
          resultPageTargetBytes: 1,
        }),
      ).toThrow('frozen')
      expect(await f.provider.runtime.consumption.beginRead(input)).toEqual({ ok: first })
      const parts = [...first.value.page.parts]
      let after = first.value.page.next
      expect(
        await f.provider.runtime.consumption.readNext({ ...f.admit, read: first.read, after: '3' }),
      ).toMatchObject({ failure: { field: 'after' } })
      while (after !== null) {
        const nextInput = { ...f.admit, read: first.read, after }
        const next = unbox(await f.provider.runtime.consumption.readNext(nextInput))
        expect(await f.provider.runtime.consumption.readNext(nextInput)).toEqual({ ok: next })
        if (next.kind !== 'reading') throw new Error('read ended prematurely')
        expect(next.page.settlement).toEqual(settlement)
        expect(Buffer.byteLength(JSON.stringify(next.page))).toBeLessThanOrEqual(
          Number(f.admit.capacity.bytes),
        )
        parts.push(...next.page.parts)
        after = next.page.next
      }
      expect(parts).toEqual(partialParts)
      const close = { ...f.admit, read: first.read }
      expect(unbox(await f.provider.runtime.consumption.closeRead(close))).toEqual({
        kind: 'ended',
        reason: 'closed',
      })
      expect(await f.provider.runtime.consumption.closeRead(close)).toEqual({
        ok: { kind: 'ended', reason: 'closed' },
      })
    } finally {
      await f.dispose()
    }
  })
}
it('rejects paging preparation atomically before freezing, including unknown calls and unsafe limits', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    const before = await f.dependencies.commands.loadRecovery(f.admit)
    const original = { ...f.admit, resultPageParts: 2, resultPageTargetBytes: 1024 }
    for (const change of [
      { resultPageParts: 0 },
      { resultPageTargetBytes: Number.MAX_SAFE_INTEGER + 1 },
      { resultPageParts: 0.5 },
      { resultPageTargetBytes: NaN },
      { call: callId('missing') },
      { tenant: {} },
    ])
      expect(() =>
        Reflect.apply(f.controls.commands.configureResultPaging, undefined, [
          { ...original, ...change },
        ]),
      ).toThrow()
    expect(await f.dependencies.commands.loadRecovery(f.admit)).toEqual(before)
    // A rejected two-field update must not leave its first valid field behind.
    expect(() =>
      f.controls.commands.configureResultPaging({
        ...original,
        resultPageParts: 3,
        resultPageTargetBytes: 0,
      }),
    ).toThrow()
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([
      ...resultFacts(partialParts),
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: { cause: 'upstream-protocol', diagnostic: 'partial', upstreamStatus: null },
        },
      },
    ])
    await eventually(() => f.results.has(f.admit.call))
    const record = unbox(await f.dependencies.commands.loadRecovery(f.admit))
    if (record.state.phase !== 'settled') throw new Error('missing settlement')
    const read = unbox(
      await f.provider.runtime.consumption.beginRead({
        ...f.admit,
        operation: op('unchanged-config'),
        result: record.state.settlement.version,
      }),
    )
    if (read.kind !== 'started' || read.value.kind !== 'reading') throw new Error('missing read')
    expect(read.value.page.parts).toEqual(partialParts.slice(0, 1))
    expect(read.value.page.next).toBe('1')
  } finally {
    await f.dispose()
  }
})
it('keeps the original read and first page after ACK, then returns ended or acknowledged by operation identity', async () => {
  const f = runtimeFixture()
  try {
    const settled = await settleRuntime(f)
    const input = { ...f.admit, operation: op('read'), result: settled.version }
    const first = unbox(await f.provider.runtime.consumption.beginRead(input))
    if (
      first.kind !== 'started' ||
      first.value.kind !== 'reading' ||
      first.value.page.next === null
    )
      throw new Error('missing pages')
    unbox(
      await f.provider.runtime.consumption.readNext({
        ...f.admit,
        read: first.read,
        after: first.value.page.next,
      }),
    )
    unbox(
      await f.provider.runtime.consumption.acknowledge({
        ...f.admit,
        operation: op('ack'),
        result: settled.version,
        evidence: {
          kind: 'processed',
          completion: proof(`${f.admit.call}/${settled.version}`, 'consumer'),
        },
      }),
    )
    expect(await f.provider.runtime.consumption.beginRead(input)).toEqual({ ok: first })
    unbox(await f.provider.runtime.consumption.closeRead({ ...f.admit, read: first.read }))
    expect(await f.provider.runtime.consumption.beginRead(input)).toEqual({
      ok: { kind: 'started', read: first.read, value: { kind: 'ended', reason: 'closed' } },
    })
    expect(
      await f.provider.runtime.consumption.beginRead({ ...input, operation: op('new-read') }),
    ).toMatchObject({ ok: { kind: 'acknowledged' } })
  } finally {
    await f.dispose()
  }
})
it('uses content authority for every read and hides settled results from another tenant', async () => {
  const f = runtimeFixture()
  try {
    const settled = await settleRuntime(f)
    const begin = { ...f.admit, operation: op('read'), result: settled.version }
    const first = unbox(await f.provider.runtime.consumption.beginRead(begin))
    if (
      first.kind !== 'started' ||
      first.value.kind !== 'reading' ||
      first.value.page.next === null
    )
      throw new Error('missing pages')
    const next = { ...f.admit, read: first.read, after: first.value.page.next }
    for (const call of [f.admit.call, callId('absent')]) {
      const cross = { ...next, call, tenant: identity('6') }
      expect(await f.provider.runtime.consumption.beginRead({ ...begin, ...cross })).toMatchObject({
        failure: { kind: 'denied', action: 'content' },
      })
      expect(await f.provider.runtime.consumption.readNext(cross)).toMatchObject({
        failure: { kind: 'denied', action: 'content' },
      })
      expect(await f.provider.runtime.consumption.closeRead(cross)).toMatchObject({
        failure: { kind: 'denied', action: 'content' },
      })
    }
    f.denied.add('content')
    expect(await f.provider.runtime.consumption.readNext(next)).toMatchObject({
      failure: { kind: 'denied' },
    })
    f.denied.delete('content')
    expect(await f.provider.runtime.consumption.readNext(next)).toEqual({
      ok: { kind: 'ended', reason: 'denied' },
    })
  } finally {
    await f.dispose()
  }
})
