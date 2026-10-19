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
  liveHandle,
  must,
  operation,
  scriptedProvider,
  settleCall,
  tenantA,
  tenantB,
  version,
  watch,
} from './scripted-support.ts'

async function inspected(scripted: ReturnType<typeof scriptedProvider>, name: string) {
  return must(
    await scripted.provider.runtime.calls.inspect({
      ...access(name),
      admission: operation(`admit-${name}`),
    }),
  )
}

describe('a write whose commit is unknown', () => {
  const unknown = (name: string) => ({ kind: 'commit-unknown', operation: operation(name) })

  it('is answered once from the original acceptance when the unknown admission had taken effect', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('admit-a'),
      effect: 'applied',
      query: 'answers',
    })
    expect(failureOf(await calls.admit(admission('a')))).toEqual(unknown('admit-a'))
    expect(
      must(
        await scripted.controller.queryCommit({ ...access('a'), operation: operation('admit-a') }),
      ),
    ).toEqual({ kind: 'committed', value: { revision: '1' } })
    expect(must(await calls.admit(admission('a')))).toEqual({
      call: call('a'),
      revision: '1',
      recovered: true,
    })
    expect(await inspected(scripted, 'a')).toMatchObject({
      kind: 'found',
      state: { revision: '1' },
    })
    expect(
      must(await scripted.provider.recover({ principal: alice, tenant: access('a').tenant })),
    ).toEqual({
      scheduled: '1',
    })
  })

  it('leaves nothing behind when the unknown admission was dropped, and the retry is the first acceptance', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('admit-a'),
      effect: 'dropped',
      query: 'answers',
    })
    expect(failureOf(await calls.admit(admission('a')))).toEqual(unknown('admit-a'))
    expect(await inspected(scripted, 'a')).toEqual({
      kind: 'not-accepted',
      operation: operation('admit-a'),
    })
    const query = { ...access('a'), operation: operation('admit-a') }
    expect(must(await scripted.controller.queryCommit(query))).toEqual({ kind: 'not-committed' })
    expect(must(await calls.admit(admission('a')))).toEqual({
      call: call('a'),
      revision: '1',
      recovered: false,
    })
    expect(must(await scripted.controller.queryCommit(query))).toEqual({
      kind: 'committed',
      value: { revision: '1' },
    })
  })

  async function staysUnknown(effect: 'applied' | 'dropped') {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('admit-a'),
      effect,
      query: 'stays-unknown',
    })
    await calls.admit(admission('a'))
    const query = { ...access('a'), operation: operation('admit-a') }
    expect(must(await scripted.controller.queryCommit(query))).toEqual({ kind: 'unknown' })
    expect(must(await scripted.controller.queryCommit(query))).toEqual({ kind: 'unknown' })
    must(await calls.admit(admission('a')))
    expect(must(await scripted.controller.queryCommit(query))).toEqual({
      kind: 'committed',
      value: { revision: '1' },
    })
  }

  it('stays unknown to a query after an applied write until the same operation is sent again', () =>
    staysUnknown('applied'))
  it('stays unknown to a query after a dropped write until the same operation is sent again', () =>
    staysUnknown('dropped'))

  it('stays unknown to a query after an unknown cancel or acknowledgement until the same operation is sent again', async () => {
    const scripted = scriptedProvider()
    const { calls, consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    for (const action of ['cancel', 'acknowledge'] as const)
      scripted.controller.commitUnknown({
        tenant: tenantA,
        action,
        operation: operation(`${action}-a`),
        effect: 'applied',
        query: 'stays-unknown',
      })
    await calls.cancel({ ...access('a'), operation: operation('cancel-a') })
    await consumption.acknowledge({ ...ackInput('a'), operation: operation('acknowledge-a') })
    const query = (label: string) =>
      scripted.controller.queryCommit({ ...access('a'), operation: operation(label) })
    expect(must(await query('cancel-a'))).toEqual({ kind: 'unknown' })
    expect(must(await query('acknowledge-a'))).toEqual({ kind: 'unknown' })
    await calls.cancel({ ...access('a'), operation: operation('cancel-a') })
    expect(must(await query('cancel-a'))).toMatchObject({ kind: 'committed' })
    expect(must(await query('acknowledge-a'))).toEqual({ kind: 'unknown' })
    await consumption.acknowledge({ ...ackInput('a'), operation: operation('acknowledge-a') })
    expect(must(await query('acknowledge-a'))).toMatchObject({ kind: 'committed' })
  })

  it('is played once, for the operation it names', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'admit',
      operation: operation('admit-a'),
      effect: 'dropped',
      query: 'answers',
    })
    expect(must(await calls.admit(admission('b'))).recovered).toBe(false)
    expect(failureOf(await calls.admit(admission('a')))).toEqual(unknown('admit-a'))
    expect(must(await calls.admit(admission('a'))).recovered).toBe(false)
    expect(must(await calls.admit(admission('a'))).recovered).toBe(true)
  })

  it('does not apply an unknown admission scripted for another action', async () => {
    const scripted = scriptedProvider()
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'cancel',
      operation: operation('admit-a'),
      effect: 'dropped',
      query: 'answers',
    })
    expect(must(await scripted.provider.runtime.calls.admit(admission('a'))).recovered).toBe(false)
  })

  it('keeps the original control when an unknown cancel had taken effect', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'cancel',
      operation: operation('cancel-1'),
      effect: 'applied',
      query: 'answers',
    })
    const cancel = { ...access('a'), operation: operation('cancel-1') }
    expect(failureOf(await calls.cancel(cancel))).toEqual(unknown('cancel-1'))
    expect(await inspected(scripted, 'a')).toMatchObject({
      state: { control: { kind: 'requested', operation: operation('cancel-1') } },
    })
    expect(must(await calls.cancel(cancel))).toMatchObject({ operation: operation('cancel-1') })
    expect(must(await calls.cancel({ ...cancel, operation: operation('cancel-2') }))).toMatchObject(
      { operation: operation('cancel-1') },
    )
  })

  it('leaves no control when an unknown cancel was dropped, and the retry requests it', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'cancel',
      operation: operation('cancel-1'),
      effect: 'dropped',
      query: 'answers',
    })
    const cancel = { ...access('a'), operation: operation('cancel-1') }
    expect(failureOf(await calls.cancel(cancel))).toEqual(unknown('cancel-1'))
    expect(await inspected(scripted, 'a')).toMatchObject({ state: { control: { kind: 'none' } } })
    expect(must(await calls.cancel(cancel))).toMatchObject({
      kind: 'requested',
      operation: operation('cancel-1'),
    })
  })

  it('returns the original acknowledgement when an unknown acknowledgement had taken effect', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'acknowledge',
      operation: operation('ack-a'),
      effect: 'applied',
      query: 'answers',
    })
    expect(failureOf(await consumption.acknowledge(ackInput('a')))).toEqual(unknown('ack-a'))
    expect(await inspected(scripted, 'a')).toMatchObject({
      state: { custody: { kind: 'acknowledged', operation: operation('ack-a') } },
    })
    expect(must(await consumption.acknowledge(ackInput('a')))).toMatchObject({
      call: call('a'),
      custody: { kind: 'acknowledged', operation: operation('ack-a'), cleanup: 'pending' },
    })
  })

  it('keeps the custody with the producer when an unknown acknowledgement was dropped', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'acknowledge',
      operation: operation('ack-a'),
      effect: 'dropped',
      query: 'answers',
    })
    expect(failureOf(await consumption.acknowledge(ackInput('a')))).toEqual(unknown('ack-a'))
    expect(await inspected(scripted, 'a')).toMatchObject({
      state: { custody: { kind: 'producer' } },
    })
    expect(must(await consumption.acknowledge(ackInput('a')))).toMatchObject({
      custody: { kind: 'acknowledged', cleanup: 'pending' },
    })
  })

  it('does not show an operation of one tenant to a query of another', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const query = { ...access('a'), operation: operation('admit-a') }
    expect(must(await scripted.controller.queryCommit(query))).toMatchObject({ kind: 'committed' })
    expect(must(await scripted.controller.queryCommit({ ...query, tenant: tenantB }))).toEqual({
      kind: 'not-committed',
    })
  })

  it('denies a commit query of a principal whose access was revoked', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: ['query'] })
    const query = { ...access('a'), operation: operation('admit-a') }
    expect(failureOf(await scripted.controller.queryCommit(query))).toEqual({
      kind: 'denied',
      action: 'query',
    })
  })
})

