import { expect, it } from 'vitest'
import { createModelRuntime, type ModelConfiguration } from '@omne-harness/model'
import { createTestModelDependencies, type TestModelSendPlan } from '@omne-harness/model/testing'
import {
  decodeDispatchId,
  decodeReadId,
  decodeResultVersion,
  type ModelHandle,
} from '@omne-harness/model-contract'
import { fixture, instance, op, proof, unbox, identity, callId } from './memory-fixture.ts'

const configuration: ModelConfiguration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  resultPageTargetBytes: 128,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
function assembled(
  ending?: TestModelSendPlan['script']['ending'],
  planAdmission?: TestModelSendPlan['admission'],
) {
  const f = fixture()
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  const execution = { tenant: f.tenant, call: f.admit.call, instance: instance(), generation: '1' }
  const plan: TestModelSendPlan = {
    execution,
    dispatch,
    admission: planAdmission ?? f.admit.operation,
    materializationOperation: op('materialization'),
    windowOperation: op('window'),
    sendOperation: op('send'),
    window: 'receive',
    script: {
      receipt: {
        supplier: f.admit.request.suppliers[0].adoption,
        representation: f.admit.request.representation,
        payloadDigest: 'a'.repeat(64),
      },
      facts: [],
      ending: ending ?? {
        kind: 'terminated',
        termination: {
          kind: 'failed',
          fault: { cause: 'upstream-unavailable', diagnostic: 'offline', upstreamStatus: '503' },
        },
      },
      rejection: null,
    },
  }
  const assembly = createTestModelDependencies({
    ...f.options,
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 2,
    maxQueued: 2,
    sends: [plan],
  })
  return { ...f, ...assembly, plan, dispatch, execution }
}
async function prepared(
  ending?: TestModelSendPlan['script']['ending'],
  planAdmission?: TestModelSendPlan['admission'],
) {
  const f = assembled(ending, planAdmission)
  const commands = f.dependencies.commands
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...f.admit,
      instance: instance(),
      operation: op('claim'),
      continuity: proof(f.admit.call),
    }),
  )
  const record = unbox(await commands.loadRecovery(f.admit))
  unbox(
    await commands.prepareDispatch({
      ...execution,
      operation: op('prepare'),
      expected: record.state.revision,
      dispatch: f.dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  return {
    ...f,
    demand: {
      ...f.admit,
      execution,
      dispatch: f.dispatch,
      supplier: f.admit.request.suppliers[0],
      initiator: record.initiator,
    },
  }
}
it('constructs the real factory without touching dependencies and exposes twelve explicit unavailable operations', async () => {
  const f = assembled()
  let invoked = 0
  function counted<T extends object>(port: T): T {
    return new Proxy(port, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver)
        return typeof value === 'function'
          ? (...args: unknown[]) => {
              invoked += 1
              return Reflect.apply(value, target, args)
            }
          : value
      },
    })
  }
  const dependencies = {
    commands: counted(f.dependencies.commands),
    send: counted(f.dependencies.send),
    retry: counted(f.dependencies.retry),
    clock: counted(f.dependencies.clock),
    instances: counted({
      ...f.dependencies.instances,
      directory: counted(f.dependencies.instances.directory),
    }),
  }
  const provider = createModelRuntime(dependencies, configuration)
  expect(invoked).toBe(0)
  expect('driver' in provider.runtime).toBe(false)
  const result = unbox(decodeResultVersion('mrver_test'))
  const read = unbox(decodeReadId('mread_test'))
  const answers = await Promise.all([
    provider.runtime.calls.admit(f.admit),
    provider.runtime.calls.inspect({ ...f.admit, admission: f.admit.operation }),
    provider.runtime.calls.dispatches(f.admit),
    provider.runtime.calls.cancel(f.admit),
    provider.runtime.consumption.beginRead({ ...f.admit, result }),
    provider.runtime.consumption.readNext({ ...f.admit, read, after: '1' }),
    provider.runtime.consumption.closeRead({ ...f.admit, read }),
    provider.runtime.consumption.acknowledge({
      ...f.admit,
      result,
      evidence: { kind: 'processed', completion: proof('test') },
    }),
    provider.runtime.instances.connect(f.admit),
    provider.recover(f.admit),
    provider.quiesce(),
    provider.driver.drive(
      { ...f.admit, instance: instance(), continuity: proof('test') },
      new AbortController().signal,
    ),
  ])
  expect(answers).toHaveLength(12)
  for (const answer of answers)
    expect(answer).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-runtime',
        diagnostic: 'managed-runtime-not-implemented',
      },
    })
  expect(invoked).toBe(0)
})
it('rejects dependency and numeric configuration defects at construction', () => {
  const f = assembled()
  for (const key of Object.keys(f.dependencies)) {
    const invalid = { ...f.dependencies, [key]: {} }
    expect(() => Reflect.apply(createModelRuntime, undefined, [invalid, configuration])).toThrow(
      TypeError,
    )
  }
  for (const field of Object.keys(configuration)) {
    const absent = Object.fromEntries(
      Object.entries(configuration).filter(([key]) => key !== field),
    )
    expect(() => Reflect.apply(createModelRuntime, undefined, [f.dependencies, absent])).toThrow(
      TypeError,
    )
    for (const bad of [NaN, Infinity, -1, 0.5])
      expect(() =>
        Reflect.apply(createModelRuntime, undefined, [
          f.dependencies,
          { ...configuration, [field]: bad },
        ]),
      ).toThrow(RangeError)
  }
  for (const field of [
    'outputBatchBytes',
    'observerBufferBytes',
    'resultPageTargetBytes',
    'readIdleMs',
  ])
    expect(() =>
      Reflect.apply(createModelRuntime, undefined, [
        f.dependencies,
        { ...configuration, [field]: 0 },
      ]),
    ).toThrow(RangeError)
  const { resultPageTargetBytes: _target, ...oldConfiguration } = configuration
  expect(() =>
    Reflect.apply(createModelRuntime, undefined, [
      f.dependencies,
      { ...oldConfiguration, resultPageBytes: 128 },
    ]),
  ).toThrow(TypeError)
  expect(() => createModelRuntime(f.dependencies, configuration)).not.toThrow()
})
it('starts before returning the stream, closes both resources on return and never starts the same dispatch twice', async () => {
  const f = await prepared()
  const signal = new AbortController()
  const result = await f.dependencies.send.send(f.demand, signal.signal)
  expect(result.kind).toBe('started')
  expect(f.controls.send.counts(f.demand).start).toBe(1)
  if (result.kind !== 'started') throw new Error('send fixture')
  await result.facts[Symbol.asyncIterator]().return?.()
  expect(f.controls.send.counts(f.demand)).toMatchObject({ closeMaterialized: 1, closePrepared: 1 })
  expect((await f.dependencies.send.send(f.demand, signal.signal)).kind).toBe('unknown')
  expect(f.controls.send.counts(f.demand).start).toBe(1)
})
it('does not start after unknown materialization, cancellation or the final current-qualification denial', async () => {
  const unknown = await prepared()
  unknown.controls.commands.injectUnknown({
    ...unknown.execution,
    operation: unknown.plan.materializationOperation,
    method: 'recordMaterialization',
    effect: 'applied',
  })
  expect(
    (await unknown.dependencies.send.send(unknown.demand, new AbortController().signal)).kind,
  ).toBe('unknown')
  expect(unknown.controls.send.counts(unknown.demand)).toMatchObject({
    start: 0,
    closePrepared: 1,
    closeMaterialized: 1,
  })
  const cancelled = await prepared()
  const abort = new AbortController()
  abort.abort()
  expect((await cancelled.dependencies.send.send(cancelled.demand, abort.signal)).kind).toBe(
    'not-started',
  )
  expect(cancelled.controls.send.counts(cancelled.demand).start).toBe(0)
  const denied = await prepared()
  const adapter = denied.options.evidence[0]
  if (!adapter) throw new Error('fixture adapter')
  const materialize = adapter.materialization.bind(adapter)
  Object.assign(adapter, {
    materialization(input: Parameters<typeof materialize>[0]) {
      denied.denied.add('send')
      return materialize(input)
    },
  })
  expect(
    (await denied.dependencies.send.send(denied.demand, new AbortController().signal)).kind,
  ).toBe('not-started')
  expect(denied.controls.send.counts(denied.demand)).toMatchObject({
    start: 0,
    closePrepared: 1,
    closeMaterialized: 1,
  })
})
for (const binding of ['same-tenant', 'same-call', 'different-tenant-and-call']) {
  it(`rejects a ${binding} execution mismatch before any send effect and preserves the valid plan`, async () => {
    const f = await prepared()
    const foreign = identity('6')
    const authorize = f.options.authority.authorize
    f.options.authority.authorize = input =>
      input.access.tenant === foreign
        ? { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
        : authorize(input)
    const other = {
      ...f.admit,
      tenant: binding === 'same-tenant' ? f.tenant : foreign,
      call: binding === 'same-call' ? f.admit.call : callId('other'),
      operation: op('other-admission'),
    }
    const commands = f.dependencies.commands
    unbox(await commands.admit(other))
    const execution = unbox(
      await commands.claim({
        ...other,
        operation: op('other-claim'),
        instance: instance(),
        continuity: proof(other.call),
      }),
    )
    unbox(
      await commands.prepareDispatch({
        ...execution,
        operation: op('other-prepare'),
        expected: unbox(await commands.loadRecovery(other)).state.revision,
        dispatch: f.dispatch,
        supplier: other.request.suppliers[0],
        policyDecision: null,
      }),
    )
    const before = await Promise.all([
      commands.loadRecovery(f.admit),
      commands.dispatches(f.admit),
      commands.loadRecovery(other),
      commands.dispatches(other),
    ])
    expect(
      await f.dependencies.send.send({ ...f.demand, execution }, new AbortController().signal),
    ).toMatchObject({ kind: 'not-started', failure: { kind: 'invalid' } })
    expect(f.controls.send.counts(f.demand)).toEqual({
      prepare: 0,
      materialize: 0,
      start: 0,
      closePrepared: 0,
      closeMaterialized: 0,
    })
    expect(
      await Promise.all([
        commands.loadRecovery(f.admit),
        commands.dispatches(f.admit),
        commands.loadRecovery(other),
        commands.dispatches(other),
      ]),
    ).toEqual(before)
    const valid = await f.dependencies.send.send(f.demand, new AbortController().signal)
    expect(valid.kind).toBe('started')
    if (valid.kind === 'started') await valid.facts[Symbol.asyncIterator]().return?.()
    expect(f.controls.send.counts(f.demand).start).toBe(1)
  })
}
it('clock waits end only at manual advance or cancellation and enforce finite capacity', async () => {
  const f = assembled()
  const signal = new AbortController()
  const target = '2026-10-19T00:00:01Z'
  const waiting = f.dependencies.clock.waitUntil(target, signal.signal)
  const cancelled = new AbortController()
  const other = f.dependencies.clock.waitUntil(target, cancelled.signal)
  expect(f.controls.clock.pending()).toBe(2)
  await expect(
    f.dependencies.clock.waitUntil(target, new AbortController().signal),
  ).rejects.toThrow(RangeError)
  cancelled.abort()
  expect(await other).toBe('cancelled')
  expect(f.controls.clock.pending()).toBe(1)
  f.controls.clock.advanceTo(target)
  expect(await waiting).toBe('elapsed')
  expect(f.controls.clock.pending()).toBe(0)
  expect(() => f.controls.clock.advanceTo('2026-10-18T00:00:00Z')).toThrow(RangeError)
  expect(() => f.controls.clock.advanceTo('bad')).toThrow(TypeError)
})
it('deduplicates host scheduling, isolates assemblies and protects a new route against an old withdrawal', async () => {
  const f = await prepared()
  const host = f.dependencies.instances
  unbox(await host.schedule(f.admit))
  unbox(await host.schedule(f.admit))
  expect(f.controls.instances.queued()).toHaveLength(1)
  const handle: ModelHandle<typeof f.principal> = {
    instance: instance(),
    async *observe() {
      yield { kind: 'ended', reason: 'observer-closed' }
    },
  }
  const old = unbox(await host.publish(f.execution, handle))
  const other = unbox(
    await f.dependencies.commands.claim({
      ...f.admit,
      instance: instance('two'),
      operation: op('successor'),
      continuity: proof(f.admit.call),
    }),
  )
  const next = unbox(await host.publish(other, { ...handle, instance: other.instance }))
  expect(unbox(await host.withdraw(old)).removed).toBe(false)
  expect(unbox(await host.directory.connect(f.admit)).kind).toBe('live')
  f.denied.add('observe')
  expect(await host.directory.connect(f.admit)).toMatchObject({ failure: { kind: 'denied' } })
  f.denied.delete('observe')
  expect(unbox(await host.withdraw(next)).removed).toBe(true)
  expect(unbox(await host.directory.connect(f.admit)).kind).toBe('no-live-route')
  expect(assembled().controls.instances.queued()).toEqual([])
})
it('closes a started send when cancellation wins during the recordSend await without any consumer iteration', async () => {
  const f = await prepared()
  const abort = new AbortController()
  const sending = f.dependencies.send.send(f.demand, abort.signal)
  for (let i = 0; i < 100 && f.controls.send.counts(f.demand).start === 0; i += 1)
    await Promise.resolve()
  expect(f.controls.send.counts(f.demand).start).toBe(1)
  abort.abort()
  const result = await sending
  expect(result.kind).toBe('started')
  for (let i = 0; i < 20 && f.controls.send.counts(f.demand).closePrepared === 0; i += 1)
    await Promise.resolve()
  expect(f.controls.send.counts(f.demand)).toMatchObject({
    start: 1,
    closeMaterialized: 1,
    closePrepared: 1,
  })
})
it('retry shares the exact saved position, keeps pending separate from a decision and recognizes the decided result once', async () => {
  const f = await prepared()
  const commands = f.dependencies.commands
  const fault = {
    cause: 'upstream-unavailable',
    diagnostic: 'offline',
    upstreamStatus: '503',
  } as const
  let serial = 0
  const write = async () => ({
    ...f.execution,
    operation: op(`retry-write-${++serial}`),
    expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
  })
  unbox(
    await commands.openReceiveWindow({
      ...(await write()),
      dispatch: f.dispatch,
      window: 'retry-failure',
    }),
  )
  const facts = [
    { kind: 'ended', termination: { kind: 'failed', fault } },
  ] satisfies import('@omne-harness/model-contract').TransportFact[]
  const hash = await import('../src/testing/value.ts')
  f.completeWindows.add(`${f.admit.call}/retry-failure/${hash.digest(facts)}`)
  unbox(
    await commands.preserve({
      ...(await write()),
      dispatch: f.dispatch,
      window: 'retry-failure',
      facts,
    }),
  )
  const position = unbox(await commands.prepareRetry({ ...(await write()), dispatch: f.dispatch }))
  const record = unbox(await commands.loadRecovery(f.admit))
  const demand = {
    ...f.admit,
    position,
    initiator: record.initiator,
    request: record.request,
    dispatches: unbox(await commands.dispatches(f.admit)),
    failure: fault,
  }
  expect(await f.dependencies.retry.decide(demand)).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  f.controls.retry.set({ ...f.admit, resolution: { kind: 'pending', position } })
  expect(unbox(await f.dependencies.retry.inspect(demand))).toEqual({ kind: 'pending', position })
  expect(unbox(await f.dependencies.retry.decide(demand))).toEqual({ kind: 'pending', position })
  expect(f.controls.retry.decisions(demand)).toBe(0)
  const resolution = {
    kind: 'decided',
    position,
    decision: { kind: 'stop', fault },
    source: proof(position.operation, 'retry'),
  } as const
  f.controls.retry.set({ ...f.admit, resolution })
  expect(unbox(await f.dependencies.retry.decide(demand))).toEqual(resolution)
  expect(unbox(await f.dependencies.retry.inspect(demand))).toEqual(resolution)
  expect(unbox(await f.dependencies.retry.decide(demand))).toEqual(resolution)
  expect(f.controls.retry.decisions(demand)).toBe(1)
  expect(() =>
    f.controls.retry.set({
      ...f.admit,
      resolution: { ...resolution, source: proof('other', 'retry') },
    }),
  ).toThrow(TypeError)
  f.denied.add('recovery')
  expect(await f.dependencies.retry.inspect(demand)).toMatchObject({ failure: { kind: 'denied' } })
})
it('rejects each incomplete dependency without invoking any dependency method', () => {
  const f = assembled()
  let invoked = 0
  function tracked<T extends object>(port: T): T {
    return new Proxy(port, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver)
        return typeof value === 'function'
          ? (...args: unknown[]) => {
              invoked += 1
              return Reflect.apply(value, target, args)
            }
          : value
      },
    })
  }
  const dependencies = {
    commands: tracked(f.dependencies.commands),
    send: tracked(f.dependencies.send),
    retry: tracked(f.dependencies.retry),
    clock: tracked(f.dependencies.clock),
    instances: tracked({
      ...f.dependencies.instances,
      directory: tracked(f.dependencies.instances.directory),
    }),
  }
  for (const [name, port] of Object.entries(dependencies)) {
    for (const method of Object.keys(port).filter(
      key => typeof Reflect.get(port, key) === 'function',
    )) {
      for (const replacement of [undefined, null, 1]) {
        const broken = { ...dependencies, [name]: { ...port, [method]: replacement } }
        expect(() => Reflect.apply(createModelRuntime, undefined, [broken, configuration])).toThrow(
          TypeError,
        )
        expect(invoked).toBe(0)
      }
    }
  }
  for (const directory of [undefined, {}, { connect: 1 }]) {
    expect(() =>
      Reflect.apply(createModelRuntime, undefined, [
        { ...dependencies, instances: { ...dependencies.instances, directory } },
        configuration,
      ]),
    ).toThrow(TypeError)
    expect(invoked).toBe(0)
  }
  expect(() => createModelRuntime(dependencies, configuration)).not.toThrow()
  expect(invoked).toBe(0)
})

