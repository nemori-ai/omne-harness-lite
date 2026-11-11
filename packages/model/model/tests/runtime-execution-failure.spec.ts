import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import type { ModelFailure } from '@omne-harness/model-contract'
import type { ModelCommands, TransportFact } from '@omne-harness/model-contract/provider'
import { invocationReference } from './reference-input.ts'
import { configuration, eventually, runtimeFixture } from './runtime-fixture.ts'
import { instance, op, proof, unbox } from './memory-fixture.ts'

type Commands = ModelCommands<ReturnType<typeof runtimeFixture>['principal']>
type Write = 'prepareDispatch' | 'openReceiveWindow' | 'preserve'
const refusal: ModelFailure = { kind: 'invalid', field: 'synthetic', reason: 'refused' }
const open: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
const delta: TransportFact = { kind: 'block-delta', index: '0', delta: 'kept' }

/** A runtime whose `write` answers `failure` from its `from`-th call on. No drive is scheduled. */
function refusing(write: Write, failure: ModelFailure, from = 1) {
  const calls = { [write]: 0, settle: 0 } as Record<Write | 'settle', number>
  const f = runtimeFixture({}, commands => {
    const wrapped: Commands = {
      ...commands,
      settle: input => {
        calls.settle++
        return commands.settle(input)
      },
    }
    const original = commands[write] as (input: never) => ReturnType<Commands[Write]>
    wrapped[write] = ((input: never) =>
      ++calls[write] >= from ? Promise.resolve({ failure }) : original(input)) as never
    return wrapped
  })
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      instances: { ...f.dependencies.instances, schedule: async () => ({ ok: { queued: true } }) },
    },
    configuration,
  )
  const drive = () =>
    provider.driver.drive(
      {
        ...f.admit,
        operation: op(`claim-${f.admit.call}`),
        instance: instance(f.admit.call),
        continuity: proof(f.admit.call),
      },
      new AbortController().signal,
    )
  async function state() {
    const result = unbox(
      await provider.runtime.calls.inspect({
        ...f.admit,
        reference: invocationReference({ ...f.admit, admission: f.admit.operation }),
      }),
    )
    if (result.kind !== 'found') throw new Error('missing accepted call')
    return result.state
  }
  return { f, provider, drive, state, calls }
}
const executionFailed = {
  phase: 'settled',
  settlement: {
    termination: {
      kind: 'failed',
      fault: { cause: 'persistence', diagnostic: 'execution-write-refused:invalid' },
    },
  },
}

it('ends the call as an execution failure when the prepare is refused', async () => {
  const m = refusing('prepareDispatch', refusal)
  try {
    unbox(await m.provider.runtime.calls.admit(m.f.admit))
    expect(await m.drive()).toEqual({ failure: refusal })
    expect(await m.state()).toMatchObject(executionFailed)
    expect(unbox(await m.provider.runtime.calls.dispatches(m.f.admit))).toEqual([])
    expect(await m.drive()).toEqual({ failure: refusal })
    expect(m.calls.settle).toBe(1)
  } finally {
    await m.f.dispose()
  }
})

for (const write of ['preserve', 'openReceiveWindow'] as const) {
  it(`ends the call as an execution failure and releases the stream when ${write} is refused`, async () => {
    // The sender opens the first window, so the receiver's first open is the second call.
    const m = refusing(write, refusal, write === 'preserve' ? 1 : 2)
    unbox(await m.provider.runtime.calls.admit(m.f.admit))
    const running = m.drive()
    try {
      await m.f.start(m.f.admit.call)
      m.f.channel(m.f.admit.call).push([open])
      if (write === 'openReceiveWindow') m.f.channel(m.f.admit.call).push([delta])
      expect(await running).toEqual({ failure: refusal })
      expect(await m.state()).toMatchObject(executionFailed)
      expect(m.f.channel(m.f.admit.call)).toMatchObject({ returns: 1, closes: 1 })
      expect(await m.drive()).toEqual({ failure: refusal })
      expect(m.calls.settle).toBe(1)
    } finally {
      await m.f.dispose()
      await Promise.allSettled([running])
    }
  })
}

