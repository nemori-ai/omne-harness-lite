import { describe, expect, it } from 'vitest'
import { context, subscriptionKey } from '@omne-harness/notification/testing'
import type { Subscription } from '@omne-harness/notification-contract'
import { agent, declared, person, request, source, typeName, world } from './world.ts'

const unavailable = { kind: 'basis-unavailable' }
const refused = (reason: string) => ({ kind: 'refused', reason })

describe('accepting a send', () => {
  it('puts the notification in the inbox in the commit that accepts the send', async () => {
    const w = world()
    const outcome = await w.sending.send(w.ctx, request('e1'))
    expect(outcome).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { recipients: [person] },
    })
    expect(w.store.commits()).toBe(1)
    expect((await w.list()).map(entry => entry.title)).toEqual(['Title e1'])
    expect(w.wakes).toEqual([w.ctx.tenant])
  })

  it('accepts a send that nobody receives', async () => {
    const w = world(declared({ defaults: { person: 'off', agent: 'off' } }))
    const outcome = await w.sending.send(w.ctx, request('e1'))
    expect(outcome).toMatchObject({ kind: 'done', recalled: false, value: { recipients: [] } })
    expect(await w.list()).toEqual([])
    expect(await w.sending.querySend(w.ctx, request('e1').identity)).toMatchObject({
      value: { kind: 'accepted', notifications: [] },
    })
  })

  it('writes level, cause and note into the notification when it accepts', async () => {
    const w = world()
    const subscription: Subscription = {
      recipient: agent('a'),
      source,
      type: typeName,
      scope: { kind: 'subject-prefix', prefix: 'repo/' },
      level: 'strong',
      note: 'triage it',
      term: { kind: 'standing' },
      basis: { kind: 'owner' },
      expired: false,
    }
    const facts = w.store.facts(w.ctx.tenant)
    facts.recipients.set('agent:a', agent('a'))
    facts.subscriptions.set(subscriptionKey(subscription), subscription)
    await w.sending.send(w.ctx, request('e1'))
    facts.subscriptions.set(subscriptionKey(subscription), { ...subscription, level: 'off' })
    expect(await w.list(agent('a'))).toMatchObject([
      { level: 'strong', cause: { kind: 'subscription', note: 'triage it' } },
    ])
  })

  it('expires a once subscription in the commit that hits it', async () => {
    const w = world()
    const once: Subscription = {
      recipient: agent('a'),
      source,
      type: typeName,
      scope: { kind: 'all' },
      level: 'strong',
      note: null,
      term: { kind: 'once' },
      basis: { kind: 'owner' },
      expired: false,
    }
    const facts = w.store.facts(w.ctx.tenant)
    facts.recipients.set('agent:a', agent('a'))
    facts.subscriptions.set(subscriptionKey(once), once)
    await w.sending.send(w.ctx, request('e1'))
    expect(w.store.commits()).toBe(1)
    expect(w.store.facts(w.ctx.tenant).subscriptions.get(subscriptionKey(once))?.expired).toBe(true)
    await w.sending.send(w.ctx, request('e2'))
    expect((await w.list(agent('a'))).map(entry => entry.identity.eventId)).toEqual(['e1'])
  })

  it('does not deliver the event to the recipient that emitted it', async () => {
    const w = world(declared({ defaults: { person: 'weak', agent: 'weak' } }))
    w.store.facts(w.ctx.tenant).recipients.set('agent:a', agent('a'))
    w.store.facts(w.ctx.tenant).recipients.set('agent:b', agent('b'))
    const origin = { emitter: agent('a'), depth: 1 }
    const outcome = await w.sending.send(w.ctx, request('e1', { origin, named: [agent('a')] }))
    expect(outcome).toMatchObject({ value: { recipients: [person, agent('b')] } })
  })

  it('marks an earlier notification with the same replace key as superseded', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('old', { replaceKey: 'progress' }))
    await w.sending.send(w.ctx, request('new', { replaceKey: 'progress' }))
    const [old, next] = await w.list()
    expect(old?.marks.supersededBy).toEqual(w.ref('new').identity)
    expect(next?.marks.supersededBy).toBeNull()
    const facts = w.store.facts(w.ctx.tenant)
    expect([...facts.notifications.values()].map(record => record.quiet)).toEqual([false, true])
  })

  it('is not quiet when the send asks to remind again', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('old', { replaceKey: 'progress' }))
    await w.sending.send(w.ctx, request('new', { replaceKey: 'progress', renotify: true }))
    const records = [...w.store.facts(w.ctx.tenant).notifications.values()]
    expect(records.map(record => record.quiet)).toEqual([false, false])
  })
})

