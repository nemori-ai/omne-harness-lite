import { invocationReference } from './reference-input.ts'
import { judgePart } from '@omne-harness/message'
import { expect, it, vi } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import type {
  ModelCommands,
  Snapshot,
  Termination,
  TransportFact,
} from '@omne-harness/model-contract'
import { configuration, eventually, runtimeFixture } from './runtime-fixture.ts'
import { instance, op, proof, unbox } from './memory-fixture.ts'

type Settle = Parameters<ModelCommands<unknown>['settle']>[0]
const completed = { kind: 'completed', reason: 'stop' } as const
const end = (termination: TransportFact & { kind: 'ended' }) => termination
const prefix: TransportFact[] = [
  { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
  { kind: 'block-delta', index: '0', delta: 'kept' },
]
const answer: TransportFact[] = [
  ...prefix,
  {
    kind: 'block-seal',
    index: '0',
    block: (() => {
      const part = judgePart({
        kind: 'text',
        id: 'answer',
        text: 'kept',
        visibility: { toHuman: true, toModel: true },
      })
      if ('rejected' in part || part.ok.kind !== 'text') throw new Error('invalid text block')
      return part.ok
    })(),
  },
  { kind: 'ended', termination: completed },
]
const batching = { outputBatchDelayMs: 100, outputBatchBytes: 10000 }
async function inspect(f: ReturnType<typeof runtimeFixture>) {
  const result = unbox(
    await f.provider.runtime.calls.inspect({
      ...f.admit,
      reference: invocationReference({ ...f.admit, admission: f.admit.operation }),
    }),
  )
  if (result.kind !== 'found') throw new Error('missing accepted call')
  return result.state
}
async function settlement(f: ReturnType<typeof runtimeFixture>) {
  const state = await inspect(f)
  if (state.phase !== 'settled') throw new Error('call has not settled')
  return state.settlement
}
async function observe(f: ReturnType<typeof runtimeFixture>) {
  const route = unbox(
    await f.provider.runtime.instances.connect({
      principal: f.principal,
      tenant: f.tenant,
      reference: f.reference,
    }),
  )
  if (route.kind !== 'live') throw new Error('missing live route')
  return route.handle
    .observe({ ...f.admit, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
}
async function snapshot(f: ReturnType<typeof runtimeFixture>) {
  const observer = await observe(f)
  try {
    const item = await observer.next()
    if (item.done || item.value.kind !== 'snapshot') throw new Error('missing snapshot')
    return item.value.value
  } finally {
    await observer.return?.()
  }
}
async function finish(f: ReturnType<typeof runtimeFixture>, facts: TransportFact[]) {
  unbox(await f.provider.runtime.calls.admit(f.admit))
  await f.start(f.admit.call)
  f.channel(f.admit.call).push(facts)
  await eventually(() => f.results.has(f.admit.call))
  return f.results.get(f.admit.call)
}
async function savedParts(f: ReturnType<typeof runtimeFixture>) {
  // This settlement probe reads the memory Commands provider. Public consumption has separate tests.
  const result = unbox(
    await f.dependencies.commands.acquireRead({
      ...f.admit,
      operation: op('verify-saved'),
      result: (await settlement(f)).version,
    }),
  )
  if (result.kind !== 'started' || result.value.kind !== 'reading')
    throw new Error('missing saved result')
  const parts = result.value.page.parts
  unbox(await f.dependencies.commands.endRead({ ...f.admit, read: result.read }))
  return parts
}

it('settles actual completion once and preserves its result through cancel and trusted late-fact replay', async () => {
  const writes: Settle[] = []
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      writes.push(structuredClone(input))
      return commands.settle(input)
    },
  }))
  try {
    expect(await finish(f, answer)).toEqual({ ok: undefined })
    const original = await settlement(f)
    const dispatch = unbox(await f.provider.runtime.calls.dispatches(f.admit))[0]
    if (!dispatch) throw new Error('missing original dispatch')
    const late = {
      ...f.admit,
      operation: op('late'),
      dispatch: dispatch.dispatch,
      source: proof(`${f.admit.call}/${dispatch.dispatch}`, 'supplier'),
      fact: {
        kind: 'terminal',
        event: 'late',
        actual: {
          kind: 'failed',
          fault: {
            cause: 'upstream-protocol',
            upstreamStatus: '502',
            diagnostic: 'late-failure',
          },
        },
      },
    } satisfies Parameters<typeof f.dependencies.commands.recordLateFact>[0]
    unbox(await f.dependencies.commands.recordLateFact(late))
    unbox(await f.dependencies.commands.recordLateFact({ ...late, operation: op('late-replay') }))
    unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('after-end') }))
    unbox(await f.drive())
    expect(await settlement(f)).toEqual(original)
    expect(writes).toHaveLength(1)
    expect(f.channel(f.admit.call)).toMatchObject({
      starts: 1,
      reads: answer.length,
      returns: 1,
      closes: 1,
    })
  } finally {
    await f.dispose()
  }
})

