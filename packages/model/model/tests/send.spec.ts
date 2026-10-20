import { expect, it } from 'vitest'
import { judgeContentBlock } from '@omne-harness/content-block'
import { createModelSendBoundary, type SendStart } from '@omne-harness/model'
import {
  type CredentialResolution,
  type ModelCommands,
  type TransportFact,
} from '@omne-harness/model-contract'
import {
  credentialPort,
  sendFixture,
  signal,
  synthetic,
  tenantId,
  factoryId,
  collect,
  faultCommands,
} from './send-fixture.ts'
import { instance, op, proof, unbox } from './memory-fixture.ts'

it('preserves two original receive windows using only public send results and rejects crossed bindings', async () => {
  const judged = judgeContentBlock({
    kind: 'text',
    id: 'send-text',
    visibility: { toHuman: true, toModel: true },
    text: 'received from the original stream',
  })
  if ('rejected' in judged) throw new Error('text fixture')
  const f = await sendFixture({
    facts: [
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta: 'received from the original stream' },
      { kind: 'block-seal', index: '0', block: judged.ok },
    ],
  })
  const other = await f.additionalDemand()
  const sender = f.makeSender()
  const first = await sender.send(f.demand, signal())
  const second = await sender.send(other, signal())
  if (first.kind !== 'started' || second.kind !== 'started') throw new Error('send fixture')
  expect(first.window).not.toBe(second.window)
  const firstFacts = await collect(first.facts)
  const secondFacts = await collect(second.facts)
  const commands = f.dependencies.commands
  const firstInput = {
    ...f.demand.execution,
    operation: op('preserve-first'),
    expected: unbox(await commands.loadRecovery(f.demand)).state.revision,
    dispatch: f.demand.dispatch,
    window: first.window,
    facts: firstFacts,
  }
  const secondInput = {
    ...other.execution,
    operation: op('preserve-second'),
    expected: unbox(await commands.loadRecovery(other)).state.revision,
    dispatch: other.dispatch,
    window: second.window,
    facts: secondFacts,
  }
  expect(firstInput.instance).not.toBe(secondInput.instance)
  for (const [change, binding] of [
    ['tenant', { tenant: f.otherTenant }],
    ['call', { call: other.call }],
    ['execution', { generation: other.execution.generation, instance: other.execution.instance }],
    ['dispatch', { dispatch: other.dispatch }],
    ['window', { window: second.window }],
  ] as const) {
    expect(
      await commands.preserve({ ...firstInput, ...binding, operation: op(`wrong-${change}`) }),
    ).toHaveProperty('failure')
  }
  const savedFirst = unbox(await commands.preserve(firstInput))
  const savedSecond = unbox(await commands.preserve(secondInput))
  expect(savedFirst.call).toBe(f.demand.call)
  expect(savedSecond.call).toBe(other.call)
  for (const saved of [savedFirst, savedSecond]) {
    expect(saved.blocks).toEqual([{ kind: 'sealed', index: '0', block: judged.ok }])
  }
  expect(f.counts()).toMatchObject({ starts: 2, acquired: 2 })
  expect(f.events).toEqual([
    'materialized',
    'prepared',
    'resource',
    'materialized',
    'prepared',
    'resource',
  ])
})

for (const effect of ['applied', 'not-applied'] as const)
  it(`hands back the confirmed original window and untouched stream after recordSend ${effect}`, async () => {
    const f = await sendFixture()
    const fault = faultCommands(f, 'recordSend', effect)
    const open = fault.commands.openReceiveWindow
    const opened: string[] = []
    fault.commands.openReceiveWindow = input => {
      opened.push(input.window)
      return open(input)
    }
    const sender = f.makeSender({ commands: fault.commands })
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    expect(opened).toHaveLength(1)
    expect(f.counts()).toMatchObject({ starts: 1, acquired: 1, pulls: 0, returns: 0 })
    expect(f.events).toEqual([])
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    fault.reveal()
    const recovered = await sender.send(f.demand, signal())
    if (recovered.kind !== 'started') throw new Error('send fixture')
    expect(recovered.window).toBe(opened[0])
    expect(f.counts().pulls).toBe(0)
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    const facts = await collect(recovered.facts)
    expect(facts).toEqual([
      { kind: 'block-open', index: 'one', mode: 'append', content: 'text' },
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ])
    expect(facts).toHaveLength(f.delivered.length)
    facts.forEach((fact, index) => expect(fact).toBe(f.delivered[index]))
    expect(() => recovered.facts[Symbol.asyncIterator]()).toThrow('facts-already-consumed')
    expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    expect(f.counts()).toMatchObject({ starts: 1, acquired: 1 })
    expect(fault.inputs).toHaveLength(2)
    expect(fault.inputs[1]).toEqual(fault.inputs[0])
  })

