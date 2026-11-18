import { describe, expect, it } from 'vitest'
import { context, fakeChannel } from '@omne-harness/notification/testing'
import {
  CHANNEL_WITHDRAWN,
  createChannelRegistry,
  createDestinations,
  NotificationRegistrationError,
} from '@omne-harness/notification'
import { agent, defaults, person, request, world } from './world.ts'

const unavailable = { kind: 'basis-unavailable' }
const refused = (reason: string) => ({ kind: 'refused', reason })
const mailTo = (address: string, minLevel: 'strong' | 'weak' = 'strong') => ({
  recipient: person,
  channel: 'mail',
  address,
  minLevel,
})

function withMail() {
  const w = world()
  const mail = fakeChannel('mail')
  const removeMail = w.channels.register(mail)
  return { ...w, mail, removeMail }
}

describe('the destinations of a recipient', () => {
  it('start with the builtin one, before anything was written', async () => {
    const w = world()
    expect(await w.destinations.list(w.ctx, person)).toEqual({
      kind: 'done',
      recalled: false,
      value: [
        {
          recipient: person,
          id: 'default',
          channel: 'in-app',
          address: '',
          minLevel: 'weak',
          builtin: true,
          blockedSince: null,
          state: 'enabled',
        },
      ],
    })
    expect(await w.destinations.list(w.ctx, agent('s-1'))).toMatchObject({
      value: [{ channel: 'session', address: 's-1', builtin: true }],
    })
    expect(w.store.commits()).toBe(0)
  })

  it('gain one by add, once per channel and address', async () => {
    const w = withMail()
    const added = await w.destinations.add(w.ctx, mailTo('me@x'))
    expect(added).toMatchObject({
      kind: 'done',
      recalled: false,
      value: {
        channel: 'mail',
        address: 'me@x',
        minLevel: 'strong',
        builtin: false,
        state: 'enabled',
      },
    })
    expect(await w.destinations.add(w.ctx, mailTo('me@x', 'weak'))).toMatchObject({
      kind: 'done',
      recalled: true,
      value: { minLevel: 'strong' },
    })
    await w.destinations.add(w.ctx, mailTo('other@x'))
    const listed = await w.destinations.list(w.ctx, person)
    expect(listed).toMatchObject({
      value: [{ id: 'default' }, { address: 'me@x' }, { address: 'other@x' }],
    })
  })

  it('change level and enablement, and say when nothing changed', async () => {
    const w = withMail()
    const added = await w.destinations.add(w.ctx, mailTo('me@x'))
    if (added.kind !== 'done') throw new Error(added.kind)
    const ref = { recipient: person, id: added.value.id }
    expect(
      await w.destinations.change(w.ctx, ref, { enabled: false, minLevel: 'weak' }),
    ).toMatchObject({
      recalled: false,
      value: { state: 'disabled', minLevel: 'weak' },
    })
    const sparse = { enabled: true, minLevel: undefined } as never
    expect(await w.destinations.change(w.ctx, ref, sparse)).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { state: 'enabled', minLevel: 'weak' },
    })
    await w.destinations.change(w.ctx, ref, { enabled: false })
    expect(await w.destinations.change(w.ctx, ref, { enabled: false })).toMatchObject({
      recalled: true,
    })
    expect(
      await w.destinations.change(w.ctx, { recipient: person, id: 'nope' }, { enabled: false }),
    ).toEqual(refused('not-found'))
    expect(
      await w.destinations.change(
        w.ctx,
        { recipient: person, id: 'default' },
        { minLevel: 'strong' },
      ),
    ).toMatchObject({
      value: { builtin: true, minLevel: 'strong' },
    })
  })

  it('lose one by remove, but never the builtin one', async () => {
    const w = withMail()
    const added = await w.destinations.add(w.ctx, mailTo('me@x'))
    if (added.kind !== 'done') throw new Error(added.kind)
    const ref = { recipient: person, id: added.value.id }
    expect(await w.destinations.remove(w.ctx, { recipient: person, id: 'default' })).toEqual(
      refused('builtin'),
    )
    expect(await w.destinations.remove(w.ctx, ref)).toEqual({
      kind: 'done',
      recalled: false,
      value: null,
    })
    expect(await w.destinations.remove(w.ctx, ref)).toEqual({
      kind: 'done',
      recalled: true,
      value: null,
    })
    expect(await w.destinations.list(w.ctx, person)).toMatchObject({ value: [{ id: 'default' }] })
  })

  it('show a destination whose channel is gone as channel-absent, and keep it', async () => {
    const w = withMail()
    await w.destinations.add(w.ctx, mailTo('me@x'))
    w.removeMail()
    expect(await w.destinations.list(w.ctx, person)).toMatchObject({
      value: [{ state: 'enabled' }, { channel: 'mail', state: 'channel-absent' }],
    })
  })

  it('tell two channels with the same address apart, and start unblocked', async () => {
    const w = withMail()
    w.channels.register(fakeChannel('pager'))
    await w.destinations.add(w.ctx, mailTo('same'))
    const pager = await w.destinations.add(w.ctx, { ...mailTo('same'), channel: 'pager' })
    expect(pager).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { channel: 'pager', blockedSince: null },
    })
    expect(await w.destinations.list(w.ctx, person)).toMatchObject({
      value: [{}, { channel: 'mail' }, { channel: 'pager' }],
    })
  })

  it('are none for a kind of recipient that starts without a destination', async () => {
    const w = withMail()
    const withoutAgentDefault = createDestinations({
      authority: w.authority,
      store: w.store,
      channels: w.channels,
      defaults: { ...defaults, agent: null },
    })
    expect(await withoutAgentDefault.list(w.ctx, agent('a'))).toEqual({
      kind: 'done',
      recalled: false,
      value: [],
    })
  })

  it('are kept apart between tenants', async () => {
    const w = withMail()
    await w.destinations.add(w.ctx, mailTo('me@x'))
    const other = await w.destinations.list(context('t2'), person)
    expect(other).toMatchObject({ value: [{ id: 'default' }] })
    expect(other.kind === 'done' && other.value).toHaveLength(1)
  })
})