it('keeps completed/limit and the actual trim reminder with the saved partial output', async () => {
  const f = runtimeFixture(batching)
  try {
    expect(
      await finish(f, [
        ...prefix,
        { kind: 'trim', index: '0', removed: '7', reason: 'output-limit' },
        end({ kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }),
      ]),
    ).toEqual({ ok: undefined })
    expect((await settlement(f)).termination).toEqual({ kind: 'completed', reason: 'limit' })
    expect(await savedParts(f)).toEqual([
      {
        kind: 'partial',
        content: 'text',
        value: 'kept',
        trims: [{ removed: '7', reason: 'output-limit' }],
      },
    ])
  } finally {
    await f.dispose()
  }
})
for (const reported of [
  { metric: 'context-tokens', limit: '2048', actual: '3000' },
  { metric: null, limit: null, actual: null },
] as const)
  it(`preserves the upstream input-over-limit report ${JSON.stringify(reported)}`, async () => {
    const termination: Termination = {
      kind: 'failed',
      fault: {
        cause: 'input-over-limit',
        reported,
        upstreamStatus: '413',
        diagnostic: 'upstream-size',
      },
    }
    const f = runtimeFixture(batching)
    try {
      expect(await finish(f, [end({ kind: 'ended', termination })])).toEqual({ ok: undefined })
      expect((await settlement(f)).termination).toEqual(termination)
      expect(f.channel(f.admit.call).starts).toBe(1)
    } finally {
      await f.dispose()
    }
  })

for (const effect of ['applied', 'not-applied'] as const)
  it(`retains the exact unknown ${effect} settle across query failure and revoked authority`, async () => {
    const writes: Settle[] = []
    let queryFails = false
    const f = runtimeFixture(batching, commands => ({
      ...commands,
      query: input => {
        if (queryFails) throw new Error('offline')
        return commands.query(input)
      },
      settle: async input => {
        writes.push(structuredClone(input))
        if (writes.length === 1)
          f.controls.commands.injectUnknown({ ...input, method: 'settle', effect })
        return commands.settle(input)
      },
    }))
    try {
      expect(await finish(f, answer)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      const original = writes[0]
      if (!original) throw new Error('missing settle')
      queryFails = true
      expect(await f.drive()).toMatchObject({ failure: { kind: 'unavailable' } })
      queryFails = false
      f.denied.add('recovery')
      expect(await f.drive()).toMatchObject({ failure: { kind: 'denied' } })
      f.denied.delete('recovery')
      expect(await f.drive()).toMatchObject({
        failure: { kind: 'commit-unknown', operation: original.operation },
      })
      expect(writes).toHaveLength(1)
      f.controls.commands.reveal({
        ...f.admit,
        operation: original.operation,
        result: effect === 'applied' ? 'committed' : 'not-committed',
      })
      f.setTrustedExecution(false)
      expect(await f.drive()).toMatchObject({ failure: { kind: 'denied' } })
      f.setTrustedExecution(true)
      unbox(await f.drive())
      expect(writes).toEqual([original, original, original])
      expect((await settlement(f)).termination).toEqual(completed)
      expect(f.channel(f.admit.call)).toMatchObject({
        starts: 1,
        reads: answer.length,
        returns: 1,
        closes: 1,
      })
    } finally {
      await f.dispose()
    }
  })

it('replays a committed settle whose original receipt is temporarily unavailable without creating another intent', async () => {
  const writes: Settle[] = []
  const references: Settle[] = []
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      writes.push(structuredClone(input))
      references.push(input)
      const result = await commands.settle(input)
      return writes.length < 3
        ? { failure: { kind: 'unavailable', dependency: 'receipt', diagnostic: 'offline' } }
        : result
    },
  }))
  try {
    expect(await finish(f, answer)).toMatchObject({ failure: { kind: 'unavailable' } })
    const original = await settlement(f)
    expect(await f.drive()).toMatchObject({ failure: { kind: 'unavailable' } })
    unbox(await f.drive())
    expect(writes).toHaveLength(3)
    expect(references[1]).toBe(references[0])
    expect(references[2]).toBe(references[0])
    expect(writes.every(input => JSON.stringify(input) === JSON.stringify(writes[0]))).toBe(true)
    expect(await settlement(f)).toEqual(original)
  } finally {
    await f.dispose()
  }
})