for (const method of ['recordMaterialization', 'openReceiveWindow', 'recordSend'] as const)
  for (const effect of ['applied', 'not-applied'] as const)
    for (const queryFailure of ['denied', 'throw', 'unknown'] as const)
      it(`retains ${method} ${effect} through query ${queryFailure} and resumes the original write`, async () => {
        const f = await sendFixture({ max: 1 })
        const other = await f.additionalDemand()
        const fault = faultCommands(f, method, effect)
        let querying = false
        const sender = f.makeSender({
          commands: {
            ...fault.commands,
            query(input) {
              if (querying && queryFailure === 'throw') throw new Error(synthetic)
              if (querying && queryFailure === 'unknown')
                return Promise.resolve({ ok: { kind: 'unknown' } })
              return fault.commands.query(input)
            },
          },
        })
        expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
        querying = true
        if (queryFailure === 'denied') f.denied.add('facts')
        expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
        expect(fault.inputs).toHaveLength(1)
        expect(f.counts()).toMatchObject({
          acquired: 1,
          starts: method === 'recordSend' ? 1 : 0,
          pulls: 0,
          returns: 0,
        })
        expect(f.events).toEqual([])
        expect(await sender.send(other, signal())).toMatchObject({
          kind: 'not-started',
          failure: { diagnostic: 'retained-attempt-capacity' },
        })
        querying = false
        f.denied.delete('facts')
        fault.reveal()
        const recovered = await sender.send(f.demand, signal())
        expect(recovered.kind).toBe('started')
        expect(fault.inputs).toHaveLength(2)
        expect(fault.inputs[1]).toEqual(fault.inputs[0])
        expect(f.counts()).toMatchObject({ acquired: 1, starts: 1, pulls: 0, returns: 0 })
        if (recovered.kind !== 'started') throw new Error('send fixture')
        await collect(recovered.facts)
        expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
        const next = await sender.send(other, signal())
        expect(next.kind).toBe('started')
        if (next.kind === 'started') await collect(next.facts)
      })

for (const method of ['recordMaterialization', 'openReceiveWindow', 'recordSend'] as const)
  it(`retains committed ${method} when replay cannot yet return its original receipt`, async () => {
    const f = await sendFixture({ max: 1 })
    const fault = faultCommands(f, method, 'applied')
    let denyReplay = false
    if (method === 'recordMaterialization') {
      const run = fault.commands.recordMaterialization
      fault.commands.recordMaterialization = input =>
        denyReplay
          ? Promise.resolve({ failure: { kind: 'denied', action: 'receipt' } })
          : run(input)
    } else if (method === 'openReceiveWindow') {
      const run = fault.commands.openReceiveWindow
      fault.commands.openReceiveWindow = input =>
        denyReplay
          ? Promise.resolve({ failure: { kind: 'denied', action: 'receipt' } })
          : run(input)
    } else {
      const run = fault.commands.recordSend
      fault.commands.recordSend = input =>
        denyReplay
          ? Promise.resolve({ failure: { kind: 'denied', action: 'receipt' } })
          : run(input)
    }
    const sender = f.makeSender({ commands: fault.commands })
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    fault.reveal()
    denyReplay = true
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    expect(f.counts()).toMatchObject({
      acquired: 1,
      starts: method === 'recordSend' ? 1 : 0,
      pulls: 0,
      returns: 0,
    })
    expect(f.events).toEqual([])
    denyReplay = false
    const recovered = await sender.send(f.demand, signal())
    expect(recovered.kind).toBe('started')
    expect(fault.inputs).toHaveLength(2)
    expect(fault.inputs[1]).toEqual(fault.inputs[0])
    if (recovered.kind !== 'started') throw new Error('send fixture')
    await collect(recovered.facts)
    expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
  })

for (const boundary of ['resolve', 'start'] as const)
  it(`a synchronously reentered product closure at ${boundary} resolves and starts once and preserves its original stream`, async () => {
    const f = await sendFixture()
    const coordinator = f.controls.send.coordinator
    let reenter: (() => SendStart) | undefined
    let nested: SendStart | undefined
    let resolutions = 0
    const sender = f.makeSender({
      coordinator: {
        ...coordinator,
        withinCurrent(input, receipt, window, start) {
          return coordinator.withinCurrent(input, receipt, window, selection => {
            reenter = () => start(selection)
            return start(selection)
          })
        },
      },
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve() {
          resolutions += 1
          if (boundary === 'resolve' && resolutions === 1) nested = reenter?.()
          return { kind: 'value', scope: 'factory', value: synthetic }
        },
      },
      resources: {
        async acquire(input) {
          const resource = unbox(await f.resources.acquire(input))
          return {
            ok: {
              ...resource,
              startWithCredential(...args) {
                if (boundary === 'start') nested = reenter?.()
                return resource.startWithCredential(...args)
              },
            },
          }
        },
      },
    })
    const result = await sender.send(f.demand, signal())
    expect(resolutions).toBe(1)
    expect(nested?.kind).toBe('unknown')
    expect(result.kind).toBe('started')
    expect(f.counts()).toMatchObject({ starts: 1, pulls: 0, returns: 0 })
    expect(f.events).toEqual([])
    if (result.kind !== 'started') throw new Error('send fixture')
    expect(await collect(result.facts)).toHaveLength(2)
    expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    expect(f.counts().starts).toBe(1)
  })

