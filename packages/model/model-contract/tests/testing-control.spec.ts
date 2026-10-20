import { describe, expect, it } from 'vitest'
import {
  access,
  ackInput,
  admission,
  admitCall,
  alice,
  bob,
  call,
  callRef,
  dispatch,
  evidence,
  failureOf,
  instance,
  must,
  operation,
  scriptedProvider,
  settleCall,
  startedDispatch,
  tenantA,
  tenantB,
  textBlock,
  version,
} from './scripted-support.ts'

const cancelOf = (name: string, label: string) => ({
  ...access(name),
  operation: operation(label),
})

describe('cancelling a scripted call', () => {
  it('records the intent and returns it unchanged to every repeat, whatever the operation', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    const first = must(await calls.cancel(cancelOf('a', 'cancel-1')))
    expect(first).toEqual({
      kind: 'requested',
      operation: operation('cancel-1'),
      propagation: 'pending',
      upstream: 'unknown',
    })
    expect(must(await calls.cancel(cancelOf('a', 'cancel-1')))).toEqual(first)
    expect(must(await calls.cancel(cancelOf('a', 'cancel-2')))).toEqual(first)
    expect(must(await calls.cancel(cancelOf('a', 'cancel-3')))).toEqual(first)
  })

  it('counts the intent as one change of the call, however often it comes', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await calls.cancel(cancelOf('a', 'cancel-1'))
    await calls.cancel(cancelOf('a', 'cancel-2'))
    const found = must(await calls.inspect({ ...access('a'), admission: operation('admit-a') }))
    expect(found).toMatchObject({ state: { revision: '2' } })
  })

  it('answers a conflict when an operation of another method comes back as a cancel', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    await calls.cancel(cancelOf('a', 'cancel-1'))
    expect(failureOf(await calls.cancel(cancelOf('b', 'cancel-1')))).toMatchObject({
      kind: 'conflict',
      operation: operation('cancel-1'),
    })
  })

  it('shows how far the cancel went, without claiming the upstream has stopped', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await calls.cancel(cancelOf('a', 'cancel-1'))
    scripted.controller.advanceControl({
      ...callRef('a'),
      propagation: 'unavailable',
      upstream: 'unknown',
    })
    const found = must(await calls.inspect({ ...access('a'), admission: operation('admit-a') }))
    expect(found).toMatchObject({
      kind: 'found',
      state: {
        control: {
          kind: 'requested',
          operation: operation('cancel-1'),
          propagation: 'unavailable',
          upstream: 'unknown',
        },
        custody: { kind: 'producer' },
      },
    })
  })

  async function keepsControl(upstream: 'stopped' | 'completed') {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await calls.cancel(cancelOf('a', 'cancel-1'))
    scripted.controller.advanceControl({ ...callRef('a'), propagation: 'sent', upstream })
    expect(must(await calls.cancel(cancelOf('a', 'cancel-2')))).toEqual({
      kind: 'requested',
      operation: operation('cancel-1'),
      propagation: 'sent',
      upstream,
    })
  }

  it('keeps the control and the producer custody when the upstream stopped', () =>
    keepsControl('stopped'))
  it('keeps the control and the producer custody when the upstream completed', () =>
    keepsControl('completed'))

  it('keeps a result that arrives after the cancel, and neither acknowledges it nor calls it a failure', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await calls.cancel(cancelOf('a', 'cancel-1'))
    scripted.controller.recordDispatch({ ...callRef('a'), record: startedDispatch })
    settleCall(scripted, 'a')
    scripted.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, terminal: { kind: 'completed', reason: 'stop' } },
    })
    const found = must(await calls.inspect({ ...access('a'), admission: operation('admit-a') }))
    expect(found).toMatchObject({
      state: {
        phase: 'settled',
        settlement: { termination: { kind: 'completed', reason: 'stop' } },
        control: { kind: 'requested', operation: operation('cancel-1') },
        custody: { kind: 'producer' },
      },
    })
    expect(must(await calls.dispatches(access('a')))).toMatchObject([
      { dispatch: dispatch('first'), terminal: { kind: 'completed' } },
    ])
  })

  it('refuses a cancel from a principal without the right, and records no control', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    scripted.controller.revokeAccess({ ...callRef('a'), principal: bob, actions: ['cancel'] })
    expect(failureOf(await calls.cancel({ ...cancelOf('a', 'cancel-1'), principal: bob }))).toEqual(
      { kind: 'denied', action: 'cancel' },
    )
    expect(
      must(await calls.inspect({ ...access('a'), admission: operation('admit-a') })),
    ).toMatchObject({ state: { control: { kind: 'none' } } })
    expect(must(await calls.cancel(cancelOf('a', 'cancel-2')))).toMatchObject({
      operation: operation('cancel-2'),
    })
  })

  it('refuses a cancel of a call that was never accepted', async () => {
    const scripted = scriptedProvider()
    expect(
      failureOf(await scripted.provider.runtime.calls.cancel(cancelOf('missing', 'cancel-1'))),
    ).toEqual({ kind: 'denied', action: 'cancel' })
  })
})