for (const boundary of ['preserve', 'settle'] as const)
  it(`keeps real completion when cancel races the terminal ${boundary} expected revision`, async () => {
    let raced = false
    const inputs: (Settle | Parameters<ModelCommands<unknown>['preserve']>[0])[] = []
    const f = runtimeFixture(batching, commands => {
      async function race(input: Settle | Parameters<typeof commands.preserve>[0]) {
        inputs.push(structuredClone(input))
        if (!raced) {
          raced = true
          unbox(await commands.control({ ...f.admit, operation: op('race') }))
        }
      }
      return boundary === 'preserve'
        ? {
            ...commands,
            preserve: async input => {
              await race(input)
              return commands.preserve(input)
            },
          }
        : {
            ...commands,
            settle: async input => {
              await race(input)
              return commands.settle(input)
            },
          }
    })
    try {
      expect(await finish(f, answer)).toEqual({ ok: undefined })
      expect(inputs).toHaveLength(2)
      expect(inputs[1]?.operation).not.toBe(inputs[0]?.operation)
      expect(inputs[1]?.expected).not.toBe(inputs[0]?.expected)
      if (boundary === 'preserve')
        expect(inputs.map(i => 'facts' in i && i.facts)).toEqual([answer, answer])
      expect((await settlement(f)).termination).toEqual(completed)
      expect(f.channel(f.admit.call)).toMatchObject({ starts: 1, reads: answer.length })
    } finally {
      await f.dispose()
    }
  })

it('makes at most one replacement settlement intent per drive under repeated real competition', async () => {
  let racing = true
  let writes = 0
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      writes++
      if (racing) {
        const dispatch = unbox(await commands.dispatches(f.admit))[0]
        if (!dispatch) throw new Error('missing dispatch')
        unbox(
          await commands.recordLateFact({
            ...f.admit,
            operation: op(`competitor-${writes}`),
            dispatch: dispatch.dispatch,
            source: proof(`${f.admit.call}/${dispatch.dispatch}`, 'supplier'),
            fact: { kind: 'terminal', event: `competitor-${writes}`, actual: completed },
          }),
        )
      }
      return commands.settle(input)
    },
  }))
  try {
    expect(await finish(f, answer)).toMatchObject({ failure: { kind: 'conflict' } })
    expect(writes).toBe(2)
    racing = false
    unbox(await f.drive())
    expect(writes).toBe(4)
    expect((await settlement(f)).termination).toEqual(completed)
  } finally {
    await f.dispose()
  }
})

it('settles while release hangs and keeps the original drive lock until the real release finishes', async () => {
  let resolved!: () => void
  const gate = new Promise<void>(resolve => {
    resolved = resolve
  })
  let committed = false
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      const result = await commands.settle(input)
      committed = 'ok' in result
      return result
    },
  }))
  f.channel(f.admit.call).beforeRelease = () => gate
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).push(answer)
    await eventually(() => committed)
    expect((await settlement(f)).termination).toEqual(completed)
    expect(f.results.has(f.admit.call)).toBe(false)
    expect(await f.drive()).toMatchObject({ failure: { diagnostic: 'drive-already-running' } })
    expect(f.channel(f.admit.call)).toMatchObject({ reads: answer.length, starts: 1 })
    resolved()
    await eventually(() => f.results.has(f.admit.call))
    expect(f.results.get(f.admit.call)).toEqual({ ok: undefined })
    unbox(await f.drive())
    expect(f.channel(f.admit.call).returns).toBe(1)
  } finally {
    resolved()
    await f.dispose()
  }
})