for (const method of ['recordMaterialization', 'openReceiveWindow'] as const)
  it(`releases ${method} after authoritative not-committed and a definite write rejection`, async () => {
    const f = await sendFixture({ max: 1 })
    const other = await f.additionalDemand()
    const fault = faultCommands(f, method, 'not-applied')
    const sender = f.makeSender({ commands: fault.commands })
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    fault.reveal()
    unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-unwritten') }))
    expect((await sender.send(f.demand, signal())).kind).toBe('not-started')
    expect(fault.inputs).toHaveLength(2)
    expect(fault.inputs[1]).toEqual(fault.inputs[0])
    expect(f.counts().starts).toBe(0)
    expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
    const next = await sender.send(other, signal())
    expect(next.kind).toBe('started')
    if (next.kind === 'started') await collect(next.facts)
  })

for (const kind of ['value', 'absent', 'unreadable', 'denied', 'unavailable'] as const) {
  it(`resolves tenant ${kind} only at the actual send boundary`, async () => {
    const resolution: CredentialResolution =
      kind === 'value' ? { kind, scope: 'tenant', value: synthetic } : { kind }
    const observed: unknown[] = []
    const credentials = credentialPort(resolution)
    const resolve = credentials.resolve
    credentials.resolve = (reference, face) => {
      observed.push({ reference, face })
      return resolve(reference, face)
    }
    const f = await sendFixture({ tenant: true, credentials })
    const result = await f.makeSender().send(f.demand, signal())
    expect(observed).toEqual([
      {
        reference: { id: tenantId, tenant: f.tenant, purpose: 'model-send' },
        face: { authorized: true, official: false },
      },
    ])
    expect(f.counts().starts).toBe(kind === 'value' ? 1 : 0)
    expect(unbox(await f.dependencies.commands.dispatches(f.admit))[0]?.send).toBe(
      kind === 'value' ? 'started' : 'not-sent',
    )
    if (result.kind === 'started') {
      expect(f.counts().valueMatches).toBe(true)
      await collect(result.facts)
    } else {
      expect(result).toMatchObject(
        kind === 'denied'
          ? { kind: 'not-started', failure: { kind: 'denied' } }
          : {
              kind: 'not-started',
              failure: {
                kind: 'unavailable',
                dependency: 'model-credential',
                diagnostic: `credential-${kind}`,
              },
            },
      )
      expect(JSON.stringify(result)).not.toContain(synthetic)
    }
  })
}
for (const tenant of [false, true])
  it(`rejects a credential scope mismatch for ${tenant ? 'tenant' : 'factory'} without fallback`, async () => {
    let resolves = 0
    const f = await sendFixture({
      tenant,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => {
          resolves += 1
          return { kind: 'value', scope: tenant ? 'factory' : 'tenant', value: synthetic }
        },
      },
    })
    const result = await f.makeSender().send(f.demand, signal())
    expect(result).toMatchObject({
      kind: 'not-started',
      failure: { kind: 'denied', action: 'credential-scope' },
    })
    expect(resolves).toBe(1)
    expect(f.counts().starts).toBe(0)
  })
it('requires explicit factory source, current no-binding evidence and a human-named query', async () => {
  const references: unknown[] = []
  const f = await sendFixture({
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: (ref, face) => {
        references.push({ ref, face })
        return { kind: 'value', scope: 'factory', value: synthetic }
      },
    },
  })
  const result = await f.makeSender().send(f.demand, signal())
  expect(references).toEqual([
    {
      ref: { id: factoryId, tenant: f.tenant, purpose: 'model-send' },
      face: { authorized: true, official: true },
    },
  ])
  if (result.kind !== 'started') throw new Error('send fixture')
  await collect(result.facts)
  const missing = await sendFixture({ registered: false })
  expect(await missing.makeSender().send(missing.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { dependency: 'model-send-source' },
  })
  expect(missing.counts().starts).toBe(0)
})
it('normalizes credential exceptions without storing their secret text', async () => {
  const f = await sendFixture({
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: () => {
        throw new Error(synthetic)
      },
    },
  })
  expect(await f.makeSender().send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { diagnostic: 'credential-unavailable' },
  })
  expect(JSON.stringify(await f.dependencies.commands.loadRecovery(f.admit))).not.toContain(
    synthetic,
  )
  expect(f.counts().starts).toBe(0)
})
for (const method of ['recordMaterialization', 'openReceiveWindow', 'recordSend'] as const)
  for (const effect of ['applied', 'not-applied'] as const) {
    it(`recovers ${method} ${effect} with exactly the original write and original facts`, async () => {
      const f = await sendFixture()
      const fault = faultCommands(f, method, effect)
      const sender = f.makeSender({ commands: fault.commands })
      expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
      expect(f.counts()).toMatchObject({
        starts: method === 'recordSend' ? 1 : 0,
        pulls: 0,
        returns: 0,
      })
      expect(f.events).toEqual([])
      expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
      expect(fault.inputs).toHaveLength(1)
      fault.reveal()
      const sent = await sender.send(f.demand, signal())
      expect(sent.kind).toBe('started')
      expect(fault.inputs).toHaveLength(2)
      expect(fault.inputs[1]).toEqual(fault.inputs[0])
      expect(f.counts()).toMatchObject({ starts: 1, acquired: 1, pulls: 0, returns: 0 })
      if (sent.kind !== 'started') throw new Error('send fixture')
      const iterator = sent.facts[Symbol.asyncIterator]()
      expect(() => sent.facts[Symbol.asyncIterator]()).toThrow('facts-already-consumed')
      expect((await iterator.next()).done).toBe(false)
      await iterator.return?.()
      await iterator.return?.()
      expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
      expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
      expect(f.counts().starts).toBe(1)
    })
  }
