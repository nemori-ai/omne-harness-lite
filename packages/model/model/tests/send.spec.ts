import { expect, it } from 'vitest'
import { createModelSendBoundary } from '@omne-harness/model'
import { type CredentialResolution, type ModelCommands } from '@omne-harness/model-contract'
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
  expect(fault.inputs).toHaveLength(1)
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