describe('a call with no live route', () => {
  it('finds no live route after the instance left, and still shows the original call', async () => {
    const scripted = scriptedProvider()
    const { instances } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    const before = await inspected(scripted, 'a')
    scripted.controller.withdrawInstance(callRef('a'))
    expect(must(await instances.connect(access('a')))).toEqual({ kind: 'no-live-route' })
    expect(await inspected(scripted, 'a')).toEqual(before)
    expect(must(await instances.connect(access('b'))).kind).toBe('live')
  })

  it('ends the open observers as unavailable when the instance leaves', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const watcher = watch(await liveHandle(scripted, 'a'))
    await watcher.next()
    scripted.controller.withdrawInstance(callRef('a'))
    expect(await watcher.next()).toEqual({ kind: 'ended', reason: 'unavailable' })
    expect(await watcher.next()).toBe('finished')
  })

  it('refuses to open an observation on the handle of an instance that has left', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const handle = await liveHandle(scripted, 'a')
    scripted.controller.withdrawInstance(callRef('a'))
    expect(await watch(handle).next()).toEqual({ kind: 'ended', reason: 'unavailable' })
  })

  it('connects again to the instance that takes the call over', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.withdrawInstance(callRef('a'))
    scripted.controller.replaceInstance({ ...callRef('a'), instance: instance('two') })
    const route = must(await scripted.provider.runtime.instances.connect(access('a')))
    expect(route.kind === 'live' && route.handle.instance).toBe(instance('two'))
  })
})