it('keeps original expected on a conflicting unresolved write rather than rebasing it', async () => {
  const f = await sendFixture()
  const fault = faultCommands(f, 'recordMaterialization', 'not-applied')
  const sender = f.makeSender({ commands: fault.commands })
  await sender.send(f.demand, signal())
  fault.reveal()
  await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel') })
  const denied = await sender.send(f.demand, signal())
  expect(denied.kind).toBe('not-started')
  expect(fault.inputs).toHaveLength(2)
  expect(fault.inputs[1]).toEqual(fault.inputs[0])
  expect(f.counts().starts).toBe(0)
})
it('two independent senders sharing a backend cannot start a dispatch twice while recordSend is unknown', async () => {
  const f = await sendFixture()
  const fault = faultCommands(f, 'recordSend', 'applied')
  const first = f.makeSender({ commands: fault.commands })
  const second = f.makeSender()
  const [a, b] = await Promise.all([
    first.send(f.demand, signal()),
    second.send(f.demand, signal()),
  ])
  expect([a.kind, b.kind]).not.toContain('started')
  expect(f.counts().starts).toBe(1)
  expect(f.events.filter(e => e === 'resource')).toHaveLength(1)
  fault.reveal()
  const original = await first.send(f.demand, signal())
  expect(original.kind).toBe('started')
  if (original.kind !== 'started') throw new Error('send fixture')
  await collect(original.facts)
  expect(f.counts().starts).toBe(1)
})
it('a backend dispatch claim survives a thrown start and blocks another coordinator', async () => {
  const f = await sendFixture()
  f.throwStart()
  const fault = faultCommands(f, 'recordSend', 'not-applied')
  const sender = f.makeSender({ commands: fault.commands })
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'unknown',
    diagnostic: 'send-record-unconfirmed',
  })
  const receipt = unbox(await f.dependencies.commands.dispatches(f.admit))[0]?.materialization
    ?.receipt
  const record = unbox(await f.dependencies.commands.loadRecovery(f.admit))
  expect(receipt).toBeDefined()
  // Observe the real open-window command, without pretending it is a public driver handoff.
  const write = fault.inputs[0]
  expect(write).toBeDefined()
  expect(record.unresolved).toHaveLength(1)
  expect((await f.makeSender().send(f.demand, signal())).kind).toBe('unknown')
  expect(f.counts().starts).toBe(1)
  fault.reveal()
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'unknown',
    diagnostic: 'transport-start-unknown',
  })
  expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
})
it('final revocation, control, stale generation and source denial each prevent start', async () => {
  for (const action of ['revoke', 'cancel', 'generation', 'source'] as const) {
    const f = await sendFixture()
    const open = f.dependencies.commands.openReceiveWindow
    const commands: ModelCommands<typeof f.principal> = {
      ...f.dependencies.commands,
      async openReceiveWindow(input) {
        const result = await open(input)
        if (action === 'revoke') f.denied.add('send')
        if (action === 'source') f.setSourceAuthorized(false)
        if (action === 'cancel')
          unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel') }))
        if (action === 'generation')
          unbox(
            await f.dependencies.commands.claim({
              ...f.admit,
              operation: op('successor'),
              instance: instance('successor'),
              continuity: proof(f.admit.call),
            }),
          )
        return result
      },
    }
    expect((await f.makeSender({ commands }).send(f.demand, signal())).kind).toBe('not-started')
    expect(f.counts().starts).toBe(0)
  }
})
for (const mismatch of ['receipt', 'window', 'supplier', 'model'] as const)
  it(`the final send fence rejects a mismatched ${mismatch} and preserves committed bindings`, async () => {
    const f = await sendFixture({
      configureSource(source) {
        if (mismatch === 'supplier')
          Reflect.set(source, 'supplier', { ...source.supplier, revision: 'other' })
        if (mismatch === 'model') Reflect.set(source, 'model', 'other-model')
      },
    })
    const commands = f.dependencies.commands
    const coordinator = f.controls.send.coordinator
    let committed:
      | {
          input: Parameters<typeof commands.openReceiveWindow>[0]
          revision: Parameters<typeof commands.openReceiveWindow>[0]['expected']
          dispatches: Awaited<ReturnType<typeof commands.dispatches>>
        }
      | undefined
    let fences = 0
    let resolutions = 0
    const sender = f.makeSender({
      commands: {
        ...commands,
        async openReceiveWindow(input) {
          const result = await commands.openReceiveWindow(input)
          committed = {
            input,
            revision: unbox(result),
            dispatches: await commands.dispatches(f.admit),
          }
          return result
        },
      },
      coordinator: {
        ...coordinator,
        withinCurrent(input, receipt, window, start) {
          fences += 1
          return coordinator.withinCurrent(
            input,
            mismatch === 'receipt' ? { ...receipt, payloadDigest: 'b'.repeat(64) } : receipt,
            mismatch === 'window' ? `${window}-other` : window,
            start,
          )
        },
      },
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve() {
          resolutions += 1
          return { kind: 'value', scope: 'factory', value: synthetic }
        },
      },
    })
    expect(await sender.send(f.demand, signal())).toMatchObject({
      kind: 'not-started',
      failure:
        mismatch === 'receipt' || mismatch === 'window'
          ? { kind: 'invalid', field: 'dispatch', reason: 'send-not-prepared' }
          : {
              kind: 'unavailable',
              dependency: 'model-send-source',
              diagnostic: 'source-not-registered',
            },
    })
    expect(fences).toBe(1)
    expect(resolutions).toBe(0)
    expect(f.counts()).toMatchObject({ starts: 0, acquired: 1, pulls: 0, returns: 0 })
    if (!committed) throw new Error('committed window fixture')
    const before = unbox(committed.dispatches)
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ dispatch: f.demand.dispatch, send: 'prepared' })
    expect(before[0]?.materialization).not.toBeNull()
    expect(unbox(await commands.dispatches(f.admit))).toEqual(
      before.map(dispatch => ({ ...dispatch, send: 'not-sent' })),
    )
    expect(await commands.openReceiveWindow(committed.input)).toEqual({ ok: committed.revision })
    expect(
      await commands.query({ ...f.admit, operation: committed.input.operation }),
    ).toMatchObject({
      ok: { kind: 'committed' },
    })
    expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
  })

