import { describe, expect, it } from 'vitest'
import type { SubscriptionChangeInput } from '@omne-harness/notification-contract'
import { createSubscriptions } from '@omne-harness/notification'
import { context } from '@omne-harness/notification/testing'
import { agent, declared, defaults, person, request, world } from './world.ts'

const unavailable = { kind: 'basis-unavailable' }
const refused = (reason: string) => ({ kind: 'refused', reason })

function change(overrides: Partial<SubscriptionChangeInput> = {}): SubscriptionChangeInput {
  return {
    recipient: agent('a'),
    source: 'demo.things',
    type: 'changed',
    scope: { kind: 'all' },
    level: 'strong',
    note: null,
    term: { kind: 'standing' },
    ...overrides,
  }
}
const keyOf = ({ recipient, source, type, scope }: SubscriptionChangeInput) => ({
  recipient,
  source,
  type,
  scope,
})

describe('the owner sets subscriptions', () => {
  it('for any recipient, on its own authority, and later sends follow it', async () => {
    const w = world()
    const set = await w.subscriptions.set(w.ctx, change({ note: 'triage it' }))
    expect(set).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { basis: { kind: 'owner' }, expired: false },
    })
    await w.sending.send(w.ctx, request('e1'))
    expect(await w.list(agent('a'))).toMatchObject([
      { level: 'strong', cause: { kind: 'subscription', note: 'triage it' } },
    ])
  })

  it('does not change what is already in an inbox', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    await w.subscriptions.set(w.ctx, change({ recipient: person, level: 'strong' }))
    expect(await w.list()).toMatchObject([{ level: 'weak', cause: { kind: 'type-default' } }])
  })

  it('tells off apart from removed', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change({ recipient: person, level: 'off' }))
    await w.sending.send(w.ctx, request('e1'))
    expect(await w.list()).toEqual([])
    const removed = await w.subscriptions.remove(w.ctx, keyOf(change({ recipient: person })))
    expect(removed).toEqual({ kind: 'done', recalled: false, value: null })
    await w.sending.send(w.ctx, request('e2'))
    expect(await w.list()).toMatchObject([
      { identity: { eventId: 'e2' }, cause: { kind: 'type-default' } },
    ])
    expect(await w.subscriptions.remove(w.ctx, keyOf(change({ recipient: person })))).toEqual({
      kind: 'done',
      recalled: true,
      value: null,
    })
  })

  it('is recalled when the same content is set again and writes nothing', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change())
    const facts = JSON.stringify([...w.store.facts(w.ctx.tenant).subscriptions])
    expect(await w.subscriptions.set(w.ctx, change())).toMatchObject({
      kind: 'done',
      recalled: true,
    })
    expect(JSON.stringify([...w.store.facts(w.ctx.tenant).subscriptions])).toBe(facts)
  })

  it('no longer hits once its term has passed', async () => {
    const w = world()
    await w.subscriptions.set(
      w.ctx,
      change({ term: { kind: 'until', at: '2026-11-18T06:10:00.000Z' } }),
    )
    await w.sending.send(w.ctx, request('e1'))
    w.clock.set('2026-11-18T06:10:00.000Z')
    await w.sending.send(w.ctx, request('e2'))
    expect((await w.list(agent('a'))).map(entry => entry.identity.eventId)).toEqual(['e1'])
  })

  it('keeps a subscription while its source is gone and hits again when it is back', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change())
    w.unregister()
    expect(await w.subscriptions.list(w.ctx, agent('a'))).toMatchObject({
      value: [{ level: 'strong' }],
    })
    expect(await w.subscriptions.set(w.ctx, change({ level: 'weak' }))).toEqual(unavailable)
    w.sources.register({ name: 'demo.things' as never, label: 'Demo', types: [declared()] })
    await w.sending.send(w.ctx, request('e1'))
    expect(await w.list(agent('a'))).toHaveLength(1)
  })
})