it('caches a failed release independently of a confirmed settlement and never releases twice', async () => {
  const f = runtimeFixture(batching)
  f.channel(f.admit.call).releaseFails = true
  try {
    const first = await finish(f, answer)
    expect(first).toMatchObject({ failure: { diagnostic: 'resource-release-failed' } })
    const original = await settlement(f)
    expect(await f.drive()).toEqual(first)
    expect(await settlement(f)).toEqual(original)
    expect(f.channel(f.admit.call)).toMatchObject({ returns: 1, closes: 1 })
  } finally {
    await f.dispose()
  }
})

it('returns the original settle failure first and reports cached release failure after confirmation', async () => {
  let fail = true
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: input =>
      fail
        ? Promise.resolve({
            failure: {
              kind: 'unavailable',
              dependency: 'settle-test',
              diagnostic: 'settle-offline',
            },
          })
        : commands.settle(input),
  }))
  f.channel(f.admit.call).releaseFails = true
  try {
    expect(await finish(f, answer)).toMatchObject({ failure: { dependency: 'settle-test' } })
    fail = false
    expect(await f.drive()).toMatchObject({ failure: { diagnostic: 'resource-release-failed' } })
    expect((await settlement(f)).termination).toEqual(completed)
    expect(f.channel(f.admit.call)).toMatchObject({ returns: 1, closes: 1 })
  } finally {
    await f.dispose()
  }
})

it('does not infer an interrupted control or silently decide a retry policy', async () => {
  for (const termination of [
    { kind: 'interrupted', stop: 'confirmed' },
    {
      kind: 'failed',
      fault: { cause: 'upstream-unavailable', upstreamStatus: '503', diagnostic: 'try-later' },
    },
  ] as const) {
    const f = runtimeFixture(batching)
    const adapter = f.options.evidence[0]
    if (!adapter) throw new Error('missing evidence adapter')
    adapter.receive = input => ({
      ok: { window: input.window, batchDigest: input.batchDigest, paused: true, noPrefetch: true },
    })
    try {
      expect(await finish(f, [end({ kind: 'ended', termination })])).toHaveProperty('failure')
      expect((await inspect(f)).phase).not.toBe('settled')
      expect(f.channel(f.admit.call)).toMatchObject({ starts: 1, reads: 1, returns: 1, closes: 1 })
    } finally {
      await f.dispose()
    }
  }
})

it('binds a real interrupted receipt to the control confirmed by its original preserve', async () => {
  const f = runtimeFixture(batching)
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    const control = unbox(
      await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('original-control') }),
    )
    if (control.kind !== 'requested') throw new Error('missing control')
    f.channel(f.admit.call).push([
      end({ kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } }),
    ])
    await eventually(() => f.results.has(f.admit.call))
    expect((await settlement(f)).termination).toEqual({
      kind: 'interrupted',
      control: control.operation,
    })
  } finally {
    await f.dispose()
  }
})

it('does not recover an original terminal from mutable dispatch history in a new runtime', async () => {
  let fail = true
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: input =>
      fail
        ? Promise.resolve({
            failure: { kind: 'unavailable', dependency: 'settle-test', diagnostic: 'offline' },
          })
        : commands.settle(input),
  }))
  try {
    await finish(f, answer)
    fail = false
    const successor = createModelRuntime(f.dependencies, configuration)
    unbox(
      await successor.driver.drive(
        {
          ...f.admit,
          operation: op('successor'),
          instance: instance('successor'),
          continuity: proof(f.admit.call),
        },
        new AbortController().signal,
      ),
    )
    expect((await inspect(f)).phase).not.toBe('settled')
    expect(f.channel(f.admit.call).starts).toBe(1)
    expect(await f.drive()).toMatchObject({ failure: { kind: 'stale-instance' } })
  } finally {
    await f.dispose()
  }
})

