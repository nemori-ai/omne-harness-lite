import { describe, expect, it } from 'vitest'
import { fakeChannel } from '@omne-harness/notification/testing'
import type { StandingItem } from '@omne-harness/notification-contract'
import { agent, declared, MINUTE, person, request, world } from './world.ts'

/** One minute into a beat slot: nothing accepted in a test is due for a beat before 06:30. */
function strongWorld(...types: Parameters<typeof world>) {
  const w = world(
    ...(types.length === 0 ? [declared({ defaults: { person: 'strong', agent: 'off' } })] : types),
  )
  w.clock.set('2026-11-18T06:01:00.000Z')
  return w
}
const members = (deliveries: readonly { unit: { members: readonly { eventId: string }[] } }[]) =>
  deliveries.map(delivery => delivery.unit.members.map(member => member.eventId))
const personDestinations = async (w: ReturnType<typeof world>) => {
  const listed = await w.destinations.list(w.ctx, person)
  if (listed.kind !== 'done') throw new Error(listed.kind)
  return listed.value
}

describe('a strong notification is pushed at once', () => {
  it('in full, to the builtin destination, with the unit identity', async () => {
    const w = strongWorld()
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
    expect(w.inApp.deliveries[0]).toMatchObject({
      recipient: person,
      address: '',
      unit: {
        kind: 'strong',
        destination: { recipient: person, id: 'default' },
        body: { kind: 'single', entry: { title: 'Title e1', body: 'Body e1', external: false } },
      },
    })
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
  })

  it('goes to an entrusted agent at its reference', async () => {
    const w = strongWorld(declared({ defaults: { person: 'off', agent: 'off' } }))
    await w.sending.send(w.ctx, request('e1', { named: [agent('s-1')] }))
    await w.subscriptions.set(w.ctx, {
      recipient: agent('s-1'),
      source: 'demo.things',
      type: 'changed',
      scope: { kind: 'all' },
      level: 'strong',
      note: 'look at it',
      term: { kind: 'standing' },
    })
    await w.sending.send(w.ctx, request('e2'))
    await w.advance()
    expect(w.session.deliveries).toMatchObject([
      {
        recipient: agent('s-1'),
        address: 's-1',
        unit: { body: { entry: { cause: { kind: 'subscription', note: 'look at it' } } } },
      },
    ])
    expect(members(w.session.deliveries)).toEqual([['e2']])
  })

  it('is not pushed when it is weak, quiet, or resolved before the unit forms', async () => {
    const w = strongWorld()
    await w.subscriptions.set(w.ctx, {
      recipient: person,
      source: 'demo.things',
      type: 'changed',
      scope: { kind: 'subject', equals: 'weak/one' },
      level: 'weak',
      note: null,
      term: { kind: 'standing' },
    })
    await w.sending.send(w.ctx, request('weak', { subject: 'weak/one' }))
    await w.sending.send(w.ctx, request('old', { replaceKey: 'k' }))
    await w.inbox.mark(w.ctx, w.ref('old'), 'done')
    await w.sending.send(w.ctx, request('quiet', { replaceKey: 'k' }))
    await w.advance()
    expect(w.inApp.deliveries).toEqual([])
  })

  it('is pushed when it replaces another and the send asks to remind again', async () => {
    const w = strongWorld()
    await w.sending.send(w.ctx, request('old', { replaceKey: 'k' }))
    await w.advance()
    await w.sending.send(w.ctx, request('new', { replaceKey: 'k', renotify: true }))
    await w.advance()
    expect(members(w.inApp.deliveries)).toEqual([['old'], ['new']])
  })

  it('becomes a digest of the earliest few when several wait for the interval', async () => {
    const w = strongWorld(declared({ defaults: { person: 'off', agent: 'strong' } }))
    w.store.facts(w.ctx.tenant).recipients.set('agent:a', agent('a'))
    await w.sending.send(w.ctx, request('first', { named: [agent('a')] }))
    await w.advance()
    for (const id of ['e1', 'e2', 'e3', 'e4']) await w.sending.send(w.ctx, request(id))
    await w.inbox.mark(w.ctx, w.ref('e2', agent('a')), 'done')
    await w.advance()
    expect(w.hints.wakes).toContainEqual({ tenant: w.ctx.tenant, at: '2026-11-18T06:11:00.000Z' })
    w.clock.set('2026-11-18T06:11:00.000Z')
    await w.advance()
    expect(w.session.deliveries[1]?.unit.body).toMatchObject({
      kind: 'digest',
      count: 3,
      listed: [{ title: 'Title e1' }, { title: 'Title e3' }, { title: 'Title e4' }],
    })
  })
})