describe('a stale instance', () => {
  it('ends the old handle as stale-instance, hands out the new one, and keeps the call', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const oldHandle = await liveHandle(scripted, 'a')
    const watcher = watch(oldHandle)
    await watcher.next()
    scripted.controller.replaceInstance({ ...callRef('a'), instance: instance('two') })

    expect(await watcher.next()).toEqual({ kind: 'ended', reason: 'stale-instance' })
    expect(await watcher.next()).toBe('finished')
    expect(await watch(oldHandle).next()).toEqual({ kind: 'ended', reason: 'stale-instance' })

    const fresh = await liveHandle(scripted, 'a')
    expect(fresh.instance).toBe(instance('two'))
    expect(fresh).not.toBe(oldHandle)
    expect(await watch(fresh).next()).toMatchObject({
      kind: 'snapshot',
      value: { call: call('a') },
    })
    expect(await inspected(scripted, 'a')).toMatchObject({
      kind: 'found',
      state: { call: call('a'), revision: '1' },
    })
  })

  it('hands out one handle for one instance', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(await liveHandle(scripted, 'a')).toBe(await liveHandle(scripted, 'a'))
  })

  it('does not let another call of the same provider feel the replacement', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    const other = watch(await liveHandle(scripted, 'b'))
    await other.next()
    scripted.controller.replaceInstance({ ...callRef('a'), instance: instance('two') })
    settleCall(scripted, 'b')
    expect(await other.next()).toMatchObject({
      kind: 'changed',
      value: { state: { phase: 'settled' } },
    })
  })
})

describe('a principal who lost access', () => {
  it('ends the observation, the read and every new request as denied, and the call stays', async () => {
    const scripted = scriptedProvider()
    const { calls, consumption, instances } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const handle = await liveHandle(scripted, 'a')
    const watcher = watch(handle)
    await watcher.next()
    const started = must(
      await consumption.beginRead({
        ...access('a'),
        operation: operation('read-a'),
        result: version('a'),
      }),
    )
    if (started.kind !== 'started') throw new Error('read')

    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: 'all' })

    expect(await watcher.next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(await watch(handle).next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(
      must(await consumption.readNext({ ...access('a'), read: started.read, after: '2' })),
    ).toEqual({ kind: 'ended', reason: 'denied' })
    expect(must(await consumption.closeRead({ ...access('a'), read: started.read }))).toEqual({
      kind: 'ended',
      reason: 'denied',
    })
    const denial = (action: string) => ({ kind: 'denied', action })
    expect(
      failureOf(await calls.inspect({ ...access('a'), admission: operation('admit-a') })),
    ).toEqual(denial('inspect'))
    expect(failureOf(await calls.dispatches(access('a')))).toEqual(denial('dispatches'))
    expect(failureOf(await instances.connect(access('a')))).toEqual(denial('connect'))
    expect(
      failureOf(
        await consumption.beginRead({
          ...access('a'),
          operation: operation('read-a-2'),
          result: version('a'),
        }),
      ),
    ).toEqual(denial('read'))
    expect(failureOf(await consumption.acknowledge(ackInput('a')))).toEqual(denial('acknowledge'))
    expect(failureOf(await calls.cancel({ ...access('a'), operation: operation('c') }))).toEqual(
      denial('cancel'),
    )
    expect(failureOf(await calls.admit(admission('a')))).toEqual(denial('admit'))

    const other = { ...access('a'), principal: bob }
    expect(must(await calls.inspect({ ...other, admission: operation('admit-a') }))).toMatchObject({
      kind: 'found',
      state: { call: call('a'), phase: 'settled' },
    })
  })

  it('loses only the actions that were revoked', async () => {
    const scripted = scriptedProvider()
    const { calls } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    const watcher = watch(await liveHandle(scripted, 'a'))
    await watcher.next()
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: ['cancel'] })
    expect(failureOf(await calls.cancel({ ...access('a'), operation: operation('c') }))).toEqual({
      kind: 'denied',
      action: 'cancel',
    })
    expect(
      must(await calls.inspect({ ...access('a'), admission: operation('admit-a') })).kind,
    ).toBe('found')
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('d'),
      firstContent: 'observed',
    })
    expect(await watcher.next()).toMatchObject({ kind: 'changed' })
  })

  it('ends only the observations of the principal who lost access', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const handle = await liveHandle(scripted, 'a')
    const lost = watch(handle, alice)
    const kept = watch(handle, bob)
    await lost.next()
    await kept.next()
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: ['observe'] })
    expect(await lost.next()).toEqual({ kind: 'ended', reason: 'denied' })
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('d'),
      firstContent: 'observed',
    })
    expect(await kept.next()).toMatchObject({ kind: 'changed' })
  })

  it('denies the observation of a principal from another tenant', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(await watch(await liveHandle(scripted, 'a'), alice, tenantB).next()).toEqual({
      kind: 'ended',
      reason: 'denied',
    })
  })
})