it('shares one replacement budget between terminal preserve and settle in the same drive', async () => {
  let preserved = false
  let writes = 0
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    preserve: async input => {
      if (!preserved) {
        preserved = true
        unbox(await commands.control({ ...f.admit, operation: op('preserve-race') }))
      }
      return commands.preserve(input)
    },
    settle: async input => {
      writes++
      if (writes === 1) {
        const dispatch = unbox(await commands.dispatches(f.admit))[0]
        if (!dispatch) throw new Error('missing dispatch')
        unbox(
          await commands.recordLateFact({
            ...f.admit,
            dispatch: dispatch.dispatch,
            operation: op('settle-race'),
            source: proof(`${f.admit.call}/${dispatch.dispatch}`, 'supplier'),
            fact: { kind: 'terminal', event: 'settle-race', actual: completed },
          }),
        )
      }
      return commands.settle(input)
    },
  }))
  try {
    expect(await finish(f, answer)).toMatchObject({ failure: { kind: 'conflict' } })
    expect(f.preserveInputs).toHaveLength(2)
    expect(writes).toBe(1)
    unbox(await f.drive())
    expect(writes).toBe(3)
    expect((await settlement(f)).termination).toEqual(completed)
  } finally {
    await f.dispose()
  }
})

it('settles persisted pre-send control through the same driver without creating a dispatch', async () => {
  const f = runtimeFixture()
  const provider = createModelRuntime(
    {
      ...f.dependencies,
      instances: {
        ...f.dependencies.instances,
        schedule: async () => ({ ok: { queued: true } }),
      },
    },
    configuration,
  )
  try {
    unbox(await provider.runtime.calls.admit(f.admit))
    unbox(await provider.runtime.calls.cancel({ ...f.admit, operation: op('before-send') }))
    unbox(
      await provider.driver.drive(
        {
          ...f.admit,
          operation: op('claim-before-send'),
          instance: instance(f.admit.call),
          continuity: proof(f.admit.call),
        },
        new AbortController().signal,
      ),
    )
    expect((await settlement(f)).termination).toEqual({
      kind: 'interrupted',
      control: op('before-send'),
    })
    expect(unbox(await provider.runtime.calls.dispatches(f.admit))).toEqual([])
  } finally {
    await f.dispose()
  }
})

it('does not redo a confirmed settle when its optional projection read throws', async () => {
  let failRefresh = false
  let writes = 0
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      writes++
      const result = await commands.settle(input)
      if ('ok' in result) failRefresh = true
      return result
    },
    loadRecovery: input => {
      if (failRefresh) {
        failRefresh = false
        throw new Error('projection-unavailable')
      }
      return commands.loadRecovery(input)
    },
  }))
  try {
    expect(await finish(f, answer)).toEqual({ ok: undefined })
    expect((await settlement(f)).termination).toEqual(completed)
    unbox(await f.drive())
    expect(writes).toBe(1)
    expect(f.channel(f.admit.call).returns).toBe(1)
  } finally {
    await f.dispose()
  }
})

for (const effect of ['applied', 'not-applied'] as const)
  it(`retains the terminal window through unknown ${effect} preserve and a later control race`, async () => {
    let original: Parameters<ModelCommands<unknown>['preserve']>[0] | undefined
    const f = runtimeFixture(batching, commands => ({
      ...commands,
      preserve: async input => {
        if (!original) {
          original = structuredClone(input)
          f.controls.commands.injectUnknown({ ...input, method: 'preserve', effect })
        }
        return commands.preserve(input)
      },
    }))
    try {
      expect(await finish(f, answer)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      if (!original) throw new Error('missing preserve')
      unbox(
        await f.provider.runtime.calls.cancel({
          ...f.admit,
          operation: op('during-terminal-unknown'),
        }),
      )
      expect(await f.drive()).toMatchObject({
        failure: { kind: 'commit-unknown', operation: original.operation },
      })
      f.controls.commands.reveal({
        ...f.admit,
        operation: original.operation,
        result: effect === 'applied' ? 'committed' : 'not-committed',
      })
      unbox(await f.drive())
      expect(f.preserveInputs[1]).toEqual(original)
      expect(
        f.preserveInputs.every(
          input =>
            input.window === original?.window &&
            JSON.stringify(input.facts) === JSON.stringify(original?.facts),
        ),
      ).toBe(true)
      expect((await settlement(f)).termination).toEqual(completed)
      expect(f.channel(f.admit.call)).toMatchObject({ starts: 1, reads: answer.length, returns: 1 })
    } finally {
      await f.dispose()
    }
  })

it('settles the immutable confirmed ended fact even after a late terminal changes dispatch history', async () => {
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    preserve: async input => {
      const result = await commands.preserve(input)
      if ('ok' in result)
        unbox(
          await commands.recordLateFact({
            ...f.admit,
            operation: op('before-settle-late'),
            dispatch: input.dispatch,
            source: proof(`${f.admit.call}/${input.dispatch}`, 'supplier'),
            fact: {
              kind: 'terminal',
              event: 'different-terminal',
              actual: { kind: 'completed', reason: 'limit' },
            },
          }),
        )
      return result
    },
  }))
  try {
    expect(await finish(f, answer)).toEqual({ ok: undefined })
    expect(unbox(await f.provider.runtime.calls.dispatches(f.admit))[0]?.terminal).toEqual({
      kind: 'completed',
      reason: 'limit',
    })
    expect((await settlement(f)).termination).toEqual(completed)
  } finally {
    await f.dispose()
  }
})