it('start wins before a later control and preserves its interruption for the sole consumer', async () => {
  const f = await sendFixture()
  const abort = new AbortController()
  const record = f.dependencies.commands.recordSend
  const sender = f.makeSender({
    commands: {
      ...f.dependencies.commands,
      async recordSend(input) {
        const result = await record(input)
        unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel') }))
        abort.abort()
        return result
      },
    },
  })
  const result = await sender.send(f.demand, abort.signal)
  if (result.kind !== 'started') throw new Error('send fixture')
  expect(f.counts()).toMatchObject({
    starts: 1,
    pulls: 0,
    returns: 0,
    receivedSignal: abort.signal,
  })
  expect(f.events).toEqual([])
  expect(await collect(result.facts)).toEqual([
    { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
  ])
  expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
})
for (const action of ['done', 'return', 'throw', 'error'] as const)
  it(`releases resources once in reverse order after ${action}`, async () => {
    const f = await sendFixture()
    if (action === 'error') f.throwStream()
    const sent = await f.makeSender().send(f.demand, signal())
    if (sent.kind !== 'started') throw new Error('send fixture')
    const iterator = sent.facts[Symbol.asyncIterator]()
    if (action === 'done') {
      while (!(await iterator.next()).done) {
        /* consume */
      }
    }
    if (action === 'return') await iterator.return?.()
    if (action === 'throw')
      await expect(iterator.throw?.(new Error(synthetic))).rejects.toThrow('consumer-closed')
    if (action === 'error') await expect(iterator.next()).rejects.toThrow('fact-stream-failed')
    await iterator.return?.()
    expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
  })
for (const action of ['done', 'return', 'throw'] as const)
  for (const optional of ['no-return', 'no-throw', 'neither'] as const)
    it(`closes a legal iterator with ${optional} after ${action} without reading again`, async () => {
      const f = await sendFixture()
      const sender = f.makeSender({
        resources: {
          async acquire(input) {
            const resource = unbox(await f.resources.acquire(input))
            return {
              ok: {
                ...resource,
                startWithCredential(...args) {
                  const facts = resource.startWithCredential(...args)
                  return {
                    [Symbol.asyncIterator](): AsyncIterator<TransportFact> {
                      const source = facts[Symbol.asyncIterator]()
                      return {
                        next: () => source.next(),
                        ...(optional === 'no-throw'
                          ? {
                              return: () =>
                                source.return
                                  ? source.return()
                                  : Promise.resolve({ done: true as const, value: undefined }),
                            }
                          : {}),
                        ...(optional === 'no-return'
                          ? { throw: (error: unknown) => Promise.reject(error) }
                          : {}),
                      }
                    },
                  }
                },
              },
            }
          },
        },
      })
      const sent = await sender.send(f.demand, signal())
      if (sent.kind !== 'started') throw new Error('send fixture')
      const iterator = sent.facts[Symbol.asyncIterator]()
      expect(() => sent.facts[Symbol.asyncIterator]()).toThrow('facts-already-consumed')
      expect((await iterator.next()).done).toBe(false)
      if (action === 'done')
        while (!(await iterator.next()).done) {
          /* consume */
        }
      if (action === 'return') await iterator.return?.()
      if (action === 'throw')
        await expect(iterator.throw?.(new Error(synthetic))).rejects.toThrow('consumer-closed')
      const pulls = f.counts().pulls
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
      await iterator.return?.()
      expect(f.counts()).toMatchObject({
        starts: 1,
        acquired: 1,
        pulls,
        returns: optional === 'no-throw' && action !== 'done' ? 1 : 0,
      })
      expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
    })

it('keeps release failure observable and attempts later releases despite earlier failure', async () => {
  const f = await sendFixture()
  f.releaseFailures.add('materialized')
  f.releaseFailures.add('resource')
  const sent = await f.makeSender().send(f.demand, signal())
  if (sent.kind !== 'started') throw new Error('send fixture')
  const iterator = sent.facts[Symbol.asyncIterator]()
  await expect(iterator.return?.()).rejects.toThrow('resource-release-failed')
  await expect(iterator.return?.()).rejects.toThrow('resource-release-failed')
  expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
  expect(f.counts().starts).toBe(1)
})
it('a repeated coordinator closure still starts only once and hands out the first stream', async () => {
  const f = await sendFixture()
  const original = f.controls.send.coordinator
  const sender = f.makeSender({
    coordinator: {
      ...original,
      withinCurrent(input, receipt, window, start) {
        return original.withinCurrent(input, receipt, window, selection => {
          start(selection)
          return start(selection)
        })
      },
    },
  })
  const sent = await sender.send(f.demand, signal())
  expect(f.counts().starts).toBe(1)
  if (sent.kind !== 'started') throw new Error('send fixture')
  await collect(sent.facts)
})
it('returns the original started stream when the coordinator throws after successful start', async () => {
  const f = await sendFixture()
  const coordinator = f.controls.send.coordinator
  let fences = 0
  let started: SendStart | undefined
  const sender = f.makeSender({
    coordinator: {
      ...coordinator,
      withinCurrent(input, receipt, window, start) {
        fences += 1
        coordinator.withinCurrent(input, receipt, window, selection => {
          started = start(selection)
          return started
        })
        if (started?.kind !== 'started') throw new Error('successful start fixture')
        throw new Error(synthetic)
      },
    },
  })
  const sent = await sender.send(f.demand, signal())
  expect(sent.kind).toBe('started')
  expect(started?.kind).toBe('started')
  expect(unbox(await f.dependencies.commands.dispatches(f.admit))[0]?.send).toBe('started')
  expect(f.counts()).toMatchObject({ starts: 1, acquired: 1, pulls: 0, returns: 0 })
  expect(f.events).toEqual([])
  if (sent.kind !== 'started') throw new Error('send fixture')
  const facts = await collect(sent.facts)
  expect(facts).toEqual([
    { kind: 'block-open', index: 'one', mode: 'append', content: 'text' },
    { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
  ])
  expect(facts).toHaveLength(f.delivered.length)
  facts.forEach((fact, index) => expect(fact).toBe(f.delivered[index]))
  expect(() => sent.facts[Symbol.asyncIterator]()).toThrow('facts-already-consumed')
  expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
  expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
  expect(fences).toBe(1)
  expect(f.counts()).toMatchObject({ starts: 1, acquired: 1 })
})

it('rejects invalid retention bounds before acquiring anything', async () => {
  const f = await sendFixture()
  for (const maxRetainedAttempts of [0, -1, 1.5, Infinity])
    expect(() =>
      createModelSendBoundary({
        commands: f.dependencies.commands,
        coordinator: f.controls.send.coordinator,
        resources: f.resources,
        credentials: f.credentials,
        maxRetainedAttempts,
      }),
    ).toThrow(RangeError)
  expect(f.counts().acquired).toBe(0)
})

for (const defect of ['query', 'official', 'adoption', 'recipient', 'binding'] as const)
  it(`factory ${defect} cannot be guessed from a request tag`, async () => {
    let resolves = 0
    const f = await sendFixture({
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => {
          resolves += 1
          return { kind: 'value', scope: 'factory', value: synthetic }
        },
      },
      configureSource(source) {
        if (defect === 'query') Reflect.deleteProperty(source.credential, 'queryId')
        if (defect === 'official') Reflect.set(source.credential, 'official', false)
        if (defect === 'adoption') Reflect.set(source.profile, 'revision', 'other')
        if (defect === 'recipient') Reflect.set(source, 'recipient', 'other.invalid')
      },
    })
    if (defect === 'binding') f.setNoTenantBinding(false)
    expect((await f.makeSender().send(f.demand, signal())).kind).toBe('not-started')
    expect(resolves).toBe(0)
    expect(f.counts().starts).toBe(0)
  })
it('the backend claim itself prevents a second start while no send record has committed', async () => {
  const f = await sendFixture()
  let window = ''
  const fault = faultCommands(f, 'recordSend', 'not-applied')
  const original = fault.commands.openReceiveWindow
  fault.commands.openReceiveWindow = input => {
    window = input.window
    return original(input)
  }
  const sender = f.makeSender({ commands: fault.commands })
  await sender.send(f.demand, signal())
  const dispatch = unbox(await f.dependencies.commands.dispatches(f.admit))[0]
  expect(dispatch?.send).toBe('prepared')
  const receipt = dispatch?.materialization?.receipt
  if (!receipt) throw new Error('receipt fixture')
  let duplicate = 0
  const denied = f.controls.send.coordinator.withinCurrent(f.demand, receipt, window, () => {
    duplicate += 1
    return { kind: 'unknown', diagnostic: 'would-have-sent' }
  })
  expect(denied).toEqual({ kind: 'unknown', diagnostic: 'dispatch-already-claimed' })
  expect(duplicate).toBe(0)
  expect(f.counts().starts).toBe(1)
  fault.reveal()
  const sent = await sender.send(f.demand, signal())
  if (sent.kind !== 'started') throw new Error('send fixture')
  await collect(sent.facts)
})
it('the synchronous fence rejects reentry without allowing a credential or start bypass', async () => {
  const f = await sendFixture()
  let rejected = false
  const sender = f.makeSender({
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: () => {
        try {
          f.controls.commands.replaceOwners([])
        } catch {
          rejected = true
        }
        return { kind: 'value', scope: 'factory', value: synthetic }
      },
    },
  })
  const sent = await sender.send(f.demand, signal())
  expect(rejected).toBe(true)
  expect(f.counts().starts).toBe(1)
  if (sent.kind !== 'started') throw new Error('send fixture')
  await collect(sent.facts)
})
it('an unresolved send retains its capacity slot and blocks new acquisition', async () => {
  const f = await sendFixture({ max: 1 })
  const other = await f.additionalDemand()
  const fault = faultCommands(f, 'recordSend', 'applied')
  const sender = f.makeSender({ commands: fault.commands })
  await sender.send(f.demand, signal())
  expect(await sender.send(other, signal())).toMatchObject({
    kind: 'not-started',
    failure: { diagnostic: 'retained-attempt-capacity' },
  })
  expect(f.counts().acquired).toBe(1)
  fault.reveal()
  const sent = await sender.send(f.demand, signal())
  if (sent.kind !== 'started') throw new Error('send fixture')
  await collect(sent.facts)
  const next = await sender.send(other, signal())
  expect(next.kind).toBe('started')
  if (next.kind === 'started') await collect(next.facts)
  expect(f.counts().starts).toBe(2)
})
it('a live stream or failed release also retains capacity until an observable release succeeds', async () => {
  const f = await sendFixture({ max: 1 })
  const other = await f.additionalDemand()
  const sender = f.makeSender()
  const first = await sender.send(f.demand, signal())
  if (first.kind !== 'started') throw new Error('send fixture')
  expect((await sender.send(other, signal())).kind).toBe('not-started')
  f.releaseFailures.add('resource')
  await expect(first.facts[Symbol.asyncIterator]().return?.()).rejects.toThrow(
    'resource-release-failed',
  )
  expect(await sender.send(other, signal())).toMatchObject({
    kind: 'not-started',
    failure: { diagnostic: 'retained-attempt-capacity' },
  })
  expect(f.counts().acquired).toBe(1)
})
it('a send-record conflict after actual start retains the untouched stream and remains unknown', async () => {
  const f = await sendFixture()
  const recordSend = f.dependencies.commands.recordSend
  const sender = f.makeSender({
    commands: {
      ...f.dependencies.commands,
      async recordSend(input) {
        await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-after-start') })
        return recordSend(input)
      },
    },
  })
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'unknown',
    diagnostic: 'send-record-unconfirmed',
  })
  expect(f.counts()).toMatchObject({ starts: 1, pulls: 0, returns: 0 })
  expect(f.events).toEqual([])
})
it('a mismatched materialization never reaches a commit or start', async () => {
  const f = await sendFixture()
  const original = f.resources.acquire
  const sender = f.makeSender({
    resources: {
      async acquire(input) {
        const resource = unbox(await original(input))
        const prepare = resource.transport.prepare
        return {
          ok: {
            ...resource,
            transport: {
              async prepare(request, supplier) {
                const prepared = unbox(await prepare(request, supplier))
                return {
                  ok: {
                    ...prepared,
                    async materialize(signal) {
                      const materialized = unbox(await prepared.materialize(signal))
                      return {
                        ok: {
                          ...materialized,
                          receipt: {
                            ...materialized.receipt,
                            supplier: { ...materialized.receipt.supplier, revision: 'other' },
                          },
                        },
                      }
                    },
                  },
                }
              },
            },
          },
        }
      },
    },
  })
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { kind: 'invalid', field: 'receipt' },
  })
  expect(unbox(await f.dependencies.commands.dispatches(f.admit))[0]?.materialization).toBe(null)
  expect(f.counts().starts).toBe(0)
  expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
})