for (const throws of [false, true]) {
  it(`releases both send resources once when next ${throws ? 'throws' : 'reaches exhaustion'}`, async () => {
    const f = await prepared(
      throws ? { kind: 'throws', error: new Error('script-stream-failure') } : undefined,
    )
    const sent = await f.dependencies.send.send(f.demand, new AbortController().signal)
    if (sent.kind !== 'started') throw new Error('send fixture')
    const iterator = sent.facts[Symbol.asyncIterator]()
    if (throws) await expect(iterator.next()).rejects.toThrow('script-stream-failure')
    else {
      expect(await iterator.next()).toEqual({
        done: false,
        value: {
          kind: 'ended',
          termination: {
            kind: 'failed',
            fault: {
              cause: 'upstream-unavailable',
              diagnostic: 'offline',
              upstreamStatus: '503',
            },
          },
        },
      })
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
    }
    expect(f.controls.send.counts(f.demand)).toMatchObject({
      start: 1,
      closePrepared: 1,
      closeMaterialized: 1,
    })
    await iterator.return?.()
    await iterator.return?.()
    expect(f.controls.send.counts(f.demand)).toMatchObject({
      start: 1,
      closePrepared: 1,
      closeMaterialized: 1,
    })
  })
}

it('rejects a plan for a different admission before preparing any resource', async () => {
  const f = await prepared(undefined, op('wrong-admission'))
  const before = await f.dependencies.commands.loadRecovery(f.admit)
  expect(await f.dependencies.send.send(f.demand, new AbortController().signal)).toMatchObject({
    kind: 'not-started',
    failure: { kind: 'invalid', field: 'admission' },
  })
  expect(f.controls.send.counts(f.demand)).toEqual({
    prepare: 0,
    materialize: 0,
    start: 0,
    closePrepared: 0,
    closeMaterialized: 0,
  })
  expect(await f.dependencies.commands.loadRecovery(f.admit)).toEqual(before)
})