describe('several calls in one scripted provider', () => {
  it('keeps what happens to one call away from the others', async () => {
    const scripted = scriptedProvider()
    const { calls, consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    await calls.cancel(cancelOf('a', 'cancel-a'))
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: 'all' })
    settleCall(scripted, 'b')
    must(await consumption.acknowledge(ackInput('b')))

    const b = must(await calls.inspect({ ...access('b'), admission: operation('admit-b') }))
    expect(b).toMatchObject({
      state: {
        call: call('b'),
        phase: 'settled',
        control: { kind: 'none' },
        custody: { kind: 'acknowledged' },
      },
    })
    const a = { ...access('a'), principal: bob }
    expect(must(await calls.inspect({ ...a, admission: operation('admit-a') }))).toMatchObject({
      state: { call: call('a'), phase: 'accepted', custody: { kind: 'producer' } },
    })
  })

  it('numbers the changes of each call from its own admission', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const second = must(await calls.admit(admission('b')))
    expect(second.revision).toBe('1')
  })
})

describe('driving a scripted provider wrongly', () => {
  const misuse = (reason: string, message: string) =>
    expect.objectContaining({ name: 'ScriptedModelError', reason, message })
  const unknownCall = (name: string) =>
    misuse('unknown-call', `the provider accepted no call mcall_${name}`)

  it('throws for a call the provider did not accept, on every call-addressed control', () => {
    const { controller } = scriptedProvider()
    const missing = callRef('missing')
    const shapes = {
      start: () =>
        controller.start({ ...missing, dispatch: dispatch('d'), firstContent: 'none-proven' }),
      emit: () => controller.emit({ ...missing, blocks: [] }),
      settle: () =>
        controller.settle({
          ...missing,
          version: version('x'),
          termination: { kind: 'completed', reason: 'stop' },
          parts: [].map(block => ({ kind: 'sealed' as const, block, trims: [] })),
          source: evidence('s'),
          pageSize: 1,
          pageTargetBytes: 1024,
        }),
      recordDispatch: () => controller.recordDispatch({ ...missing, record: startedDispatch }),
      advanceControl: () =>
        controller.advanceControl({ ...missing, propagation: 'sent', upstream: 'unknown' }),
      setCleanup: () => controller.setCleanup({ ...missing, cleanup: 'running', diagnostic: null }),
      withdrawInstance: () => controller.withdrawInstance(missing),
      replaceInstance: () => controller.replaceInstance({ ...missing, instance: instance('two') }),
      disconnectObservers: () => controller.disconnectObservers(missing),
      openObservations: () => controller.openObservations(missing),
    }
    for (const run of Object.values(shapes)) expect(run).toThrow(unknownCall('missing'))
  })

  it('throws for a call of another tenant, and for a tenant that is not a legal identity, as for a call that does not exist', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(() => scripted.controller.disconnectObservers(callRef('a', tenantB))).toThrow(
      unknownCall('a'),
    )
    const forged = { ...tenantA }
    expect(() => scripted.controller.disconnectObservers(callRef('a', forged))).toThrow(
      unknownCall('a'),
    )
  })

  it('throws when a call that already ended is asked to run or show more', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const ended = misuse('invalid-script', 'the call mcall_a already ended')
    expect(() =>
      scripted.controller.start({
        ...callRef('a'),
        dispatch: dispatch('d'),
        firstContent: 'observed',
      }),
    ).toThrow(ended)
    expect(() => scripted.controller.emit({ ...callRef('a'), blocks: [] })).toThrow(ended)
    expect(() => settleCall(scripted, 'a')).toThrow(ended)
  })

  async function refusesPageSize(pageSize: number) {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(() =>
      scripted.controller.settle({
        ...callRef('a'),
        version: version('a'),
        termination: { kind: 'completed', reason: 'stop' },
        parts: [].map(block => ({ kind: 'sealed' as const, block, trims: [] })),
        source: evidence('s'),
        pageSize,
        pageTargetBytes: 1024,
      }),
    ).toThrow(misuse('invalid-script', 'pageSize must be a positive integer'))
  }

  it('throws for a page size of zero', () => refusesPageSize(0))
  it('throws for a negative page size', () => refusesPageSize(-1))
  it('throws for a page size that is not an integer', () => refusesPageSize(1.5))
  it('throws for a page size that is not a number', () => refusesPageSize(Number.NaN))

  it('accepts a page size of one', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.settle({
      ...callRef('a'),
      version: version('a'),
      termination: { kind: 'completed', reason: 'stop' },
      parts: [textBlock('b1', 'one'), textBlock('b2', 'two')].map(block => ({
        kind: 'sealed' as const,
        block,
        trims: [],
      })),
      source: evidence('s'),
      pageSize: 1,
      pageTargetBytes: 1024,
    })
    const started = must(
      await scripted.provider.runtime.consumption.beginRead({
        ...access('a'),
        operation: operation('read-a'),
        result: version('a'),
      }),
    )
    expect(started).toMatchObject({
      value: {
        page: { parts: [{ kind: 'sealed', block: textBlock('b1', 'one'), trims: [] }], next: '1' },
      },
    })
  })

  it('throws when the control or the cleanup it should move does not exist yet', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(() =>
      scripted.controller.advanceControl({
        ...callRef('a'),
        propagation: 'sent',
        upstream: 'unknown',
      }),
    ).toThrow(misuse('invalid-script', 'the call mcall_a has no control'))
    expect(() =>
      scripted.controller.setCleanup({ ...callRef('a'), cleanup: 'running', diagnostic: null }),
    ).toThrow(misuse('invalid-script', 'the call mcall_a is not acknowledged'))
  })

  it('throws when the instance it should put in place is already the live one', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(() =>
      scripted.controller.replaceInstance({ ...callRef('a'), instance: instance('one') }),
    ).toThrow(misuse('invalid-script', 'the instance is already the live one'))
  })

  it('accepts the instance that left as the one to put back', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.withdrawInstance(callRef('a'))
    scripted.controller.replaceInstance({ ...callRef('a'), instance: instance('one') })
    const route = must(await scripted.provider.runtime.instances.connect(access('a')))
    expect(route.kind === 'live' && route.handle.instance).toBe(instance('one'))
  })

  it('throws when access is revoked for a tenant that is not a legal identity', () => {
    const scripted = scriptedProvider()
    expect(() =>
      scripted.controller.revokeAccess({
        tenant: { ...tenantA },
        call: call('a'),
        principal: alice,
        actions: 'all',
      }),
    ).toThrow(misuse('invalid-script', 'the tenant is not a legal identity'))
  })
})