describe('one notification, several destinations', () => {
  it('is one notification with a unit and a result per destination', async () => {
    const w = strongWorld()
    const mail = fakeChannel('mail')
    w.channels.register(mail)
    await w.destinations.add(w.ctx, {
      recipient: person,
      channel: 'mail',
      address: 'me@x',
      minLevel: 'strong',
    })
    mail.answer({ kind: 'failed', reason: 'bounced', retryable: false })
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    expect(await w.list()).toHaveLength(1)
    expect(members(w.inApp.deliveries)).toEqual([['e1']])
    expect(members(mail.deliveries)).toEqual([['e1']])
    expect(mail.deliveries[0]?.unit.id).not.toBe(w.inApp.deliveries[0]?.unit.id)
    expect((await personDestinations(w)).map(entry => [entry.channel, entry.blocked])).toEqual([
      ['in-app', false],
      ['mail', true],
    ])
  })

  it('does not push to a new destination what was in the inbox before it was added', async () => {
    const w = strongWorld()
    await w.sending.send(w.ctx, request('before'))
    const mail = fakeChannel('mail')
    w.channels.register(mail)
    await w.destinations.add(w.ctx, {
      recipient: person,
      channel: 'mail',
      address: 'me@x',
      minLevel: 'strong',
    })
    await w.sending.send(w.ctx, request('after'))
    await w.advance()
    expect(members(mail.deliveries)).toEqual([['after']])
    expect(members(w.inApp.deliveries)).toEqual([['before', 'after']])
  })

  it('cuts the text for a channel that leaves the system, and forms nothing while disclosure is unknown', async () => {
    const w = strongWorld()
    const mail = fakeChannel('mail', { leavesSystem: true })
    w.channels.register(mail)
    await w.destinations.add(w.ctx, {
      recipient: person,
      channel: 'mail',
      address: 'me@x',
      minLevel: 'strong',
    })
    for (const unknown of ['unavailable', 'throw'] as const) {
      w.authority.disclose(unknown)
      await w.sending.send(w.ctx, request(`held-${unknown}`))
      await w.advance()
      expect(mail.deliveries).toEqual([])
    }
    w.authority.disclose({ kind: 'title-only' })
    await w.inbox.mark(w.ctx, w.ref('held-throw'), 'done')
    await w.advance()
    expect(mail.deliveries).toHaveLength(1)
    expect(mail.deliveries[0]?.unit.body).toMatchObject({
      kind: 'single',
      entry: { title: 'Title held-unavailable', body: '', locator: null },
    })
    expect(w.inApp.deliveries[0]?.unit.body).toMatchObject({
      entry: { body: 'Body held-unavailable' },
    })
  })

  it('leaves the notification in the inbox while a channel is absent or the destination is disabled', async () => {
    const w = strongWorld()
    w.removeInApp()
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    expect(await w.list(person, 'unresolved')).toHaveLength(1)
    expect((await personDestinations(w))[0]?.state).toBe('channel-absent')
    w.channels.register(w.inApp)
    await w.destinations.change(w.ctx, { recipient: person, id: 'default' }, { enabled: false })
    await w.advance()
    expect(w.inApp.deliveries).toEqual([])
    await w.destinations.change(w.ctx, { recipient: person, id: 'default' }, { enabled: true })
    await w.advance()
    expect(members(w.inApp.deliveries)).toEqual([['e1']])
  })
})

