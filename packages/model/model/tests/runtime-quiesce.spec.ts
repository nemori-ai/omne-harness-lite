import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { invocationReference } from './reference-input.ts'
import { configuration, eventually, runtimeFixture } from './runtime-fixture.ts'
import { callId, fixture, op, unbox } from './memory-fixture.ts'

type Principal = ReturnType<typeof fixture>['principal']

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
/** A runtime whose host accepts wake-ups but never drives: admitted calls stay pending. */
function idle(wrap?: (commands: ModelCommands<Principal>) => ModelCommands<Principal>) {
  const f = fixture()
  const assembly = createTestModelDependencies({
    ...f.options,
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 2,
    maxQueued: 100,
    sends: [],
  })
  const commands = wrap?.(assembly.dependencies.commands) ?? assembly.dependencies.commands
  const provider = createModelRuntime({ ...assembly.dependencies, commands }, configuration)
  return { ...f, ...assembly, provider }
}
function another(f: ReturnType<typeof fixture>, label: string) {
  return { ...f.admit, call: callId(label), operation: op(`admit-${label}`) }
}

it('refuses a new admission after quiesce without leaving a call, and keeps the accepted one', async () => {
  const f = idle()
  const runtime = f.provider.runtime
  const accepted = unbox(await runtime.calls.admit(f.admit))
  unbox(await f.provider.quiesce())
  const late = another(f, 'late')
  expect(await runtime.calls.admit(late)).toEqual({
    failure: { kind: 'unavailable', dependency: 'model-runtime', diagnostic: 'quiesced' },
  })
  const reference = invocationReference({ ...late, admission: late.operation })
  expect(unbox(await runtime.calls.inspect({ ...late, reference }))).toEqual({
    kind: 'not-accepted',
    operation: late.operation,
  })
  expect(unbox(await runtime.calls.inspect({ ...f.admit, reference: f.reference }))).toMatchObject({
    kind: 'found',
    state: { call: accepted.call, phase: 'accepted' },
  })
})

it('recovers the original admission of the same operation after quiesce', async () => {
  const f = idle()
  const runtime = f.provider.runtime
  const accepted = unbox(await runtime.calls.admit(f.admit))
  unbox(await f.provider.quiesce())
  expect(unbox(await runtime.calls.admit(f.admit))).toEqual({ ...accepted, recovered: true })
  expect(unbox(await f.provider.quiesce())).toEqual({ pending: '1', running: '0' })
})

it('reports admitted calls that no drive holds as pending', async () => {
  const f = idle()
  expect(unbox(await f.provider.quiesce())).toEqual({ pending: '0', running: '0' })
  unbox(await f.provider.runtime.calls.admit(f.admit))
  unbox(await f.provider.runtime.calls.admit(another(f, 'second')))
  expect(unbox(await f.provider.quiesce())).toEqual({ pending: '2', running: '0' })
})

it('reports a call in drive as running rather than pending, and drops it once settled', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    expect(unbox(await f.provider.quiesce())).toEqual({ pending: '0', running: '1' })
    // Quiesce does not stop the accepted work: the drive still sends, receives and settles.
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ])
    await eventually(() => f.results.has(f.admit.call))
    expect(f.results.get(f.admit.call)).toEqual({ ok: undefined })
    expect(unbox(await f.provider.quiesce())).toEqual({ pending: '0', running: '0' })
  } finally {
    await f.dispose()
  }
})

it('keeps control and queries of accepted calls available after quiesce', async () => {
  const f = idle()
  const runtime = f.provider.runtime
  unbox(await runtime.calls.admit(f.admit))
  unbox(await f.provider.quiesce())
  expect(unbox(await runtime.calls.cancel({ ...f.admit, operation: op('cancel') }))).toMatchObject({
    kind: 'requested',
    operation: op('cancel'),
  })
  expect(unbox(await runtime.calls.dispatches(f.admit))).toEqual([])
  expect(unbox(await runtime.calls.inspect({ ...f.admit, reference: f.reference }))).toMatchObject({
    kind: 'found',
    state: { control: { kind: 'requested' } },
  })
})

it('waits for an admission that passed the gate before quiesce and counts it', async () => {
  const gate = deferred<void>()
  let entered = false
  const f = idle(commands => ({
    ...commands,
    async admit(input) {
      entered = true
      await gate.promise
      return commands.admit(input)
    },
  }))
  const admission = f.provider.runtime.calls.admit(f.admit)
  await eventually(() => entered)
  let reported = false
  const quiesced = f.provider.quiesce().then(value => {
    reported = true
    return value
  })
  for (let i = 0; i < 50; i++) await Promise.resolve()
  expect(reported).toBe(false)
  gate.resolve()
  expect(unbox(await admission).recovered).toBe(false)
  expect(unbox(await quiesced)).toEqual({ pending: '1', running: '0' })
})