describe('what blocks managing destinations', () => {
  it('refuses an address the channel does not accept and waits for a channel that is not registered', async () => {
    const w = withMail()
    expect(await w.destinations.add(w.ctx, mailTo('bad'))).toEqual(refused('invalid-address'))
    expect(await w.destinations.add(w.ctx, { ...mailTo('me@x'), channel: 'pager' })).toEqual(
      unavailable,
    )
    const accepts = () => {
      throw new Error('rule failed')
    }
    w.channels.register({ ...fakeChannel('pager'), address: { hint: '', accepts } })
    expect(await w.destinations.add(w.ctx, { ...mailTo('me@x'), channel: 'pager' })).toEqual(
      unavailable,
    )
  })

  it('lets only the owner manage, while an agent may still list its own', async () => {
    const w = withMail()
    const self = w.as('a')
    expect(await w.destinations.add(self, { ...mailTo('me@x'), recipient: agent('a') })).toEqual(
      refused('not-permitted'),
    )
    expect(
      await w.destinations.change(
        self,
        { recipient: agent('a'), id: 'default' },
        { enabled: false },
      ),
    ).toEqual(refused('not-permitted'))
    expect(await w.destinations.remove(self, { recipient: agent('a'), id: 'default' })).toEqual(
      refused('not-permitted'),
    )
    expect(await w.destinations.list(self, agent('a'))).toMatchObject({ kind: 'done' })
    expect(w.store.commits()).toBe(0)
  })

  it('maps the authority and the store', async () => {
    const w = withMail()
    w.authority.answer(() => 'denied')
    expect(await w.destinations.add(w.ctx, mailTo('me@x'))).toEqual(refused('not-permitted'))
    expect(await w.destinations.list(w.ctx, person)).toEqual(refused('not-permitted'))
    w.authority.answer(() => 'unavailable')
    expect(await w.destinations.remove(w.ctx, { recipient: person, id: 'x' })).toEqual(unavailable)
    w.authority.answer(() => 'allowed')
    w.store.fail('read-unavailable')
    expect(await w.destinations.list(w.ctx, person)).toEqual(unavailable)
    w.store.fail('rolled-back')
    expect(await w.destinations.add(w.ctx, mailTo('me@x'))).toEqual(unavailable)
    w.store.fail('unknown-applied')
    expect(await w.destinations.add(w.ctx, mailTo('me@x'))).toEqual({ kind: 'unknown' })
    expect(await w.destinations.add(w.ctx, mailTo('me@x'))).toMatchObject({
      kind: 'done',
      recalled: true,
    })
    w.store.fail('unknown-applied')
    expect(await w.destinations.remove(w.ctx, { recipient: person, id: 'x' })).toEqual({
      kind: 'unknown',
    })
    w.store.fail('rolled-back')
    expect(await w.destinations.remove(w.ctx, { recipient: person, id: 'x' })).toEqual(unavailable)
    const builtin = { recipient: person, id: 'default' }
    w.store.fail('rolled-back')
    expect(await w.destinations.change(w.ctx, builtin, { enabled: false })).toEqual(unavailable)
    w.store.fail('unknown-lost')
    expect(await w.destinations.change(w.ctx, builtin, { enabled: false })).toEqual({
      kind: 'unknown',
    })
    expect(await w.destinations.change(w.ctx, builtin, { enabled: false })).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { state: 'disabled' },
    })
  })

  it('asks the authority about the recipient it is going to touch', async () => {
    const w = withMail()
    const ref = { recipient: agent('a'), id: 'default' }
    await w.destinations.add(w.ctx, { ...mailTo('me@x'), recipient: agent('a') })
    await w.destinations.change(w.ctx, ref, { enabled: false })
    await w.destinations.remove(w.ctx, ref)
    await w.destinations.list(w.ctx, agent('a'))
    const manage = { kind: 'manage-destinations', recipient: agent('a') }
    expect(w.authority.asked()).toEqual([
      manage,
      manage,
      manage,
      { kind: 'read-inbox', recipient: agent('a') },
    ])
  })

  it.each([
    [
      'add with an unknown recipient kind',
      (w: ReturnType<typeof world>) =>
        w.destinations.add(w.ctx, { ...mailTo('a'), recipient: { kind: 'team' } } as never),
    ],
    [
      'add with an invalid channel name',
      (w: ReturnType<typeof world>) =>
        w.destinations.add(w.ctx, { ...mailTo('a'), channel: 'Mail!' }),
    ],
    [
      'add with an unknown level',
      (w: ReturnType<typeof world>) =>
        w.destinations.add(w.ctx, { ...mailTo('a'), minLevel: 'off' } as never),
    ],
    [
      'add without an address',
      (w: ReturnType<typeof world>) =>
        w.destinations.add(w.ctx, { ...mailTo('a'), address: undefined } as never),
    ],
    [
      'change with an empty patch',
      (w: ReturnType<typeof world>) =>
        w.destinations.change(w.ctx, { recipient: person, id: 'default' }, {}),
    ],
    [
      'change with a stray field',
      (w: ReturnType<typeof world>) =>
        w.destinations.change(w.ctx, { recipient: person, id: 'default' }, {
          enabled: true,
          blockedSince: null,
        } as never),
    ],
    [
      'change with a level that is not one',
      (w: ReturnType<typeof world>) =>
        w.destinations.change(w.ctx, { recipient: person, id: 'default' }, {
          minLevel: 'loud',
        } as never),
    ],
    [
      'change with an enablement that is not a boolean',
      (w: ReturnType<typeof world>) =>
        w.destinations.change(w.ctx, { recipient: person, id: 'default' }, {
          enabled: 'yes',
        } as never),
    ],
    [
      'change of a recipient that is not one, with a valid patch',
      (w: ReturnType<typeof world>) =>
        w.destinations.change(w.ctx, { recipient: { kind: 'team' }, id: 'default' } as never, {
          enabled: false,
        }),
    ],
    [
      'remove with an id that is not a string',
      (w: ReturnType<typeof world>) =>
        w.destinations.remove(w.ctx, { recipient: person, id: ['default'] } as never),
    ],
    [
      'remove without an id',
      (w: ReturnType<typeof world>) => w.destinations.remove(w.ctx, { recipient: person, id: '' }),
    ],
    [
      'list for an unknown recipient kind',
      (w: ReturnType<typeof world>) => w.destinations.list(w.ctx, { kind: 'team' } as never),
    ],
  ])('refuses %s as an invalid request', async (_case, call) => {
    const w = withMail()
    expect(await call(w)).toEqual(refused('invalid-request'))
    expect(w.authority.asked()).toEqual([])
  })
})