describe('the order of the checks', () => {
  it('refuses an invalid request before it asks the authority', async () => {
    const w = world()
    const bad = { ...request('e1'), identity: { tenant: 't1', source: 'Demo', eventId: 'e1' } }
    expect(await w.sending.send(w.ctx, bad)).toEqual(refused('invalid-source-name'))
    expect(w.authority.asked()).toEqual([])
  })

  it('refuses a body above the limit even when the authority would deny', async () => {
    const w = world()
    w.authority.answer(() => 'denied')
    const big = request('e1', { content: { title: 'T', body: 'x'.repeat(1001), locator: null } })
    expect(await w.sending.send(w.ctx, big)).toEqual(refused('too-large'))
  })

  it('does not tell a subject without authority whether the identity was accepted', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    w.authority.answer(() => 'denied')
    expect(await w.sending.send(w.ctx, request('e1'))).toEqual(refused('not-permitted'))
    expect(await w.sending.querySend(w.ctx, request('e1').identity)).toEqual(
      refused('not-permitted'),
    )
  })

  it('refuses an identity of another tenant', async () => {
    const w = world()
    expect(await w.sending.send(w.ctx, request('e1', {}, 't2'))).toEqual(refused('not-permitted'))
    expect(await w.sending.querySend(w.ctx, request('e1', {}, 't2').identity)).toEqual(
      refused('not-permitted'),
    )
    expect(w.store.commits()).toBe(0)
  })

  it('answers basis-unavailable when the authority cannot answer or fails', async () => {
    const w = world()
    w.authority.answer(() => 'unavailable')
    expect(await w.sending.send(w.ctx, request('e1'))).toEqual(unavailable)
    w.authority.answer(() => 'throw')
    expect(await w.sending.send(w.ctx, request('e1'))).toEqual(unavailable)
    expect(w.store.commits()).toBe(0)
  })

  it('recalls an accepted send after its source is gone', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    w.unregister()
    const again = await w.sending.send(w.ctx, request('e1'))
    expect(again).toMatchObject({ kind: 'done', recalled: true, value: { recipients: [person] } })
    expect(w.store.commits()).toBe(1)
    expect(w.wakes).toHaveLength(1)
    expect(await w.sending.send(w.ctx, request('e2'))).toEqual(unavailable)
  })

  it('refuses the same identity with other content and keeps the first', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    const other = request('e1', { content: { title: 'Other', body: 'Other', locator: null } })
    expect(await w.sending.send(w.ctx, other)).toEqual(refused('conflict'))
    expect((await w.list()).map(entry => entry.title)).toEqual(['Title e1'])
  })

  it('refuses an undeclared type, a standing type and a subject the type rejects', async () => {
    const standing = declared({
      name: 'blocked' as never,
      kind: { kind: 'standing', binding: 'demo.blocked' },
    })
    const strict = declared({
      name: 'strict' as never,
      subject: { presence: 'required', hint: '', accepts: subject => subject.startsWith('ok/') },
    })
    const w = world(declared(), standing, strict)
    expect(await w.sending.send(w.ctx, request('e1', { type: 'nope' }))).toEqual(
      refused('unknown-event-type'),
    )
    expect(await w.sending.send(w.ctx, request('e2', { type: 'blocked' }))).toEqual(
      refused('standing-type'),
    )
    expect(await w.sending.send(w.ctx, request('e3', { type: 'strict' }))).toEqual(
      refused('invalid-subject'),
    )
    expect(w.store.commits()).toBe(0)
  })

  it('answers basis-unavailable when a rule of the declaration cannot answer', async () => {
    const broken = declared({
      subject: {
        presence: 'optional',
        hint: '',
        accepts() {
          throw new Error('rule failed')
        },
      },
    })
    const w = world(broken)
    expect(await w.sending.send(w.ctx, request('e1'))).toEqual(unavailable)
  })

  it('asks whether each named recipient may be one, and refuses when it may not', async () => {
    const w = world()
    w.authority.answer((_ctx, action) => (action.kind === 'be-recipient' ? 'denied' : 'allowed'))
    expect(await w.sending.send(w.ctx, request('e1', { named: [agent('a')] }))).toEqual(
      refused('recipient-not-admissible'),
    )
    w.authority.answer(() => 'allowed')
    const outcome = await w.sending.send(w.ctx, request('e1', { named: [agent('a')] }))
    expect(outcome).toMatchObject({ kind: 'done', value: { recipients: [person, agent('a')] } })
    expect(await w.list(agent('a'))).toMatchObject([{ cause: { kind: 'named' }, level: 'weak' }])
  })

  it('refuses a causal depth above the limit', async () => {
    const w = world()
    const deep = request('e1', { origin: { emitter: agent('a'), depth: 4 } })
    expect(await w.sending.send(w.ctx, deep)).toEqual(refused('causal-depth-exceeded'))
  })
})