describe('a delivery that does not succeed', () => {
  it.each([
    ['a retryable failure', { kind: 'failed', reason: 'busy', retryable: true }],
    ['an unknown result', { kind: 'unknown' }],
    ['a throw', 'throw'],
    ['a timeout', 'hang'],
    ['an answer of no known kind', { kind: 'maybe' }],
  ] as const)('is tried again after the backoff with the same unit: %s', async (_case, answer) => {
    const w = strongWorld()
    w.inApp.answer(answer as never)
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    expect(w.hints.wakes).toContainEqual({ tenant: w.ctx.tenant, at: '2026-11-18T06:02:00.000Z' })
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
    w.clock.advance(MINUTE)
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(2)
    expect(w.inApp.deliveries[1]?.unit).toEqual(w.inApp.deliveries[0]?.unit)
    expect((await personDestinations(w))[0]?.blocked).toBe(false)
  })

  it('stops at the limit, keeps the notification, and reports the destination as blocked', async () => {
    const w = strongWorld()
    w.inApp.answer({ kind: 'unknown' }, { kind: 'unknown' }, { kind: 'unknown' })
    await w.sending.send(w.ctx, request('e1'))
    for (let turn = 0; turn < 5; turn += 1) {
      await w.advance()
      w.clock.advance(MINUTE)
    }
    expect(w.inApp.deliveries).toHaveLength(3)
    expect((await personDestinations(w))[0]?.blocked).toBe(true)
    expect(await w.list(person, 'unresolved')).toHaveLength(1)
    await w.sending.send(w.ctx, request('e2'))
    await w.advance()
    expect(members(w.inApp.deliveries).at(-1)).toEqual(['e2'])
    expect((await personDestinations(w))[0]?.blocked).toBe(false)
  })

  it('stops at once when the channel says it can never deliver', async () => {
    const w = strongWorld()
    w.inApp.answer({ kind: 'failed', reason: 'gone', retryable: false })
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    w.clock.advance(MINUTE)
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
    expect((await personDestinations(w))[0]?.blocked).toBe(true)
  })

  it('delivers the same unit again when its result could not be recorded', async () => {
    const w = strongWorld()
    await w.sending.send(w.ctx, request('e1'))
    const record = w.store.recordDelivery
    let lost = true
    const flaky = {
      ...w.store,
      recordDelivery: async (...args: Parameters<typeof record>) => {
        if (!lost) return record(...args)
        lost = false
        return { kind: 'rolled-back' } as const
      },
    }
    Object.assign(w.store, { recordDelivery: flaky.recordDelivery })
    await w.advance()
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(2)
    expect(w.inApp.deliveries[1]?.unit).toEqual(w.inApp.deliveries[0]?.unit)
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(2)
  })

  it('settles the pending units of a destination that was removed', async () => {
    const w = strongWorld()
    const mail = fakeChannel('mail')
    w.channels.register(mail)
    const added = await w.destinations.add(w.ctx, {
      recipient: person,
      channel: 'mail',
      address: 'me@x',
      minLevel: 'strong',
    })
    if (added.kind !== 'done') throw new Error(added.kind)
    mail.answer({ kind: 'unknown' })
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    await w.destinations.remove(w.ctx, { recipient: person, id: added.value.id })
    w.clock.advance(MINUTE)
    await w.advance()
    await w.advance()
    expect(mail.deliveries).toHaveLength(1)
    const units = [...w.store.facts(w.ctx.tenant).units.values()]
    expect(units.map(unit => unit.state).sort()).toEqual(['delivered', 'stopped'])
  })

  it('does nothing when the delivery state cannot be read', async () => {
    const w = strongWorld()
    await w.sending.send(w.ctx, request('e1'))
    w.store.fail('read-unavailable')
    await w.advance()
    expect(w.inApp.deliveries).toEqual([])
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
  })

  it('forms one unit when two wake-ups overlap', async () => {
    const w = strongWorld()
    await w.sending.send(w.ctx, request('e1'))
    await Promise.all([w.advance(), w.advance(), w.advance()])
    expect(w.inApp.deliveries).toHaveLength(1)
  })
})

