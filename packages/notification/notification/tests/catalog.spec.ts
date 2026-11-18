import { describe, expect, it } from 'vitest'
import { createCatalog, type NotificationSources } from '@omne-harness/notification'
import { fakeChannel } from '@omne-harness/notification/testing'
import { agent, declaration, declared, person, request, source, world } from './world.ts'

const unavailable = { kind: 'basis-unavailable' }
const denied = { kind: 'refused', reason: 'not-permitted' }

describe('the catalogue', () => {
  it('lists the registered sources and their event types as data', async () => {
    const standing = declared({
      name: 'blocked' as never,
      kind: { kind: 'standing', binding: 'demo.blocked' },
    })
    const w = world(
      declared({ subject: { presence: 'required', hint: 'a path', accepts: () => true } }),
      standing,
    )
    expect(await w.catalog.sources(w.ctx)).toEqual({
      kind: 'done',
      recalled: false,
      value: [
        {
          name: source,
          label: 'Demo',
          types: [
            {
              name: 'changed',
              label: 'Changed',
              description: 'A thing changed.',
              kind: 'event',
              subject: { presence: 'required', hint: 'a path' },
              subscribable: ['person', 'agent'],
              nameable: ['person', 'agent'],
              defaults: { person: 'weak', agent: 'off' },
              external: false,
            },
            expect.objectContaining({ name: 'blocked', kind: 'standing' }),
          ],
        },
      ],
    })
  })

  it('follows what is registered now, without storing anything', async () => {
    const w = world()
    w.unregister()
    expect(await w.catalog.sources(w.ctx)).toEqual({ kind: 'done', recalled: false, value: [] })
    w.sources.register(declaration())
    w.sources.register({ ...declaration(), name: 'other.things' as never, label: 'Other' })
    const listed = await w.catalog.sources(w.ctx)
    expect(listed.kind === 'done' && listed.value.map(entry => entry.label)).toEqual([
      'Demo',
      'Other',
    ])
    expect(w.store.commits()).toBe(0)
  })

  it('lists only the sources the caller may know of', async () => {
    const w = world()
    w.sources.register({ ...declaration(), name: 'secret.things' as never, label: 'Secret' })
    w.authority.answer((_ctx, action) =>
      action.kind === 'know-source' && action.source === 'secret.things' ? 'denied' : 'allowed',
    )
    const listed = await w.catalog.sources(w.ctx)
    expect(listed.kind === 'done' && listed.value.map(entry => entry.label)).toEqual(['Demo'])
  })

  it('answers basis-unavailable for the whole list when one source cannot be read or judged', async () => {
    const w = world()
    w.authority.answer((_ctx, action) =>
      action.kind === 'know-source' ? 'unavailable' : 'allowed',
    )
    expect(await w.catalog.sources(w.ctx)).toEqual(unavailable)
    w.authority.answer(() => 'allowed')
    const broken: NotificationSources = {
      ...w.sources,
      list: () => [...w.sources.list(), { kind: 'unreadable' }],
    }
    const catalog = createCatalog({ authority: w.authority, sources: broken, channels: w.channels })
    expect(await catalog.sources(w.ctx)).toEqual(unavailable)
    const failing: NotificationSources = {
      ...w.sources,
      list() {
        throw new Error('registry is down')
      },
    }
    expect(
      await createCatalog({
        authority: w.authority,
        sources: failing,
        channels: w.channels,
      }).sources(w.ctx),
    ).toEqual(unavailable)
  })

  it('lists the channels with what an address looks like', async () => {
    const w = world()
    w.channels.register(fakeChannel('mail', { leavesSystem: true }))
    expect(await w.catalog.channels(w.ctx)).toEqual({
      kind: 'done',
      recalled: false,
      value: [
        { name: 'in-app', label: 'in-app', leavesSystem: false, addressHint: 'anything but "bad"' },
        {
          name: 'session',
          label: 'session',
          leavesSystem: false,
          addressHint: 'anything but "bad"',
        },
        { name: 'mail', label: 'mail', leavesSystem: true, addressHint: 'anything but "bad"' },
      ],
    })
  })

  it('is refused without authority and unavailable when the authority cannot answer', async () => {
    const w = world()
    await w.catalog.sources(w.ctx)
    await w.catalog.channels(w.ctx)
    expect(w.authority.asked()).toEqual([
      { kind: 'list-catalog' },
      { kind: 'know-source', source },
      { kind: 'list-catalog' },
    ])
    w.authority.answer(() => 'denied')
    expect(await w.catalog.sources(w.ctx)).toEqual(denied)
    expect(await w.catalog.channels(w.ctx)).toEqual(denied)
    w.authority.answer(() => 'unavailable')
    expect(await w.catalog.sources(w.ctx)).toEqual(unavailable)
    expect(await w.catalog.channels(w.ctx)).toEqual(unavailable)
  })
})

describe('after a source or a channel is withdrawn', () => {
  it('what is in the inbox stays readable and disposable, and subscriptions stay', async () => {
    const w = world()
    await w.subscriptions.set(w.ctx, {
      recipient: agent('a'),
      source: 'demo.things',
      type: 'changed',
      scope: { kind: 'all' },
      level: 'weak',
      note: null,
      term: { kind: 'standing' },
    })
    await w.sending.send(w.ctx, request('e1'))
    w.unregister()
    w.removeInApp()
    expect(await w.sending.send(w.ctx, request('e2'))).toEqual(unavailable)
    expect(await w.inbox.read(w.ctx, w.ref('e1'))).toMatchObject({
      kind: 'done',
      value: { title: 'Title e1' },
    })
    expect(await w.inbox.mark(w.ctx, w.ref('e1'), 'done')).toMatchObject({
      kind: 'done',
      recalled: false,
    })
    expect(await w.list(person)).toHaveLength(1)
    expect(await w.subscriptions.list(w.ctx, agent('a'))).toMatchObject({
      value: [{ level: 'weak' }],
    })
    expect(await w.sending.querySend(w.ctx, request('e1').identity)).toMatchObject({
      value: { kind: 'accepted' },
    })
  })
})
