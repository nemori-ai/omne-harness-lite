import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
  access,
  ackInput,
  admitCall,
  alice,
  bob,
  callRef,
  dispatch,
  instance,
  liveHandle,
  must,
  operation,
  scriptedProvider,
  settleCall,
  watch,
} from './scripted-support.ts'

/** A watcher that has taken its first snapshot and is now waiting for the next item. */
async function waiting(name: string) {
  const scripted = scriptedProvider()
  await admitCall(scripted, name)
  const watcher = watch(await liveHandle(scripted, name))
  await watcher.next()
  return { scripted, watcher }
}

const start = { dispatch: dispatch('d'), firstContent: 'observed' } as const

describe('an observer that is waiting for the next item', () => {
  it('gets one changed item for each change, and none while nothing changes', async () => {
    const { scripted, watcher } = await waiting('a')
    const first = watcher.next()
    scripted.controller.start({ ...callRef('a'), ...start })
    expect(await first).toMatchObject({
      kind: 'changed',
      value: { cursor: '2', state: { phase: 'running' } },
    })
    const second = watcher.next()
    scripted.controller.emit({ ...callRef('a'), blocks: [] })
    expect(await second).toMatchObject({ kind: 'changed', value: { cursor: '3' } })
  })

  it('sees the end of the call', async () => {
    const { scripted, watcher } = await waiting('a')
    const pending = watcher.next()
    settleCall(scripted, 'a')
    expect(await pending).toMatchObject({
      kind: 'changed',
      value: { state: { phase: 'settled' } },
    })
  })

  it('sees a cancel, an acknowledgement and what happens to them afterwards', async () => {
    const { scripted, watcher } = await waiting('a')
    const { calls, consumption } = scripted.provider.runtime
    let pending = watcher.next()
    await calls.cancel({ ...access('a'), operation: operation('cancel-1') })
    expect(await pending).toMatchObject({
      kind: 'changed',
      value: { state: { control: { kind: 'requested', propagation: 'pending' } } },
    })
    pending = watcher.next()
    scripted.controller.advanceControl({
      ...callRef('a'),
      propagation: 'sent',
      upstream: 'stopped',
    })
    expect(await pending).toMatchObject({
      value: { state: { control: { propagation: 'sent', upstream: 'stopped' } } },
    })
    settleCall(scripted, 'a')
    await watcher.next()
    pending = watcher.next()
    must(await consumption.acknowledge(ackInput('a')))
    expect(await pending).toMatchObject({
      value: { state: { custody: { kind: 'acknowledged', cleanup: 'pending' } } },
    })
    pending = watcher.next()
    scripted.controller.setCleanup({ ...callRef('a'), cleanup: 'released', diagnostic: null })
    expect(await pending).toMatchObject({
      value: { state: { custody: { cleanup: 'released' } } },
    })
  })

  async function endsAs(
    reason: string,
    act: (scripted: ReturnType<typeof scriptedProvider>) => void,
  ) {
    const { scripted, watcher } = await waiting('a')
    const pending = watcher.next()
    act(scripted)
    expect(await pending).toEqual({ kind: 'ended', reason })
    expect(await watcher.next()).toBe('finished')
  }

  it('ends as unavailable when the instance leaves', () =>
    endsAs('unavailable', s => s.controller.withdrawInstance(callRef('a'))))
  it('ends as stale-instance when another instance takes over', () =>
    endsAs('stale-instance', s =>
      s.controller.replaceInstance({ ...callRef('a'), instance: instance('two') }),
    ))
  it('ends as unavailable when the observers are cut off', () =>
    endsAs('unavailable', s => s.controller.disconnectObservers(callRef('a'))))
  it('ends as denied when the principal loses access', () =>
    endsAs('denied', s =>
      s.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: 'all' }),
    ))

  it('ends as observer-closed when its signal aborts', async () => {
    const { watcher } = await waiting('a')
    const pending = watcher.next()
    watcher.close()
    expect(await pending).toEqual({ kind: 'ended', reason: 'observer-closed' })
    expect(await watcher.next()).toBe('finished')
  })

  it('ends as observer-closed when the signal was aborted before the next item was asked for', async () => {
    const { scripted, watcher } = await waiting('a')
    watcher.close()
    scripted.controller.start({ ...callRef('a'), ...start })
    expect(await watcher.next()).toEqual({ kind: 'ended', reason: 'observer-closed' })
  })

  it('leaves no listener on the signal after it was woken, and one while it waits', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const abort = new AbortController()
    const iterator = (await liveHandle(scripted, 'a'))
      .observe({ principal: alice, tenant: access('a').tenant, signal: abort.signal })
      [Symbol.asyncIterator]()
    await iterator.next()
    const pending = iterator.next()
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(1)
    scripted.controller.start({ ...callRef('a'), ...start })
    await pending
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0)
    const again = iterator.next()
    abort.abort()
    await again
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0)
  })

  it('does not wake the observers of another call', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    const watcher = watch(await liveHandle(scripted, 'a'))
    await watcher.next()
    const pending = watcher.next()
    scripted.controller.start({ ...callRef('b'), ...start })
    scripted.controller.start({
      ...callRef('a'),
      dispatch: dispatch('other'),
      firstContent: 'none-proven',
    })
    expect(await pending).toMatchObject({
      value: { cursor: '2', state: { dispatch: dispatch('other') } },
    })
  })

  it('counts the observations that are open, and no longer counts one that ended or was closed', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const handle = await liveHandle(scripted, 'a')
    const open = () => scripted.controller.openObservations(callRef('a'))
    expect(open()).toBe(0)
    const one = watch(handle, alice)
    const two = watch(handle, bob)
    const three = watch(handle, alice)
    for (const watcher of [one, two, three]) await watcher.next()
    expect(open()).toBe(3)
    const closing = one.next()
    one.close()
    await closing
    expect(open()).toBe(2)
    const ending = two.next()
    scripted.controller.disconnectObservers(callRef('a'))
    await ending
    await three.next()
    expect(open()).toBe(0)
  })

  it('releases an observation that the consumer stops reading before it ends', async () => {
    const { scripted, watcher } = await waiting('a')
    expect(scripted.controller.openObservations(callRef('a'))).toBe(1)
    await watcher.stop()
    expect(scripted.controller.openObservations(callRef('a'))).toBe(0)
  })

  it('releases an observation at the moment it ends, also for a consumer that stops reading there', async () => {
    const { scripted, watcher } = await waiting('a')
    const pending = watcher.next()
    scripted.controller.disconnectObservers(callRef('a'))
    expect(await pending).toEqual({ kind: 'ended', reason: 'unavailable' })
    expect(scripted.controller.openObservations(callRef('a'))).toBe(0)
  })

  it('does not count an observation that was refused', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    scripted.controller.revokeAccess({
      ...callRef('a'),
      principal: alice,
      actions: ['observe'],
    })
    await watch(await liveHandle(scripted, 'a')).next()
    expect(scripted.controller.openObservations(callRef('a'))).toBe(0)
  })

  it('serves two observers of one call independently', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const handle = await liveHandle(scripted, 'a')
    const one = watch(handle, alice)
    const two = watch(handle, bob)
    await one.next()
    await two.next()
    const pendingOne = one.next()
    one.close()
    expect(await pendingOne).toEqual({ kind: 'ended', reason: 'observer-closed' })
    const pendingTwo = two.next()
    scripted.controller.start({ ...callRef('a'), ...start })
    expect(await pendingTwo).toMatchObject({ kind: 'changed' })
  })
})