it('concurrent repeats of one sender remain busy after current access is checked', async () => {
  const f = await sendFixture()
  const sender = f.makeSender()
  const first = sender.send(f.demand, signal())
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'unknown',
    diagnostic: 'original-send-busy',
  })
  f.denied.add('send')
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { kind: 'denied' },
  })
  f.denied.delete('send')
  const sent = await first
  if (sent.kind !== 'started') throw new Error('send fixture')
  await collect(sent.facts)
  expect(f.counts()).toMatchObject({ acquired: 1, starts: 1 })
})
it('recognizes an unknown not-sent record without resolving credentials a second time', async () => {
  const f = await sendFixture()
  let resolutions = 0
  const fault = faultCommands(f, 'recordSend', 'not-applied')
  const sender = f.makeSender({
    commands: fault.commands,
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: () => {
        resolutions += 1
        return resolutions === 1
          ? { kind: 'absent' }
          : { kind: 'value', scope: 'factory', value: synthetic }
      },
    },
  })
  expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
  fault.reveal()
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { dependency: 'model-credential', diagnostic: 'credential-absent' },
  })
  expect(resolutions).toBe(1)
  expect(f.counts().starts).toBe(0)
  expect(unbox(await f.dependencies.commands.dispatches(f.admit))[0]?.send).toBe('not-sent')
  expect(f.events).toEqual(['materialized', 'prepared', 'resource'])
})