it('keeps a rejected preserve release failure visible on repeated drives without a second release', async () => {
  const f = runtimeFixture(batching)
  f.channel(f.admit.call).releaseFails = true
  try {
    const first = await finish(f, [
      { kind: 'block-delta', index: '0', delta: 'unopened' },
      { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } },
    ])
    expect(first).toMatchObject({ failure: { diagnostic: 'resource-release-failed' } })
    expect(await f.drive()).toEqual(first)
    expect(f.channel(f.admit.call)).toMatchObject({ returns: 1, closes: 1 })
  } finally {
    await f.dispose()
  }
})

it('retains failed partial tool arguments without sealing them into an executable suggestion', async () => {
  const f = runtimeFixture(batching)
  const termination = {
    kind: 'failed',
    fault: { cause: 'upstream-protocol', upstreamStatus: null, diagnostic: 'partial-arguments' },
  } as const
  try {
    expect(
      await finish(f, [
        { kind: 'block-open', index: '0', mode: 'append', content: 'tool-arguments' },
        { kind: 'block-delta', index: '0', delta: '{"kept":' },
        { kind: 'ended', termination },
      ]),
    ).toEqual({ ok: undefined })
    expect((await settlement(f)).termination).toEqual(termination)
    expect(await savedParts(f)).toEqual([
      { kind: 'partial', content: 'tool-arguments', value: '{"kept":', trims: [] },
    ])
  } finally {
    await f.dispose()
  }
})
for (const ending of ['eof', 'throws'] as const)
  it(`settles a real ${ending} stream failure while retaining confirmed partial output`, async () => {
    const f = runtimeFixture(batching)
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      await f.start(f.admit.call)
      f.channel(f.admit.call).push(prefix)
      await eventually(() => f.channel(f.admit.call).reads === prefix.length + 1)
      if (ending === 'eof') f.channel(f.admit.call).finish()
      else f.channel(f.admit.call).fail()
      await eventually(() => f.results.has(f.admit.call))
      expect(f.results.get(f.admit.call)).toMatchObject({
        failure: { diagnostic: 'fact-stream-failed' },
      })
      expect((await settlement(f)).termination).toMatchObject({
        kind: 'failed',
        fault: { cause: 'stream-lost', upstreamStatus: null },
      })
      expect(await savedParts(f)).toEqual([
        { kind: 'partial', content: 'text', value: 'kept', trims: [] },
      ])
      expect(f.channel(f.admit.call)).toMatchObject({ starts: 1, closes: 1 })
    } finally {
      await f.dispose()
    }
  })