describe('the channel registry', () => {
  it('registers, looks up, lists and undoes, and refuses a second channel of the same name', () => {
    const changes: number[] = []
    const registry = createChannelRegistry(() => changes.push(1))
    const mail = fakeChannel('mail')
    const undo = registry.register(mail)
    const registered = { kind: 'registered', channel: { name: mail.name, label: mail.label } }
    expect(registry.lookup(mail.name)).toMatchObject(registered)
    expect(registry.list()).toMatchObject([{ name: mail.name }])
    expect(() => registry.register(fakeChannel('mail'))).toThrow(NotificationRegistrationError)
    expect(registry.lookup(mail.name)).toMatchObject(registered)
    undo()
    undo()
    expect(registry.lookup(mail.name)).toEqual({ kind: 'absent' })
    expect(changes).toHaveLength(2)
    const again = fakeChannel('mail')
    registry.register(again)
    undo()
    expect(registry.lookup(again.name)).toMatchObject({ kind: 'registered' })
    expect(() => registry.register({ ...mail, name: 'Bad Name' as never })).toThrow(
      NotificationRegistrationError,
    )
  })
  it('withdraws in order: no new delivery at once, the deliveries in flight get their outcome, then the name is free (INV-NO22)', async () => {
    const changes: number[] = []
    const registry = createChannelRegistry(() => changes.push(1))
    const landing: ((result: { kind: 'delivered' }) => void)[] = []
    const calls: unknown[] = []
    const mail = {
      ...fakeChannel('mail'),
      deliver: (delivery: unknown) => {
        calls.push(delivery)
        return new Promise<{ kind: 'delivered' }>(resolve => landing.push(resolve))
      },
    }
    const withdraw = registry.register(mail)
    const offered = registry.lookup(mail.name)
    if (offered.kind !== 'registered') throw new Error('fixture: not registered')
    const flight = offered.channel.deliver('first' as never)
    let withdrawn = false
    const done = withdraw().then(() => {
      withdrawn = true
    })
    expect(registry.lookup(mail.name)).toEqual({ kind: 'absent' })
    expect(registry.list()).toEqual([])
    expect(changes).toHaveLength(2)
    expect(await offered.channel.deliver('late' as never)).toEqual({
      kind: 'failed',
      reason: 'channel-withdrawn',
      retryable: true,
    })
    expect(CHANNEL_WITHDRAWN).toMatchObject({ reason: 'channel-withdrawn' })
    expect(calls).toEqual(['first'])
    expect(() => registry.register(fakeChannel('mail'))).toThrow(/already registered/u)
    await Promise.resolve()
    expect(withdrawn).toBe(false)
    landing[0]?.({ kind: 'delivered' })
    expect(await flight).toEqual({ kind: 'delivered' })
    await done
    expect(withdrawn).toBe(true)
    expect(withdraw()).toBe(withdraw())
    registry.register(fakeChannel('mail'))
    expect(registry.lookup(mail.name)).toMatchObject({ kind: 'registered' })
    expect(changes).toHaveLength(3)
  })

  it('frees the name at once when the deliveries it took have all landed', async () => {
    const registry = createChannelRegistry()
    const withdraw = registry.register(fakeChannel('mail'))
    const offered = registry.lookup('mail' as never)
    if (offered.kind !== 'registered') throw new Error('fixture: not registered')
    await offered.channel.deliver('first' as never)
    await Promise.resolve()
    void withdraw()
    registry.register(fakeChannel('mail'))
    expect(registry.lookup('mail' as never)).toMatchObject({ kind: 'registered' })
  })

  it('a delivery that throws or rejects has landed too: the withdrawal does not wait for ever', async () => {
    const registry = createChannelRegistry()
    const broken = {
      ...fakeChannel('mail'),
      deliver: () => {
        throw new Error('the channel fell over')
      },
    }
    const withdraw = registry.register(broken)
    const offered = registry.lookup(broken.name)
    if (offered.kind !== 'registered') throw new Error('fixture: not registered')
    const flight = offered.channel.deliver('first' as never)
    await withdraw()
    await expect(flight).rejects.toThrow('fell over')
    expect(registry.lookup(broken.name)).toEqual({ kind: 'absent' })
  })
})

describe('a send after destinations exist', () => {
  it('still reaches the inbox once, whatever the destinations are', async () => {
    const w = withMail()
    await w.destinations.add(w.ctx, mailTo('me@x', 'weak'))
    await w.sending.send(w.ctx, request('e1'))
    expect(await w.list()).toHaveLength(1)
  })
})