it('writes no terminal when the execution was taken over', async () => {
  const stale: ModelFailure = { kind: 'stale-instance', instance: instance('successor') }
  const m = refusing('preserve', stale)
  unbox(await m.provider.runtime.calls.admit(m.f.admit))
  const running = m.drive()
  try {
    await m.f.start(m.f.admit.call)
    m.f.channel(m.f.admit.call).push([open])
    expect(await running).toEqual({ failure: stale })
    expect((await m.state()).phase).not.toBe('settled')
    expect(m.calls.settle).toBe(0)
    expect(m.f.channel(m.f.admit.call)).toMatchObject({ returns: 1, closes: 1 })
  } finally {
    await m.f.dispose()
    await Promise.allSettled([running])
  }
})

it('saves the same batch at the new revision after another writer advanced the call', async () => {
  let conflicts = 0
  const f = runtimeFixture({}, commands => ({
    ...commands,
    preserve: async input => {
      if (conflicts++ === 0)
        return {
          failure: { kind: 'conflict', operation: input.operation, revision: input.expected },
        }
      return commands.preserve(input)
    },
  }))
  const m = refusingNothing(f)
  unbox(await m.provider.runtime.calls.admit(f.admit))
  const first = m.drive()
  try {
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([open])
    expect(await first).toMatchObject({ failure: { kind: 'conflict' } })
    const second = m.drive()
    await eventually(() => f.preserveInputs.length === 2)
    expect(f.preserveInputs[1]?.facts).toEqual(f.preserveInputs[0]?.facts)
    expect(f.preserveInputs[1]?.operation).not.toBe(f.preserveInputs[0]?.operation)
    f.channel(f.admit.call).push([
      { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } },
    ])
    expect(await second).toEqual({ ok: undefined })
  } finally {
    await f.dispose()
    await Promise.allSettled([first])
  }
})

function refusingNothing(f: ReturnType<typeof runtimeFixture>) {
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      instances: { ...f.dependencies.instances, schedule: async () => ({ ok: { queued: true } }) },
    },
    configuration,
  )
  return {
    provider,
    drive: () =>
      provider.driver.drive(
        {
          ...f.admit,
          operation: op(`claim-${f.admit.call}`),
          instance: instance(f.admit.call),
          continuity: proof(f.admit.call),
        },
        new AbortController().signal,
      ),
  }
}

/** A runtime whose send boundary answers `first` once, then is the real boundary. */
function notStarted(first: ModelFailure) {
  const f = runtimeFixture()
  let asked = 0
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      instances: { ...f.dependencies.instances, schedule: async () => ({ ok: { queued: true } }) },
      send: {
        ...f.dependencies.send,
        send: (demand, signal) =>
          asked++ === 0
            ? Promise.resolve({ kind: 'not-started', failure: first })
            : f.dependencies.send.send(demand, signal),
      },
    },
    configuration,
  )
  const claim = {
    ...f.admit,
    operation: op(`claim-${f.admit.call}`),
    instance: instance(f.admit.call),
    continuity: proof(f.admit.call),
  }
  return { f, provider, drive: () => provider.driver.drive(claim, new AbortController().signal) }
}

it('ends the call as an execution failure when the send boundary refuses without a terminal', async () => {
  const m = notStarted(refusal)
  try {
    unbox(await m.provider.runtime.calls.admit(m.f.admit))
    expect(await m.drive()).toEqual({ failure: refusal })
    const state = unbox(await m.f.dependencies.commands.loadRecovery(m.f.admit)).state
    expect(state).toMatchObject(executionFailed)
    expect(unbox(await m.provider.runtime.calls.dispatches(m.f.admit))).toHaveLength(1)
  } finally {
    await m.f.dispose()
  }
})

it('asks the send boundary again after it could not start the send', async () => {
  const busy: ModelFailure = { kind: 'unavailable', dependency: 'model-send', diagnostic: 'busy' }
  const m = notStarted(busy)
  unbox(await m.provider.runtime.calls.admit(m.f.admit))
  expect(await m.drive()).toEqual({ failure: busy })
  const second = m.drive()
  try {
    await m.f.start(m.f.admit.call)
    m.f
      .channel(m.f.admit.call)
      .push([{ kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }])
    expect(await second).toEqual({ ok: undefined })
    const state = unbox(await m.f.dependencies.commands.loadRecovery(m.f.admit)).state
    expect(state).toMatchObject({
      phase: 'settled',
      settlement: { termination: { kind: 'completed' } },
    })
    expect(unbox(await m.provider.runtime.calls.dispatches(m.f.admit))).toHaveLength(1)
  } finally {
    await m.f.dispose()
    await Promise.allSettled([second])
  }
})
