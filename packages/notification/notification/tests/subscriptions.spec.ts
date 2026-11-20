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
      value: { creator: { kind: 'human' }, expired: false },
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

describe('who created a subscription', () => {
  it('an agent sets one at once, and it records the agent, its session and its call', async () => {
    const w = world()
    const ctx = { ...w.as('a'), call: 'call-7' }
    const creator = {
      kind: 'agent',
      actorRef: 'a',
      originatingSessionRef: 'a',
      originatingCallRef: 'call-7',
    }
    expect(await w.subscriptions.set(ctx, change())).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { creator },
    })
    expect(await w.subscriptions.list(w.ctx, agent('a'))).toMatchObject({
      kind: 'done',
      value: [{ creator }],
    })
    expect(w.creators.asked).toEqual([ctx])
  })

  it('the owner sets one, and it records a human', async () => {
    const w = world()
    expect(await w.subscriptions.set(w.ctx, change())).toMatchObject({
      kind: 'done',
      value: { creator: { kind: 'human', actorRef: 'owner' } },
    })
  })
})

describe('an agent subscribes', () => {
  const inCall = (w: ReturnType<typeof world>) => ({ ...w.as('a'), call: 'call-1' })

  it('and later sends to it follow the subscription', async () => {
    const w = world()
    expect(await w.subscriptions.set(inCall(w), change())).toMatchObject({ kind: 'done' })
    await w.sending.send(w.ctx, request('e1'))
    expect(await w.list(agent('a'))).toMatchObject([{ level: 'strong' }])
  })

  it.each([
    ['a context whose creator cannot be named', null],
    ['a port that throws', 'throw'],
  ] as const)('writes nothing on %s, and has no basis', async (_case, answer) => {
    const w = world()
    w.creators.set(answer)
    expect(await w.subscriptions.set(inCall(w), change())).toEqual(unavailable)
    expect(w.store.commits()).toBe(0)
  })

  it('lowers or shortens a subscription at once, and records itself as its creator', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change())
    for (const lower of [{ level: 'weak' }, { term: { kind: 'once' } }] as const)
      expect(await w.subscriptions.set(inCall(w), change(lower))).toMatchObject({
        kind: 'done',
        value: { ...lower, creator: { kind: 'agent', originatingCallRef: 'call-1' } },
      })
  })

  it('a subscription that would not change keeps its creator, and a removal names nobody', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change())
    expect(await w.subscriptions.set(inCall(w), change())).toMatchObject({
      recalled: true,
      value: { creator: { kind: 'human' } },
    })
    expect(await w.subscriptions.remove(inCall(w), keyOf(change()))).toMatchObject({
      kind: 'done',
      recalled: false,
    })
    expect(w.creators.asked).toEqual([w.ctx, inCall(w)])
  })

  it('refuses to remove a key that is not one, and writes nothing', async () => {
    const w = world()
    const key = keyOf(change({ recipient: person }))
    const long = { kind: 'subject', equals: 'x'.repeat(501) }
    expect(await w.subscriptions.remove(w.ctx, { ...key, scope: long } as never)).toEqual(
      refused('invalid-scope'),
    )
    for (const broken of [
      { ...key, source: 'Not A Source' },
      { ...key, recipient: { kind: 'team' } },
      { ...key, extra: 1 },
    ])
      expect(await w.subscriptions.remove(w.ctx, broken as never)).toEqual(
        refused('invalid-request'),
      )
    expect(w.authority.asked()).toEqual([])
    expect(w.store.commits()).toBe(0)
  })

  it('cannot subscribe or unsubscribe for another recipient, nor set a beat', async () => {
    const w = world()
    const self = inCall(w)
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
      creators: w.creators,
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

describe('what each operation asks and reads', () => {
  it('asks the authority about the recipient it touches, by the kind of the operation', async () => {
    const w = world()
    const target = agent('a')
    const key = keyOf(change({ recipient: target }))
    await w.subscriptions.set(w.ctx, change({ recipient: target }))
    await w.subscriptions.remove(w.ctx, key)
    await w.subscriptions.list(w.ctx, target)
    await w.subscriptions.beat(w.ctx, target)
    await w.subscriptions.setBeat(w.ctx, target, { kind: 'off' })
    const write = { kind: 'subscribe-for', recipient: target }
    const read = { kind: 'read-inbox', recipient: target }
    expect(w.authority.asked()).toEqual([write, write, read, read, write])
  })

  it('removing answers what the authority answered', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change({ recipient: person }))
    const key = keyOf(change({ recipient: person }))
    w.authority.answer(() => 'denied')
    expect(await w.subscriptions.remove(w.ctx, key)).toEqual(refused('not-permitted'))
    w.authority.answer(() => 'unavailable')
    expect(await w.subscriptions.remove(w.ctx, key)).toEqual(unavailable)
    w.authority.answer(() => 'allowed')
    expect(await w.subscriptions.list(w.ctx, person)).toMatchObject({
      value: [{ level: 'strong' }],
    })
  })

  it('facts that cannot be read are an unavailable basis for set, remove and list, and nothing is written', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, change({ recipient: person }))
    const commits = w.store.commits()
    const key = keyOf(change({ recipient: person }))
    w.store.fail('read-unavailable')
    expect(await w.subscriptions.set(w.ctx, change({ recipient: person, level: 'weak' }))).toEqual(
      unavailable,
    )
    w.store.fail('read-unavailable')
    expect(await w.subscriptions.remove(w.ctx, key)).toEqual(unavailable)
    w.store.fail('read-unavailable')
    expect(await w.subscriptions.list(w.ctx, person)).toEqual(unavailable)
    expect(w.store.commits()).toBe(commits)
    expect(await w.subscriptions.list(w.ctx, person)).toMatchObject({
      value: [{ level: 'strong' }],
    })
  })

  it('refuses what is not a request before it asks anyone', async () => {
    const w = world()
    const bad = { ...change({ recipient: person }), source: 'Not A Source' }
    expect(await w.subscriptions.set(w.ctx, bad as never)).toEqual(refused('invalid-request'))
    expect(await w.subscriptions.list(w.ctx, { kind: 'team' } as never)).toEqual(
      refused('invalid-request'),
    )
    expect(w.authority.asked()).toEqual([])
  })

  it('a declaration that cannot be read, or a rule that throws, is an unavailable basis', async () => {
    const w = world(
      declared({
        subject: {
          presence: 'optional',
          hint: '',
          accepts: () => {
            throw new Error('rule is broken')
          },
        },
      }),
    )
    const exact = change({ recipient: person, scope: { kind: 'subject', equals: 'repo/a' } })
    expect(await w.subscriptions.set(w.ctx, exact)).toEqual(unavailable)
    w.unregister()
    expect(await w.subscriptions.set(w.ctx, change({ recipient: person }))).toEqual(unavailable)
    expect(w.store.commits()).toBe(0)
    const blind = createSubscriptions({
      authority: w.authority,
      store: w.store,
      sources: {
        ...w.sources,
        lookup: () => {
          throw new Error('registry is down')
        },
      },
      creators: w.creators,
      clock: w.clock,
      defaults,
      beatRange: { min: 5, max: 1440 },
    })
    expect(await blind.set(w.ctx, change({ recipient: person }))).toEqual(unavailable)
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
    for (const minutes of [5, 1440])
      expect(await w.subscriptions.setBeat(w.ctx, person, { kind: 'every', minutes })).toEqual({
        kind: 'done',
        recalled: false,
        value: { kind: 'every', minutes },
      })
    for (const beat of [
      { kind: 'every', minutes: 0 },
      { kind: 'every', minutes: -5 },
      { kind: 'every' },
      null,
    ])
      expect(await w.subscriptions.setBeat(w.ctx, person, beat as never)).toEqual(
        refused('invalid-request'),
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

  it('recalls a beat only when it is the same beat', async () => {
    const w = world()
    const set = async (beat: object) => {
      const before = w.store.commits()
      const answer = await w.subscriptions.setBeat(w.ctx, person, beat as never)
      if (answer.kind !== 'done') throw new Error(answer.kind)
      return { recalled: answer.recalled, wrote: w.store.commits() - before }
    }
    expect(await set({ kind: 'default' })).toEqual({ recalled: true, wrote: 0 })
    expect(await set({ kind: 'every', minutes: 30 })).toEqual({ recalled: false, wrote: 1 })
    expect(await set({ kind: 'every', minutes: 30 })).toEqual({ recalled: true, wrote: 0 })
    expect(await set({ kind: 'every', minutes: 45 })).toEqual({ recalled: false, wrote: 1 })
    expect(await set({ kind: 'off' })).toEqual({ recalled: false, wrote: 1 })
    expect(await set({ kind: 'off' })).toEqual({ recalled: true, wrote: 0 })
    expect(await set({ kind: 'every', minutes: 45 })).toEqual({ recalled: false, wrote: 1 })
    expect(await set({ kind: 'default' })).toEqual({ recalled: false, wrote: 1 })
    expect(await w.subscriptions.beat(w.ctx, person)).toMatchObject({ value: { kind: 'default' } })
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
