import { expect, it, vi } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { type Observation } from '@omne-harness/model-contract'
import { compareRevisions, type TransportFact } from '@omne-harness/model-contract/provider'
import { runtimeFixture, configuration, eventually } from './runtime-fixture.ts'
import { unbox, op, instance, proof } from './memory-fixture.ts'

function manual(f: ReturnType<typeof runtimeFixture>) {
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      instances: { ...f.dependencies.instances, schedule: async () => ({ ok: { queued: true } }) },
    },
    configuration,
  )
  const input = {
    ...f.admit,
    operation: op(`claim-${f.admit.call}`),
    instance: instance(f.admit.call),
    continuity: proof(f.admit.call),
  }
  return {
    provider,
    drive: (signal = new AbortController().signal) => provider.driver.drive(input, signal),
  }
}
async function snapshot(m: ReturnType<typeof manual>, f: ReturnType<typeof runtimeFixture>) {
  const route = unbox(
    await m.provider.runtime.instances.connect({
      principal: f.principal,
      tenant: f.tenant,
      reference: f.reference,
    }),
  )
  if (route.kind !== 'live') throw new Error('missing live route')
  const observer = route.handle
    .observe({ ...f.admit, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  try {
    const item = await observer.next()
    if (item.done || item.value.kind !== 'snapshot') throw new Error('missing snapshot')
    return item.value.value
  } finally {
    await observer.return?.()
  }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const open: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
const end: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }

it('retains the original started stream when its optional projection read throws', async () => {
  let failRead = false
  const f = runtimeFixture({}, commands => ({
    ...commands,
    async recordSend(input) {
      const result = await commands.recordSend(input)
      if ('ok' in result) failRead = true
      return result
    },
    async loadRecovery(input) {
      if (failRead) {
        failRead = false
        throw new Error('projection-read-failed')
      }
      return commands.loadRecovery(input)
    },
  }))
  const m = manual(f)
  unbox(await m.provider.runtime.calls.admit(f.admit))
  const running = m.drive()
  try {
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([
      open,
      { kind: 'block-delta', index: '0', delta: 'retained' },
      end,
    ])
    unbox(await running)
    expect((await snapshot(m, f)).blocks).toMatchObject([{ value: 'retained' }])
    expect(f.channel(f.admit.call).starts).toBe(1)
    expect(f.channel(f.admit.call).closes).toBe(1)
    expect(f.channel(f.admit.call).returns).toBe(1)
    expect(f.preserveInputs[0]?.window).toBe(f.openInputs[0]?.window)
    unbox(await m.drive())
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    await f.dispose()
    await Promise.allSettled([running])
  }
})

it('advances a confirmed preserve before optional refresh failure and never replays its receipt', async () => {
  let failRead = false
  let first = true
  const stop = new AbortController()
  const f = runtimeFixture({}, commands => ({
    ...commands,
    async preserve(input) {
      const result = await commands.preserve(input)
      if ('ok' in result && first) {
        first = false
        failRead = true
        stop.abort()
      }
      return result
    },
    async loadRecovery(input) {
      if (failRead) {
        failRead = false
        throw new Error('projection-read-failed')
      }
      return commands.loadRecovery(input)
    },
  }))
  const m = manual(f)
  unbox(await m.provider.runtime.calls.admit(f.admit))
  const running = m.drive(stop.signal)
  void running.catch(() => {})
  try {
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([open])
    unbox(await running)
    unbox(
      await m.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-after-confirm') }),
    )
    const before = await snapshot(m, f)
    expect(before.state.control.kind).toBe('requested')
    const retry = m.drive()
    try {
      await eventually(() => f.channel(f.admit.call).reads === 2)
      expect(f.preserveInputs).toHaveLength(1)
      const after = await snapshot(m, f)
      expect(after.state.control.kind).toBe('requested')
      expect(compareRevisions(after.state.revision, before.state.revision)).toBeGreaterThanOrEqual(
        0,
      )
    } finally {
      f.channel(f.admit.call).push([end])
      await retry
    }
    expect(new Set(f.preserveInputs.map(input => input.operation)).size).toBe(
      f.preserveInputs.length,
    )
  } finally {
    await f.dispose()
    await Promise.allSettled([running])
  }
})

for (const refresh of ['throws', 'waits'] as const) {
  it(`releases a rejected preserve exactly once when optional refresh ${refresh}`, async () => {
    let failRead = false
    const gate = deferred()
    const f = runtimeFixture({}, commands => ({
      ...commands,
      async preserve(input) {
        const result = await commands.preserve(input)
        if ('failure' in result) failRead = true
        return result
      },
      async loadRecovery(input) {
        if (failRead) {
          failRead = false
          if (refresh === 'throws') throw new Error('projection-read-failed')
          await gate.promise
        }
        return commands.loadRecovery(input)
      },
    }))
    const m = manual(f)
    unbox(await m.provider.runtime.calls.admit(f.admit))
    const running = m.drive()
    void running.catch(() => {})
    try {
      await f.start(f.admit.call)
      f.channel(f.admit.call).push([
        { kind: 'block-delta', index: '0', delta: 'invalid-before-open' },
      ])
      await eventually(() => f.channel(f.admit.call).closes === 1)
      expect(await running).toMatchObject({ failure: { kind: 'invalid' } })
      gate.resolve()
      expect(await m.drive()).toMatchObject({ failure: { kind: 'invalid' } })
      expect(f.preserveInputs).toHaveLength(1)
      expect(f.channel(f.admit.call).closes).toBe(1)
      expect(f.channel(f.admit.call).returns).toBe(1)
    } finally {
      gate.resolve()
      await f.dispose()
      await Promise.allSettled([running])
    }
  })
}

for (const boundary of ['next', 'preserve', 'release'] as const) {
  it(`keeps the same-call driver locked throughout pending ${boundary}`, async () => {
    const gate = deferred()
    let entered = false
    const f = runtimeFixture({}, commands => ({
      ...commands,
      async preserve(input) {
        if (boundary === 'preserve' && !entered) {
          entered = true
          await gate.promise
        }
        return commands.preserve(input)
      },
    }))
    const m = manual(f)
    const channel = f.channel(f.admit.call)
    if (boundary === 'release')
      channel.beforeRelease = async () => {
        entered = true
        await gate.promise
      }
    unbox(await m.provider.runtime.calls.admit(f.admit))
    const first = m.drive()
    void first.catch(() => {})
    let second: ReturnType<typeof m.drive> | undefined
    try {
      await f.start(f.admit.call)
      if (boundary !== 'next') channel.push([end])
      await eventually(() => (boundary === 'next' ? channel.reads === 1 : entered))
      let settled = false
      second = m.drive().then(result => {
        settled = true
        return result
      })
      for (let i = 0; i < 200; i++) await Promise.resolve()
      expect(settled).toBe(true)
      expect(await second).toMatchObject({ failure: { diagnostic: 'drive-already-running' } })
    } finally {
      gate.resolve()
      channel.push([end])
      channel.finish()
      await Promise.allSettled([first, second])
      await f.dispose()
    }
    unbox(await first)
    expect(channel.starts).toBe(1)
    expect(channel.closes).toBe(1)
    expect(channel.returns).toBe(1)
    expect(new Set(f.preserveInputs.map(input => input.window)).size).toBe(f.preserveInputs.length)
  })
}

it('never replaces newer confirmed control with a delayed older authoritative state', async () => {
  let stallNext = false
  let entered = false
  const gate = deferred()
  const f = runtimeFixture({}, commands => ({
    ...commands,
    async recordSend(input) {
      const result = await commands.recordSend(input)
      if ('ok' in result) stallNext = true
      return result
    },
    async loadRecovery(input) {
      const result = await commands.loadRecovery(input)
      if (stallNext) {
        stallNext = false
        entered = true
        await gate.promise
      }
      return result
    },
  }))
  const m = manual(f)
  unbox(await m.provider.runtime.calls.admit(f.admit))
  const running = m.drive()
  try {
    await f.start(f.admit.call)
    await eventually(() => entered)
    unbox(await m.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-newer') }))
    const before = await snapshot(m, f)
    gate.resolve()
    await eventually(() => f.channel(f.admit.call).reads === 1)
    for (let i = 0; i < 100; i++) await Promise.resolve()
    const after = await snapshot(m, f)
    expect(before.state.control.kind).toBe('requested')
    expect(after.state.control.kind).toBe('requested')
    expect(compareRevisions(after.state.revision, before.state.revision)).toBeGreaterThanOrEqual(0)
  } finally {
    gate.resolve()
    f.channel(f.admit.call).push([end])
    await running
    await f.dispose()
  }
})

it('keeps an equal-revision refresh silent and delivers the next newer revision to the same pending observer', async () => {
  const f = runtimeFixture()
  const waits = vi.spyOn(f.dependencies.clock, 'waitUntil')
  const m = manual(f)
  unbox(await m.provider.runtime.calls.admit(f.admit))
  const running = m.drive()
  let observer: AsyncIterator<Observation> | undefined
  try {
    await f.start(f.admit.call)
    await eventually(() => f.channel(f.admit.call).reads === 1)
    const route = unbox(
      await m.provider.runtime.instances.connect({
        principal: f.principal,
        tenant: f.tenant,
        reference: f.reference,
      }),
    )
    if (route.kind !== 'live') throw new Error('missing live route')
    observer = route.handle
      .observe({ ...f.admit, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    expect(await observer.next()).toMatchObject({ value: { kind: 'snapshot' } })
    const cancellation = { ...f.admit, operation: op('cancel-equal-revision') }
    const first = observer.next()
    unbox(await m.provider.runtime.calls.cancel(cancellation))
    const cancelled = await first
    if (cancelled.done || cancelled.value.kind !== 'changed')
      throw new Error('missing cancellation update')
    const revision = cancelled.value.value.state.revision
    const pending = observer.next()
    await eventually(() => f.controls.clock.pending() === 1)
    unbox(await m.provider.runtime.calls.cancel(cancellation))
    expect(unbox(await f.dependencies.commands.loadRecovery(f.admit)).state.revision).toBe(revision)
    const before = waits.mock.calls.length
    f.controls.clock.advanceTo('2026-10-19T00:00:00.025Z')
    await eventually(() => waits.mock.calls.length === before + 1)
    expect(f.controls.clock.pending()).toBe(1)
    f.channel(f.admit.call).push([open])
    const changed = await pending
    if (changed.done || changed.value.kind !== 'changed') throw new Error('missing newer update')
    expect(compareRevisions(changed.value.value.state.revision, revision)).toBeGreaterThan(0)
    expect(changed.value.value.blocks).toMatchObject([{ index: '0' }])
  } finally {
    await observer?.return?.()
    f.channel(f.admit.call).push([end])
    await running
    await f.dispose()
    waits.mockRestore()
  }
  expect(f.controls.clock.pending()).toBe(0)
})