for (const change of ['cancel', 'generation'] as const)
  it(`preserves an unresolved started send after ${change} instead of reporting not-started`, async () => {
    const f = await sendFixture()
    const fault = faultCommands(f, 'recordSend', 'applied')
    const sender = f.makeSender({ commands: fault.commands })
    expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
    if (change === 'cancel')
      unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-pending') }))
    else
      unbox(
        await f.dependencies.commands.claim({
          ...f.admit,
          operation: op('successor-pending'),
          instance: instance('successor'),
          continuity: proof(f.admit.call),
        }),
      )
    expect(await sender.send(f.demand, signal())).toMatchObject({
      kind: 'unknown',
      diagnostic: 'send-record-unconfirmed',
    })
    expect(f.counts()).toMatchObject({ starts: 1, pulls: 0, returns: 0, acquired: 1 })
    expect(f.events).toEqual([])
    expect(fault.inputs).toHaveLength(1)
  })
it('authoritative started records remain unknown on a repeated send after cancellation and local release', async () => {
  const f = await sendFixture()
  const sender = f.makeSender()
  const sent = await sender.send(f.demand, signal())
  if (sent.kind !== 'started') throw new Error('send fixture')
  await collect(sent.facts)
  unbox(
    await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-after-release') }),
  )
  expect((await sender.send(f.demand, signal())).kind).toBe('unknown')
  expect(f.counts()).toMatchObject({ starts: 1, acquired: 1 })
})
it('access denial cannot disclose an unresolved local send, while a first stale send never acquires resources', async () => {
  const f = await sendFixture()
  const fault = faultCommands(f, 'recordSend', 'applied')
  const sender = f.makeSender({ commands: fault.commands })
  await sender.send(f.demand, signal())
  f.denied.add('send')
  expect(await sender.send(f.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { kind: 'denied' },
  })
  expect(f.counts()).toMatchObject({ starts: 1, acquired: 1 })
  const stale = await sendFixture()
  unbox(
    await stale.dependencies.commands.claim({
      ...stale.admit,
      operation: op('stale-successor'),
      instance: instance('successor'),
      continuity: proof(stale.admit.call),
    }),
  )
  expect(await stale.makeSender().send(stale.demand, signal())).toMatchObject({
    kind: 'not-started',
    failure: { kind: 'stale-instance' },
  })
  expect(stale.counts()).toMatchObject({ starts: 0, acquired: 0 })
})
