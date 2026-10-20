import { expect, it } from 'vitest'
import { createModelRuntime, type ModelConfiguration } from '@omne-harness/model'
import { createTestModelDependencies, type TestModelSendPlan } from '@omne-harness/model/testing'
import {
  decodeDispatchId,
  decodeCredentialId,
  decodeReadId,
  decodeResultVersion,
  type ModelHandle,
  type FixedModelRequest,
  type Parameter,
  type ModelRetryPolicy,
} from '@omne-harness/model-contract'
import { fixture, instance, op, proof, unbox, identity, callId } from './memory-fixture.ts'

const configuration: ModelConfiguration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
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
    sending: {
      maxRetainedAttempts: 8,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'value', scope: 'factory', value: 'synthetic' }),
      },
      sources: [
        {
          profile: f.admit.request.profile,
          supplier: f.admit.request.suppliers[0].adoption,
          recipient: f.admit.request.suppliers[0].recipient,
          model: f.admit.request.suppliers[0].model,
          credential: {
            kind: 'factory',
            official: true,
            queryId: unbox(decodeCredentialId('factory-query')),
          },
          current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
        },
      ],
    },
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
it('constructs the real factory without touching dependencies and keeps unsupported operations explicitly unavailable', async () => {
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
  function unread<T extends object>(input: T): T {
    return new Proxy(input, {
      get() {
        throw new Error('unimplemented operation read request data')
      },
    })
  }
  function invoke(subject: typeof provider) {
    return Promise.all([
      subject.runtime.consumption.beginRead({ ...f.admit, result }),
      subject.runtime.consumption.readNext(unread({ ...f.admit, read, after: '1' })),
      subject.runtime.consumption.closeRead(unread({ ...f.admit, read })),
      subject.runtime.consumption.acknowledge({
        ...f.admit,
        result,
        evidence: { kind: 'processed', completion: proof('test') },
      }),
      subject.recover(unread(f.admit)),
      subject.quiesce(),
    ])
  }
  const expected = [
    ['consumption.beginRead', '1.7'],
    ['consumption.readNext', '1.7'],
    ['consumption.closeRead', '1.7'],
    ['consumption.acknowledge', '1.7'],
    ['recover', '5.4'],
    ['quiesce', '5.5'],
  ]
  const other = createModelRuntime(dependencies, configuration)
  const batches = await Promise.all([invoke(provider), invoke(provider), invoke(other)])
  batches.push(await invoke(provider))
  const replies = []
  const failures = []
  for (const answers of batches) {
    expect(answers).toHaveLength(expected.length)
    for (const [index, [operation, stage]] of expected.entries()) {
      const answer = answers[index]
      expect(answer).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'model-runtime',
          diagnostic: `managed-runtime-not-implemented operation=${operation} stage=${stage}`,
        },
      })
      replies.push(answer)
      if (answer === undefined || !('failure' in answer))
        throw new Error('expected unavailable failure')
      failures.push(answer.failure)
    }
  }
  expect(new Set(replies).size).toBe(replies.length)
  expect(new Set(failures).size).toBe(failures.length)
  expect(invoked).toBe(0)
})
it('rejects dependency and numeric configuration defects at construction', () => {
  const f = assembled()
  for (const key of Object.keys(f.dependencies)) {
    for (const replacement of [undefined, {}]) {
      const invalid = { ...f.dependencies, [key]: replacement }
      expect(() => Reflect.apply(createModelRuntime, undefined, [invalid, configuration])).toThrow(
        new TypeError(`invalid Model dependency ${key}`),
      )
    }
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
    'observerCheckIntervalMs',
    'resultPageTargetBytes',
    'readIdleMs',
  ])
    expect(() =>
      Reflect.apply(createModelRuntime, undefined, [
        f.dependencies,
        { ...configuration, [field]: 0 },
      ]),
    ).toThrow(RangeError)
  expect(() =>
    createModelRuntime(f.dependencies, {
      ...configuration,
      observerCheckIntervalMs: Number.MAX_SAFE_INTEGER + 1,
    }),
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
  const normalWrite = unknown.dependencies.commands.recordMaterialization
  const sender = unknown.controls.send.createSender({
    commands: {
      ...unknown.dependencies.commands,
      recordMaterialization: input => {
        unknown.controls.commands.injectUnknown({
          ...input,
          method: 'recordMaterialization',
          effect: 'applied',
        })
        return normalWrite(input)
      },
    },
  })
  expect((await sender.send(unknown.demand, new AbortController().signal)).kind).toBe('unknown')
  expect(unknown.controls.send.counts(unknown.demand)).toMatchObject({
    start: 0,
    closePrepared: 0,
    closeMaterialized: 0,
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
it('retains an interruption fact when cancellation wins during recordSend before consumer iteration', async () => {
  const f = await prepared()
  const abort = new AbortController()
  const sending = f.dependencies.send.send(f.demand, abort.signal)
  for (let i = 0; i < 100 && f.controls.send.counts(f.demand).start === 0; i += 1)
    await Promise.resolve()
  expect(f.controls.send.counts(f.demand).start).toBe(1)
  abort.abort()
  const result = await sending
  expect(result.kind).toBe('started')
  expect(f.controls.send.counts(f.demand)).toMatchObject({
    start: 1,
    closeMaterialized: 0,
    closePrepared: 0,
  })
  if (result.kind !== 'started') throw new Error('send fixture')
  const facts = []
  for await (const fact of result.facts) facts.push(fact)
  expect(facts).toEqual([
    { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
  ])
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
  } satisfies Parameters<ModelRetryPolicy<typeof f.principal>['decide']>[0]
  expect(await f.dependencies.retry.decide(demand)).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  f.controls.retry.set({ ...f.admit, resolution: { kind: 'pending', position } })
  expect(unbox(await f.dependencies.retry.inspect(demand))).toEqual({ kind: 'pending', position })
  expect(unbox(await f.dependencies.retry.decide(demand))).toEqual({ kind: 'pending', position })
  expect(f.controls.retry.decisions(demand)).toBe(0)
  const rejectsInvalid = async () => {
    const before = await commands.loadRecovery(f.admit)
    const decisions = f.controls.retry.decisions(demand)
    for (const location of ['parameters', 'applied', 'requested'] as const) {
      for (const kind of [
        'temperature',
        'top-p',
        'frequency-penalty',
        'presence-penalty',
      ] as const) {
        for (const value of [NaN, Infinity, -Infinity, 3]) {
          const invalid = {
            ...demand,
            request: invalidParameterRequest(demand.request, location, { kind, value }),
          }
          f.denied.add('recovery')
          expect(await f.dependencies.retry.decide(invalid)).toMatchObject({
            failure: { kind: 'denied' },
          })
          f.denied.delete('recovery')
          const pending = f.dependencies.retry.decide(invalid)
          expect(pending).toBeInstanceOf(Promise)
          expect(await pending).toMatchObject({
            failure: { kind: 'invalid', field: kind, reason: 'range' },
          })
        }
      }
    }
    for (const request of sparseDemandRequests(demand.request)) {
      const pending = f.dependencies.retry.decide({ ...demand, request })
      expect(pending).toBeInstanceOf(Promise)
      expect(await pending).toMatchObject({ failure: { kind: 'invalid' } })
    }
    expect(
      await f.dependencies.retry.decide({
        ...demand,
        request: { ...demand.request, parameters: [{ kind: 'temperature', value: 0.5 }] },
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'request', reason: 'not-original' } })
    expect(f.controls.retry.decisions(demand)).toBe(decisions)
    expect(await commands.loadRecovery(f.admit)).toEqual(before)
  }
  await rejectsInvalid()
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
  await rejectsInvalid()
  expect(unbox(await f.dependencies.retry.decide(demand))).toEqual(resolution)
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
    if (throws) await expect(iterator.next()).rejects.toThrow('model-send fact-stream-failed')
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

for (const scope of ['same-tenant', 'cross-tenant'] as const) {
  for (const mutation of [
    'execution-replacement',
    'nested-execution',
    'outer-identity',
    'request',
    'supplier',
    'consumer',
    'initiator',
  ] as const) {
    it(`keeps the original send fixed after ${scope} ${mutation} alias mutation`, async () => {
      const f = await prepared({
        kind: 'terminated',
        termination: { kind: 'completed', reason: 'stop' },
      })
      const foreign = identity('6')
      const authorize = f.options.authority.authorize
      f.options.authority.authorize = input =>
        input.resource.kind === 'call' && input.resource.call === callId('other')
          ? input.action === 'send'
            ? { failure: { kind: 'denied', action: 'send' } }
            : { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
          : authorize(input)
      const commands = f.dependencies.commands
      const other = {
        ...f.admit,
        tenant: scope === 'same-tenant' ? f.tenant : foreign,
        call: callId('other'),
        operation: op('other-admit'),
      }
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
      const before = await Promise.all([commands.loadRecovery(other), commands.dispatches(other)])
      const demand = {
        ...f.demand,
        execution: { ...f.demand.execution },
        request: structuredClone(f.demand.request),
        supplier: structuredClone(f.demand.supplier),
        consumer: { ...f.demand.consumer },
        initiator: { ...f.demand.initiator },
      }
      const pending = f.dependencies.send.send(demand, new AbortController().signal)
      switch (mutation) {
        case 'execution-replacement':
          demand.execution = { ...execution }
          break
        case 'nested-execution':
          Object.assign(demand.execution, execution)
          break
        case 'outer-identity':
          demand.tenant = other.tenant
          demand.call = other.call
          break
        case 'request':
          Object.assign(demand.request.suppliers[0].adoption, { revision: 'changed' })
          Object.assign(demand.request, { parameters: [{ kind: 'temperature', value: 2 }] })
          break
        case 'supplier':
          Object.assign(demand.supplier, { model: 'changed' })
          break
        case 'consumer':
          demand.consumer.work = 'changed'
          break
        case 'initiator':
          demand.initiator.revision = 'changed'
          break
      }
      const result = await pending
      expect(result.kind).toBe('started')
      expect(await Promise.all([commands.loadRecovery(other), commands.dispatches(other)])).toEqual(
        before,
      )
      const original = unbox(await commands.dispatches(f.admit))[0]
      expect(original).toMatchObject({
        send: 'started',
        firstContent: 'uncertain',
        supplier: f.demand.supplier,
        materialization: { receipt: f.plan.script.receipt },
      })
      if (result.kind === 'started') {
        const facts = []
        for await (const fact of result.facts) facts.push(fact)
        expect(facts).toEqual([
          { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
        ])
      }
      expect(f.controls.send.counts(f.demand)).toEqual({
        prepare: 1,
        materialize: 1,
        start: 1,
        closePrepared: 1,
        closeMaterialized: 1,
      })
      expect(Object.isFrozen(demand)).toBe(false)
      expect(Object.isFrozen(demand.execution)).toBe(false)
      expect((await f.dependencies.send.send(f.demand, new AbortController().signal)).kind).toBe(
        'unknown',
      )
    })
  }
}
it('preserves a noncloneable principal proof, current qualification and the original cancellation signal', async () => {
  const f = await prepared()
  const principal = { ...f.principal, prove: () => true }
  const authorize = f.options.authority.authorize
  f.options.authority.authorize = input =>
    authorize({
      ...input,
      access: {
        ...input.access,
        principal: input.access.principal === principal ? f.principal : input.access.principal,
      },
    })
  const abort = new AbortController()
  const pending = f.dependencies.send.send({ ...f.demand, principal }, abort.signal)
  for (let i = 0; i < 100 && f.controls.send.counts(f.demand).materialize === 0; i += 1)
    await Promise.resolve()
  expect(f.controls.send.counts(f.demand)).toMatchObject({ materialize: 1, start: 0 })
  abort.abort()
  expect(await pending).toMatchObject({ kind: 'not-started' })
  expect(f.controls.send.counts(f.demand)).toEqual({
    prepare: 1,
    materialize: 1,
    start: 0,
    closePrepared: 1,
    closeMaterialized: 1,
  })
})
function invalidParameterRequest(
  request: FixedModelRequest,
  location: 'parameters' | 'applied' | 'requested',
  parameter: Parameter,
): FixedModelRequest {
  if (location === 'parameters') return { ...request, parameters: [parameter] }
  return {
    ...request,
    parameterAdoptions: [
      {
        supplier: request.suppliers[0].adoption,
        applied: location === 'applied' ? parameter : { kind: 'temperature', value: 1 },
        origin:
          location === 'requested'
            ? { kind: 'explicit', requested: parameter, source: request.source }
            : { kind: 'default', source: request.source },
      },
    ],
  }
}
it('returns send failures for illegal parameters in every request carrier without acquiring resources', async () => {
  const f = await prepared()
  const before = await f.dependencies.commands.loadRecovery(f.admit)
  for (const location of ['parameters', 'applied', 'requested'] as const) {
    for (const kind of ['temperature', 'top-p', 'frequency-penalty', 'presence-penalty'] as const) {
      for (const value of [NaN, Infinity, -Infinity, 3]) {
        const demand = {
          ...f.demand,
          request: invalidParameterRequest(f.demand.request, location, { kind, value }),
        }
        f.denied.add('send')
        expect(await f.dependencies.send.send(demand, new AbortController().signal)).toMatchObject({
          kind: 'not-started',
          failure: { kind: 'denied' },
        })
        f.denied.delete('send')
        const pending = f.dependencies.send.send(demand, new AbortController().signal)
        expect(pending).toBeInstanceOf(Promise)
        expect(await pending).toMatchObject({
          kind: 'not-started',
          failure: { kind: 'invalid', field: kind, reason: 'range' },
        })
      }
    }
  }
  expect(await f.dependencies.commands.loadRecovery(f.admit)).toEqual(before)
  expect(f.controls.send.counts(f.demand)).toEqual({
    prepare: 0,
    materialize: 0,
    start: 0,
    closePrepared: 0,
    closeMaterialized: 0,
  })
  const result = await f.dependencies.send.send(f.demand, new AbortController().signal)
  expect(result.kind).toBe('started')
  if (result.kind === 'started') await result.facts[Symbol.asyncIterator]().return?.()
})

function sparseDemandRequests(request: FixedModelRequest): FixedModelRequest[] {
  function singleHole<T>(): T[] {
    const values: T[] = []
    values.length = 1
    return values
  }
  function holes<T>(first: T): [T, ...T[]] {
    const values: [T, ...T[]] = [first]
    values.length = 3
    values[2] = first
    return values
  }
  const requests: FixedModelRequest[] = [
    { ...request, suppliers: holes(request.suppliers[0]) },
    { ...request, parameters: singleHole<Parameter>() },
    { ...request, system: singleHole<FixedModelRequest['system'][number]>() },
    { ...request, messages: singleHole<FixedModelRequest['messages'][number]>() },
    { ...request, tools: singleHole<FixedModelRequest['tools'][number]>() },
    {
      ...request,
      parameterAdoptions: singleHole<FixedModelRequest['parameterAdoptions'][number]>(),
    },
  ]
  for (const location of ['parameters', 'applied', 'requested'] as const)
    requests.push(invalidParameterRequest(request, location, { kind: 'stop', value: holes('END') }))
  return requests
}
it('rejects sparse send demands without preparing, committing facts or starting transport', async () => {
  const f = await prepared()
  const before = await f.dependencies.commands.loadRecovery(f.admit)
  for (const request of sparseDemandRequests(f.demand.request)) {
    const demand = { ...f.demand, request }
    f.denied.add('send')
    expect(await f.dependencies.send.send(demand, new AbortController().signal)).toMatchObject({
      kind: 'not-started',
      failure: { kind: 'denied' },
    })
    f.denied.delete('send')
    const pending = f.dependencies.send.send(demand, new AbortController().signal)
    expect(pending).toBeInstanceOf(Promise)
    expect(await pending).toMatchObject({ kind: 'not-started', failure: { kind: 'invalid' } })
  }
  expect(await f.dependencies.commands.loadRecovery(f.admit)).toEqual(before)
  expect(f.controls.send.counts(f.demand)).toEqual({
    prepare: 0,
    materialize: 0,
    start: 0,
    closePrepared: 0,
    closeMaterialized: 0,
  })
  const result = await f.dependencies.send.send(f.demand, new AbortController().signal)
  expect(result.kind).toBe('started')
  if (result.kind === 'started') await result.facts[Symbol.asyncIterator]().return?.()
})
