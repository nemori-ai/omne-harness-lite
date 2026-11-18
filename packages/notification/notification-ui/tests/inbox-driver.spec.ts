import { readTenantText } from '@omne-harness/public-contract'
import { describe, expect, it, vi } from 'vitest'
import { InboxDriver } from '../src/model/inbox-driver.ts'
import { InboxHub } from '../src/model/inbox-hub.ts'
import { keyOf } from '../src/model/inbox-machine.ts'
import { done, entry, page, view } from './fixtures/entries.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const TENANT_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const OTHER_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'
const tenant = readTenantText(TENANT_TEXT)!
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const e1 = entry('e1', 1)
const target = { tenant, recipient: { kind: 'person' } }

function manual() {
  const due: { delayMs: number; run: () => void; cancelled: boolean }[] = []
  const schedule = (delayMs: number, run: () => void) => {
    const item = { delayMs, run, cancelled: false }
    due.push(item)
    return () => {
      item.cancelled = true
    }
  }
  return { due, schedule }
}

/** A driver that is watched, with its first frame taken and its list read. */
async function ready(entries = [e1]) {
  const fake = createFakeClient()
  const timers = manual()
  const driver = new InboxDriver({ client: fake.client, tenant, schedule: timers.schedule })
  const release = driver.retain()
  fake.observations[0]!.frame()
  const call = await fake.next('list-inbox')
  call.answer(page(entries))
  await tick()
  return { fake, timers, driver, release }
}

describe('the driver of one inbox', () => {
  it('observes the tenant while something holds it, and reads the person’s inbox when told', async () => {
    const { fake, driver, release } = await ready()
    expect(fake.observations).toHaveLength(1)
    expect(fake.observations[0]!.open).toEqual({ tenant })
    expect(fake.calls[0]!.body).toEqual({
      ...target,
      filter: 'unresolved',
      after: null,
      limit: 100,
    })
    expect(driver.getState().entries).toEqual([e1])
    const again = driver.retain()
    expect(fake.observations).toHaveLength(1)
    release()
    release()
    expect(fake.observations[0]!.signal.aborted).toBe(false)
    again()
    expect(fake.observations[0]!.signal.aborted).toBe(true)
    await tick()
    expect(driver.getState().live).toEqual({ kind: 'off' })
  })

  it('tells its listeners when the state changed, and only then', async () => {
    const { driver } = await ready()
    let told = 0
    const stop = driver.subscribe(() => (told += 1))
    driver.close()
    expect(told).toBe(0)
    driver.filter('all')
    expect(told).toBe(1)
    stop()
    driver.refresh()
    expect(told).toBe(1)
  })

  it('reads the next page after the sequence the server named', async () => {
    const { fake, driver } = await ready()
    driver.filter('all')
    const first = await fake.next('list-inbox')
    expect(first.body).toMatchObject({ filter: 'all', after: null })
    first.answer(page([e1], 1))
    const second = await fake.next('list-inbox')
    expect(second.body).toMatchObject({ filter: 'all', after: 1 })
  })

  it('marks by the source and event of the entry and takes the marks the server answered', async () => {
    const { fake, driver } = await ready()
    driver.mark(keyOf(e1), 'done')
    const call = await fake.next('mark')
    expect(call.body).toEqual({ ...target, source: 'demo.things', event: 'e1', operation: 'done' })
    call.answer({ outcome: 'succeeded', body: done })
    await tick()
    expect(driver.getState().entries[0]!.marks).toEqual(done)
  })

  it('opens one notification: reads it in full and marks it seen', async () => {
    const { fake, driver } = await ready()
    driver.open(keyOf(e1))
    const read = await fake.next('read-notification')
    expect(read.body).toEqual({ ...target, source: 'demo.things', event: 'e1' })
    expect((await fake.next('mark')).body).toMatchObject({ operation: 'seen' })
    read.answer({ outcome: 'succeeded', body: view(e1, 'The body') })
    await tick()
    expect(driver.getState().opened?.view).toMatchObject({ body: 'The body' })
  })

  it('a call that throws is a call that was not sent: nothing is shown as done', async () => {
    const { fake, driver } = await ready()
    driver.mark(keyOf(e1), 'done')
    ;(await fake.next('mark')).fail(new Error('network'))
    await tick()
    expect(driver.getState().notices).toEqual({ [keyOf(e1)]: 'unavailable' })
    expect(driver.getState().entries[0]!.marks.resolved).toBeNull()
    driver.refresh()
    ;(await fake.next('list-inbox')).fail(new Error('network'))
    await tick()
    expect(driver.getState()).toMatchObject({
      read: { kind: 'failed', reason: 'unavailable' },
      entries: [e1],
    })
  })

  it('reconnects after the wait when the observation ended or broke, each wait longer than the last', async () => {
    const { fake, timers, driver } = await ready()
    fake.observations[0]!.end({ kind: 'unavailable' })
    await tick()
    expect(driver.getState().live).toEqual({ kind: 'retrying', attempt: 1 })
    expect(timers.due.map(item => item.delayMs)).toEqual([200])
    timers.due[0]!.run()
    expect(fake.observations).toHaveLength(2)
    fake.observations[1]!.fail()
    await tick()
    expect(timers.due.map(item => item.delayMs)).toEqual([200, 400])
    timers.due[1]!.run()
    fake.observations[2]!.frame()
    await tick()
    expect(driver.getState().live).toEqual({ kind: 'on' })
    expect((await fake.next('list-inbox')).body).toMatchObject({ after: null })
  })

  it('does not reconnect when it was refused, and shows nothing', async () => {
    const { fake, timers, driver } = await ready()
    fake.observations[0]!.end({ kind: 'ended', reason: 'denied' })
    await tick()
    expect(driver.getState()).toMatchObject({ live: { kind: 'denied' }, entries: [] })
    expect(timers.due).toEqual([])
  })

  it('once disposed it stops observing, cancels the reconnect, and takes no more answers', async () => {
    const { fake, timers, driver } = await ready()
    fake.observations[0]!.end({ kind: 'unavailable' })
    await tick()
    driver.mark(keyOf(e1), 'done')
    const call = await fake.next('mark')
    const before = driver.getState()
    driver.dispose()
    expect(timers.due[0]!.cancelled).toBe(true)
    call.answer({ outcome: 'succeeded', body: done })
    await tick()
    driver.refresh()
    expect(driver.getState()).toBe(before)
    expect(fake.calls.filter(item => item.operation === 'list-inbox')).toHaveLength(1)
  })
})