describe('what the store answers', () => {
  it('answers basis-unavailable when the commit is rolled back, and nothing is written', async () => {
    const w = world()
    w.store.fail('rolled-back')
    expect(await w.sending.send(w.ctx, request('e1'))).toEqual(unavailable)
    expect(await w.list()).toEqual([])
    expect(w.wakes).toEqual([])
  })

  it('answers basis-unavailable when the earlier send cannot be read', async () => {
    const w = world()
    w.store.fail('read-unavailable')
    expect(await w.sending.send(w.ctx, request('e1'))).toEqual(unavailable)
    w.store.fail('read-unavailable')
    expect(await w.sending.querySend(w.ctx, request('e1').identity)).toEqual(unavailable)
  })

  it.each([
    ['was lost', 'unknown-lost', false],
    ['was written', 'unknown-applied', true],
  ] as const)(
    'stays unknown when the commit %s, and the same identity settles it',
    async (_c, fault, recalled) => {
      const w = world()
      w.store.fail(fault)
      expect(await w.sending.send(w.ctx, request('e1'))).toEqual({ kind: 'unknown' })
      const again = await w.sending.send(w.ctx, request('e1'))
      expect(again).toMatchObject({ kind: 'done', recalled })
      expect(await w.list()).toHaveLength(1)
    },
  )
})

describe('asking about an earlier send', () => {
  it('answers the marks of each notification, or that nothing was submitted', async () => {
    const w = world()
    expect(await w.sending.querySend(w.ctx, request('e1').identity)).toEqual({
      kind: 'done',
      recalled: false,
      value: { kind: 'not-submitted' },
    })
    await w.sending.send(w.ctx, request('e1'))
    await w.inbox.mark(w.ctx, w.ref('e1'), 'seen')
    expect(await w.sending.querySend(w.ctx, request('e1').identity)).toMatchObject({
      value: {
        kind: 'accepted',
        notifications: [{ recipient: person, marks: { seenAt: w.clock.now() } }],
      },
    })
  })

  it('keeps tenants apart', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    const other = context('t2')
    expect(await w.sending.querySend(other, request('e1', {}, 't2').identity)).toMatchObject({
      value: { kind: 'not-submitted' },
    })
  })
})