describe('an agent subscribes', () => {
  it('needs the owner under per-request consent, and takes effect with the confirmation', async () => {
    const w = world()
    const self = w.as('a')
    const asked = await w.subscriptions.set(self, change())
    expect(asked).toMatchObject({
      kind: 'needs-confirmation',
      request: { change: { level: 'strong' } },
    })
    expect(w.store.facts(w.ctx.tenant).subscriptions.size).toBe(0)
    if (asked.kind !== 'needs-confirmation') throw new Error(asked.kind)
    const confirmation = { decision: 'card-7', content: asked.request.content, approved: true }
    expect(await w.subscriptions.set(self, change(), confirmation)).toMatchObject({
      kind: 'done',
      value: { basis: { kind: 'granular', decision: 'card-7' } },
    })
  })

  it('is refused with a confirmation of other content or a rejection', async () => {
    const w = world()
    const self = w.as('a')
    const asked = await w.subscriptions.set(self, change({ level: 'weak' }))
    if (asked.kind !== 'needs-confirmation') throw new Error(asked.kind)
    const forWeak = { decision: 'card-7', content: asked.request.content, approved: true }
    expect(await w.subscriptions.set(self, change({ level: 'strong' }), forWeak)).toEqual(
      refused('confirmation-mismatch'),
    )
    expect(
      await w.subscriptions.set(self, change({ level: 'weak' }), { ...forWeak, approved: false }),
    ).toEqual(refused('confirmation-mismatch'))
    expect(w.store.facts(w.ctx.tenant).subscriptions.size).toBe(0)
  })

  it('takes effect at once under automatic consent and stays valid after the mode changes', async () => {
    const w = world()
    w.consent.set({ kind: 'automatic', generation: 2 })
    expect(await w.subscriptions.set(w.as('a'), change())).toMatchObject({
      value: { basis: { kind: 'blanket', generation: 2 } },
    })
    w.consent.set({ kind: 'per-request' })
    await w.sending.send(w.ctx, request('e1'))
    expect(await w.list(agent('a'))).toHaveLength(1)
  })

  it('lowers, shortens and removes without consent', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change())
    const self = w.as('a')
    expect(await w.subscriptions.set(self, change({ level: 'weak' }))).toMatchObject({
      kind: 'done',
      value: { level: 'weak', basis: { kind: 'owner' } },
    })
    expect(
      await w.subscriptions.set(self, change({ level: 'weak', term: { kind: 'once' } })),
    ).toMatchObject({
      kind: 'done',
    })
    expect(
      await w.subscriptions.set(self, change({ level: 'strong', term: { kind: 'once' } })),
    ).toMatchObject({
      kind: 'needs-confirmation',
    })
    expect(await w.subscriptions.remove(self, keyOf(change()))).toMatchObject({
      kind: 'done',
      recalled: false,
    })
  })

  it('cannot subscribe or unsubscribe for another recipient, nor set a beat', async () => {
    const w = world()
    const self = w.as('a')
    await w.subscriptions.set(w.ctx, change({ recipient: agent('b') }))
    expect(await w.subscriptions.set(self, change({ recipient: agent('b') }))).toEqual(
      refused('not-own-recipient'),
    )
    expect(await w.subscriptions.set(self, change({ recipient: person }))).toEqual(
      refused('not-own-recipient'),
    )
    expect(await w.subscriptions.remove(self, keyOf(change({ recipient: agent('b') })))).toEqual(
      refused('not-own-recipient'),
    )
    expect(await w.subscriptions.setBeat(self, agent('a'), { kind: 'off' })).toEqual(
      refused('not-permitted'),
    )
    expect(w.store.facts(w.ctx.tenant).subscriptions.size).toBe(1)
  })

  it('answers basis-unavailable when the consent mode cannot be read', async () => {
    const w = world()
    for (const mode of ['unavailable', 'throw'] as const) {
      w.consent.set(mode)
      expect(await w.subscriptions.set(w.as('a'), change())).toEqual(unavailable)
    }
    expect(await w.subscriptions.set(w.ctx, change())).toMatchObject({ kind: 'done' })
  })
})

describe('what blocks a subscription', () => {
  it.each([
    ['an unknown scope', { scope: { kind: 'suffix', suffix: 'x' } }, 'invalid-scope'],
    ['an unknown term', { term: { kind: 'twice' } }, 'invalid-term'],
    ['a note above the limit', { note: 'x'.repeat(501) }, 'invalid-request'],
    ['an unknown level', { level: 'loud' }, 'invalid-request'],
  ])('refuses %s', async (_case, patch, reason) => {
    const w = world()
    expect(await w.subscriptions.set(w.ctx, change(patch as never))).toEqual(refused(reason))
  })

  it('refuses a past term, a recipient kind the type excludes and a scope that does not fit', async () => {
    const w = world(declared({ subscribable: ['agent'], subject: { presence: 'none', hint: '' } }))
    expect(
      await w.subscriptions.set(
        w.ctx,
        change({ term: { kind: 'until', at: '2026-11-18T05:00:00.000Z' } }),
      ),
    ).toEqual(refused('term-in-past'))
    expect(await w.subscriptions.set(w.ctx, change({ recipient: person }))).toEqual(
      refused('not-subscribable'),
    )
    expect(
      await w.subscriptions.set(w.ctx, change({ scope: { kind: 'subject', equals: 'x' } })),
    ).toEqual(refused('scope-does-not-fit'))
  })

  it('answers basis-unavailable while the source or the type is not registered', async () => {
    const w = world()
    expect(await w.subscriptions.set(w.ctx, change({ type: 'other' }))).toEqual(unavailable)
    expect(await w.subscriptions.set(w.ctx, change({ source: 'gone.away' }))).toEqual(unavailable)
  })

  it('maps the authority and the store', async () => {
    const w = world()
    w.authority.answer(() => 'denied')
    expect(await w.subscriptions.set(w.ctx, change())).toEqual(refused('not-permitted'))
    expect(await w.subscriptions.list(w.ctx, agent('a'))).toEqual(refused('not-permitted'))
    w.authority.answer(() => 'unavailable')
    expect(await w.subscriptions.set(w.ctx, change())).toEqual(unavailable)
    w.authority.answer(() => 'allowed')
    w.store.fail('read-unavailable')
    expect(await w.subscriptions.set(w.ctx, change())).toEqual(unavailable)
    w.store.fail('rolled-back')
    expect(await w.subscriptions.set(w.ctx, change())).toEqual(unavailable)
    w.store.fail('unknown-applied')
    expect(await w.subscriptions.set(w.ctx, change())).toEqual({ kind: 'unknown' })
    expect(await w.subscriptions.set(w.ctx, change())).toMatchObject({
      kind: 'done',
      recalled: true,
    })
  })

  it('does not write over a subscription that changed after the decision read it', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change({ level: 'weak' }))
    const read = w.store.subscription
    const racing = {
      ...w.store,
      subscription: async (...args: Parameters<typeof read>) => {
        const seen = await read(...args)
        await w.subscriptions.set(w.ctx, change({ level: 'off' }))
        return seen
      },
    }
    const late = createSubscriptions({
      authority: w.authority,
      store: racing,
      sources: w.sources,
      consent: w.consent,
      clock: w.clock,
      defaults,
      beatRange: { min: 5, max: 1440 },
    })
    expect(await late.set(w.ctx, change({ level: 'strong' }))).toEqual(unavailable)
    expect(await w.subscriptions.list(w.ctx, agent('a'))).toMatchObject({
      value: [{ level: 'off' }],
    })
  })

  it('keeps tenants apart', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change())
    expect(await w.subscriptions.list(context('t2'), agent('a'))).toEqual({
      kind: 'done',
      recalled: false,
      value: [],
    })
  })
})