describe('the driver on real timers', () => {
  it('cancels the reconnect it scheduled when it is disposed', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeClient()
      const driver = new InboxDriver({ client: fake.client, tenant })
      driver.retain()
      fake.observations[0]!.end({ kind: 'unavailable' })
      await vi.advanceTimersByTimeAsync(0)
      expect(driver.getState().live).toEqual({ kind: 'retrying', attempt: 1 })
      expect(vi.getTimerCount()).toBe(1)
      driver.dispose()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(fake.observations).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the reconnect when nobody watches any more, and watches again from a new observation', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeClient()
      const driver = new InboxDriver({ client: fake.client, tenant })
      const release = driver.retain()
      fake.observations[0]!.end({ kind: 'unavailable' })
      await vi.advanceTimersByTimeAsync(0)
      release()
      expect(vi.getTimerCount()).toBe(0)
      driver.retain()
      expect(fake.observations).toHaveLength(2)
      expect(fake.observations[1]!.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reconnects after the wait when nothing stops it', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeClient()
      const driver = new InboxDriver({ client: fake.client, tenant })
      driver.retain()
      fake.observations[0]!.end({ kind: 'unavailable' })
      await vi.advanceTimersByTimeAsync(199)
      expect(fake.observations).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fake.observations).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a driver nobody ever watched', () => {
  it('is disposed without having anything to stop', () => {
    const fake = createFakeClient()
    const driver = new InboxDriver({ client: fake.client, tenant })
    expect(() => driver.dispose()).not.toThrow()
    expect(fake.observations).toEqual([])
  })
})

describe('the hub', () => {
  it('gives one driver per tenant and disposes them all', async () => {
    const fake = createFakeClient()
    const hub = new InboxHub({ client: fake.client })
    const mine = hub.driver(tenant)
    expect(hub.driver(readTenantText(TENANT_TEXT)!)).toBe(mine)
    const theirs = hub.driver(readTenantText(OTHER_TEXT)!)
    expect(theirs).not.toBe(mine)
    mine.retain()
    theirs.retain()
    expect(fake.observations.map(item => item.open)).toEqual([
      { tenant },
      { tenant: readTenantText(OTHER_TEXT) },
    ])
    hub.dispose()
    expect(fake.observations.map(item => item.signal.aborted)).toEqual([true, true])
    expect(hub.driver(tenant)).not.toBe(mine)
  })
})