describe('the beat', () => {
  it('reminds a person of what it has not seen, once per slot, and asks to be woken at the next', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    await w.sending.send(w.ctx, request('e2'))
    await w.inbox.mark(w.ctx, w.ref('e2'), 'seen')
    w.clock.set('2026-11-18T06:30:00.000Z')
    await w.advance()
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
    expect(w.inApp.deliveries[0]?.unit).toMatchObject({
      kind: 'beat',
      body: { kind: 'digest', count: 1, listed: [{ title: 'Title e1' }], standingOpen: 0 },
    })
    expect(w.hints.wakes).toContainEqual({ tenant: w.ctx.tenant, at: '2026-11-18T07:00:00.000Z' })
  })

  it('reminds an entrusted agent of what is not resolved, seen or not', async () => {
    const w = world(declared({ defaults: { person: 'off', agent: 'weak' } }))
    w.store.facts(w.ctx.tenant).recipients.set('agent:a', agent('a'))
    await w.sending.send(w.ctx, request('e1', { named: [agent('a')] }))
    await w.sending.send(w.ctx, request('e2'))
    await w.inbox.mark(w.ctx, w.ref('e1', agent('a')), 'seen')
    await w.inbox.mark(w.ctx, w.ref('e2', agent('a')), 'done')
    w.clock.set('2026-11-18T06:30:00.000Z')
    await w.advance()
    expect(members(w.session.deliveries)).toEqual([['e1']])
  })

  it('does not pull a later arrival into the slot that is already running', async () => {
    const w = world()
    w.clock.set('2026-11-18T06:31:00.000Z')
    await w.sending.send(w.ctx, request('late'))
    await w.advance()
    expect(w.inApp.deliveries).toEqual([])
    w.clock.set('2026-11-18T07:00:00.000Z')
    await w.advance()
    expect(members(w.inApp.deliveries)).toEqual([['late']])
  })

  it('follows the beat the owner set, and stops when it is off or the destination takes strong only', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    await w.subscriptions.setBeat(w.ctx, person, { kind: 'off' })
    w.clock.set('2026-11-18T06:30:00.000Z')
    await w.advance()
    expect(w.inApp.deliveries).toEqual([])
    await w.subscriptions.setBeat(w.ctx, person, { kind: 'every', minutes: 10 })
    await w.destinations.change(w.ctx, { recipient: person, id: 'default' }, { minLevel: 'strong' })
    await w.advance()
    expect(w.inApp.deliveries).toEqual([])
    await w.destinations.change(w.ctx, { recipient: person, id: 'default' }, { minLevel: 'weak' })
    await w.advance()
    expect(w.inApp.deliveries).toHaveLength(1)
    expect(w.hints.wakes.at(-1)).toEqual({ tenant: w.ctx.tenant, at: '2026-11-18T06:40:00.000Z' })
  })
})

describe('standing items', () => {
  const blocked = declared({
    name: 'blocked' as never,
    kind: { kind: 'standing', binding: 'demo.blocked' },
    defaults: { person: 'strong', agent: 'off' },
  })
  const item = (
    id: string,
    type = 'blocked',
    since = '2026-11-18T06:00:30.000Z',
  ): StandingItem => ({
    id,
    source: 'demo.things' as never,
    type: type as never,
    subject: null,
    title: `Open ${id}`,
    locator: null,
    since: since as never,
  })

  it('reminds a recipient whose level is strong once per item', async () => {
    const w = strongWorld(declared(), blocked)
    w.standing.set({ kind: 'ok', items: [item('i1')] })
    await w.advance()
    await w.advance()
    w.standing.set({ kind: 'ok', items: [item('i1'), item('i2')] })
    await w.advance()
    expect(w.inApp.deliveries.map(delivery => delivery.unit.body)).toEqual([
      { kind: 'standing', item: item('i1') },
      { kind: 'standing', item: item('i2') },
    ])
    expect(await w.list()).toEqual([])
  })

  it.each([
    ['refused', { kind: 'refused' }],
    ['missing', { kind: 'missing' }],
    ['unknown', { kind: 'unknown' }],
    ['a failing reader', 'throw'],
  ] as const)(
    'does not remind and does not forget what it reminded of when the read is %s',
    async (_case, read) => {
      const w = strongWorld(declared(), blocked)
      w.standing.set({ kind: 'ok', items: [item('i1')] })
      await w.advance()
      w.standing.set(read)
      await w.advance()
      w.standing.set({ kind: 'ok', items: [item('i1'), item('i2')] })
      await w.advance()
      expect(w.inApp.deliveries.map(delivery => delivery.unit.body.kind)).toEqual([
        'standing',
        'standing',
      ])
      expect(w.inApp.deliveries[1]?.unit.body).toMatchObject({ item: { id: 'i2' } })
    },
  )

  it('counts open items in the beat, says so when they could not be read, and skips items of unknown types', async () => {
    const weak = { ...blocked, defaults: { person: 'weak', agent: 'off' } } as typeof blocked
    const w = world(declared(), weak)
    const late = item('i5', 'blocked', '2026-11-18T06:30:00.001Z')
    const items = [item('i1'), item('i2'), item('i3', 'changed'), item('i4', 'nope'), late]
    w.standing.set({ kind: 'ok', items })
    w.clock.set('2026-11-18T06:30:00.000Z')
    await w.advance()
    expect(w.inApp.deliveries.map(delivery => delivery.unit.body)).toEqual([
      { kind: 'digest', count: 0, listed: [], standingOpen: 2 },
    ])
    await w.sending.send(w.ctx, request('e1'))
    w.standing.set({ kind: 'unknown' })
    w.clock.set('2026-11-18T07:00:00.000Z')
    await w.advance()
    expect(w.inApp.deliveries[1]?.unit.body).toMatchObject({ count: 1, standingOpen: null })
  })
})