describe('the beat of a recipient', () => {
  it('is set by the owner within the allowed range', async () => {
    const w = world()
    expect(await w.subscriptions.setBeat(w.ctx, person, { kind: 'every', minutes: 30 })).toEqual({
      kind: 'done',
      recalled: false,
      value: { kind: 'every', minutes: 30 },
    })
    expect(
      await w.subscriptions.setBeat(w.ctx, person, { kind: 'every', minutes: 30 }),
    ).toMatchObject({ recalled: true })
    expect(await w.subscriptions.setBeat(w.ctx, person, { kind: 'off' })).toMatchObject({
      recalled: false,
    })
    for (const minutes of [4, 1441])
      expect(await w.subscriptions.setBeat(w.ctx, person, { kind: 'every', minutes })).toEqual(
        refused('out-of-range'),
      )
    for (const beat of [{ kind: 'every', minutes: 1.5 }, { kind: 'sometimes' }])
      expect(await w.subscriptions.setBeat(w.ctx, person, beat as never)).toEqual(
        refused('invalid-request'),
      )
    expect(
      await w.subscriptions.setBeat(w.ctx, { kind: 'team' } as never, { kind: 'off' }),
    ).toEqual(refused('invalid-request'))
  })

  it('is read back as it was set, and as the default before anyone set it', async () => {
    const w = world()
    const read = (recipient: unknown = person) => w.subscriptions.beat(w.ctx, recipient as never)
    expect(await read()).toEqual({ kind: 'done', recalled: false, value: { kind: 'default' } })
    await w.subscriptions.setBeat(w.ctx, person, { kind: 'every', minutes: 30 })
    expect(await read()).toMatchObject({ value: { kind: 'every', minutes: 30 } })
    expect(await read(agent('a'))).toMatchObject({ value: { kind: 'default' } })
    expect(await read({ kind: 'team' })).toEqual(refused('invalid-request'))
    const asked: unknown[] = []
    w.authority.answer((_ctx, action) => (asked.push(action), 'denied'))
    expect(await read()).toEqual(refused('not-permitted'))
    expect(asked).toEqual([{ kind: 'read-inbox', recipient: person }])
    w.authority.answer(() => 'unavailable')
    expect(await read()).toEqual(unavailable)
    w.authority.answer(() => 'allowed')
    w.store.fail('read-unavailable')
    expect(await read()).toEqual(unavailable)
  })

  it('answers what the authority and the store answered', async () => {
    const w = world()
    const every = { kind: 'every', minutes: 30 } as const
    w.authority.answer(() => 'denied')
    expect(await w.subscriptions.setBeat(w.ctx, person, every)).toEqual(refused('not-permitted'))
    w.authority.answer(() => 'allowed')
    w.store.fail('read-unavailable')
    expect(await w.subscriptions.setBeat(w.ctx, person, every)).toEqual(unavailable)
    w.store.fail('rolled-back')
    expect(await w.subscriptions.setBeat(w.ctx, person, every)).toEqual(unavailable)
    w.store.fail('unknown-applied')
    expect(await w.subscriptions.setBeat(w.ctx, person, every)).toEqual({ kind: 'unknown' })
    expect(await w.subscriptions.setBeat(w.ctx, person, every)).toMatchObject({
      kind: 'done',
      recalled: true,
    })
  })
})