describe('an acknowledgement sent twice', () => {
  it('returns the original receipt with the cleanup state of now', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    const first = must(await consumption.acknowledge(ackInput('a')))
    scripted.controller.setCleanup({
      ...callRef('a'),
      cleanup: 'blocked',
      diagnostic: 'a reader remains',
    })
    const again = must(await consumption.acknowledge(ackInput('a')))
    expect(again).toEqual({
      ...first,
      custody: { ...first.custody, cleanup: 'blocked', diagnostic: 'a reader remains' },
    })
    expect(again.custody.operation).toBe(operation('ack-a'))
    expect(again.custody.receipt).toEqual(evidence('processed'))
  })

  it('answers a conflict when the same operation comes with other evidence', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    must(await consumption.acknowledge(ackInput('a')))
    expect(failureOf(await consumption.acknowledge(ackInput('a', 'other')))).toEqual({
      kind: 'conflict',
      operation: operation('ack-a'),
      revision: '3',
    })
  })

  it('answers a conflict when the same operation comes with another result version', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    must(await consumption.acknowledge(ackInput('a')))
    expect(
      failureOf(await consumption.acknowledge({ ...ackInput('a'), result: version('other') })),
    ).toMatchObject({ kind: 'conflict', operation: operation('ack-a') })
  })

  it('names the operation that holds the acknowledgement when another operation tries to take it', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    must(await consumption.acknowledge(ackInput('a')))
    expect(
      failureOf(await consumption.acknowledge({ ...ackInput('a'), operation: operation('ack-2') })),
    ).toMatchObject({ kind: 'conflict', operation: operation('ack-a') })
  })

  it('does not change the call again for the repeat', async () => {
    const scripted = scriptedProvider()
    const { consumption } = scripted.provider.runtime
    await admitCall(scripted, 'a')
    settleCall(scripted, 'a')
    must(await consumption.acknowledge(ackInput('a')))
    const before = await inspected(scripted, 'a')
    must(await consumption.acknowledge(ackInput('a')))
    expect(await inspected(scripted, 'a')).toEqual(before)
  })
})

describe('an observation that is cut off', () => {
  it('ends as unavailable, lets the call go on, and can be opened again', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const handle = await liveHandle(scripted, 'a')
    const watcher = watch(handle)
    await watcher.next()
    scripted.controller.disconnectObservers(callRef('a'))
    expect(await watcher.next()).toEqual({ kind: 'ended', reason: 'unavailable' })
    expect(await watcher.next()).toBe('finished')

    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('d'),
      firstContent: 'observed',
    })
    settleCall(scripted, 'a')
    const again = await watch(handle).next()
    expect(again).toMatchObject({
      kind: 'snapshot',
      value: { state: { phase: 'settled', settlement: { version: version('a') } } },
    })
  })

  it('reaches only the observations of the named call', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    const cut = watch(await liveHandle(scripted, 'a'))
    const kept = watch(await liveHandle(scripted, 'b'))
    await cut.next()
    await kept.next()
    scripted.controller.disconnectObservers(callRef('a'))
    expect(await cut.next()).toEqual({ kind: 'ended', reason: 'unavailable' })
    scripted.controller.start({
      ...callRef('b'),
      dispatch: dispatch('d'),
      firstContent: 'observed',
    })
    expect(await kept.next()).toMatchObject({ kind: 'changed' })
  })

  it('delivers a change that happens while the consumer has not asked for the next item', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const watcher = watch(await liveHandle(scripted, 'a'))
    await watcher.next()
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('d'),
      firstContent: 'observed',
    })
    settleCall(scripted, 'a')
    expect(await watcher.next()).toMatchObject({
      kind: 'changed',
      value: { state: { phase: 'settled' } },
    })
  })
})