it('hands back the same terminal evidence after the confirmation callback fails without re-preserving or re-reading', async () => {
  let confirmed: Snapshot | undefined
  const writes: Settle[] = []
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      writes.push(structuredClone(input))
      return commands.settle(input)
    },
    preserve: async input => {
      const result = await commands.preserve(input)
      if ('ok' in result) {
        confirmed = structuredClone(result.ok)
        const blocks = result.ok.blocks
        let reads = 0
        // The first read fixes receiver evidence. The second is the observation callback.
        // Only the returned object is faulted; the real committed Snapshot stays unchanged.
        Object.defineProperty(result.ok, 'blocks', {
          enumerable: true,
          get() {
            if (++reads === 2) throw new Error('confirmation-callback-failed')
            return blocks
          },
        })
      }
      return result
    },
  }))
  try {
    expect(await finish(f, answer)).toMatchObject({ failure: { diagnostic: 'drive-unconfirmed' } })
    unbox(await f.drive())
    expect((await settlement(f)).termination).toEqual(completed)
    const restored = await snapshot(f)
    expect(restored.blocks).toEqual(confirmed?.blocks)
    expect(restored.cursor).toBe(confirmed?.cursor)
    expect(restored.state).toEqual(await inspect(f))
    if (restored.state.phase !== 'settled') throw new Error('missing observed settlement')
    expect(restored.state.settlement.cursor).toBe(restored.cursor)
    unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('after-confirm') }))
    const controlled = await snapshot(f)
    expect(controlled.state.control.kind).toBe('requested')
    const observer = await observe(f)
    let next: ReturnType<typeof observer.next> | undefined
    try {
      expect(await observer.next()).toMatchObject({ value: { value: controlled } })
      let notified = false
      next = observer.next().then(value => {
        notified = true
        return value
      })
      unbox(await f.drive())
      for (let i = 0; i < 100; i++) await Promise.resolve()
      expect(notified).toBe(false)
    } finally {
      await observer.return?.()
      await next
    }
    expect(await snapshot(f)).toEqual(controlled)
    expect(writes).toHaveLength(1)
    expect(f.preserveInputs).toHaveLength(1)
    expect(f.channel(f.admit.call)).toMatchObject({
      starts: 1,
      reads: answer.length,
      returns: 1,
      closes: 1,
    })
  } finally {
    await f.dispose()
  }
})

it('keeps the content barrier through repeated confirmation failures and recovers the original Snapshot', async () => {
  const clone = globalThis.structuredClone
  let confirmationFailures = 0
  let restoredClone = () => {}
  let confirmed: Snapshot | undefined
  let settles = 0
  const f = runtimeFixture(batching, commands => ({
    ...commands,
    settle: async input => {
      settles++
      return commands.settle(input)
    },
    preserve: async input => {
      const result = await commands.preserve(input)
      if ('ok' in result) {
        confirmed = clone(result.ok)
        let snapshotClones = 0
        let failures = 2
        // Fault publication after receiver's first clone fixed the real committed Snapshot.
        const spy = vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
          if (
            value &&
            typeof value === 'object' &&
            'call' in value &&
            value.call === input.call &&
            'cursor' in value &&
            value.cursor === result.ok.cursor &&
            'blocks' in value &&
            ++snapshotClones > 1 &&
            failures > 0
          ) {
            failures--
            confirmationFailures++
            throw new Error('confirmation-callback-failed')
          }
          return clone(value, options)
        })
        restoredClone = () => spy.mockRestore()
      }
      return result
    },
  }))
  try {
    expect(await finish(f, answer)).toMatchObject({ failure: { diagnostic: 'drive-unconfirmed' } })
    const waiting = await snapshot(f)
    expect(await f.drive()).toMatchObject({ failure: { diagnostic: 'drive-unconfirmed' } })
    expect(confirmationFailures).toBe(2)
    expect(settles).toBe(0)
    expect((await inspect(f)).phase).toBe('running')
    expect(f.channel(f.admit.call)).toMatchObject({ returns: 0, closes: 0 })
    unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('while-confirming') }))
    for (let i = 0; i < 100; i++) await Promise.resolve()
    expect(await snapshot(f)).toEqual(waiting)
    unbox(await f.drive())
    const restored = await snapshot(f)
    expect(restored.blocks).toEqual(confirmed?.blocks)
    expect(restored.cursor).toBe(confirmed?.cursor)
    expect(restored.state).toEqual(await inspect(f))
    expect(restored.state.control.kind).toBe('requested')
    unbox(await f.drive())
    expect(await snapshot(f)).toEqual(restored)
    expect(settles).toBe(1)
    expect(f.preserveInputs).toHaveLength(1)
    expect(f.channel(f.admit.call)).toMatchObject({
      starts: 1,
      reads: answer.length,
      returns: 1,
      closes: 1,
    })
  } finally {
    restoredClone()
    await f.dispose()
  }
})
