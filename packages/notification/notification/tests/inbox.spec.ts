import { describe, expect, it } from 'vitest'
import { context } from '@omne-harness/notification/testing'
import { agent, person, request, world } from './world.ts'

const unavailable = { kind: 'basis-unavailable' }
const refused = (reason: string) => ({ kind: 'refused', reason })

async function filled(...ids: string[]) {
  const w = world()
  for (const id of ids) await w.sending.send(w.ctx, request(id))
  return w
}

describe('listing and reading an inbox', () => {
  it('pages in the order of acceptance', async () => {
    const w = await filled('e1', 'e2', 'e3')
    const first = await w.inbox.list(w.ctx, {
      recipient: person,
      filter: 'all',
      after: null,
      limit: 2,
    })
    if (first.kind !== 'done') throw new Error(first.kind)
    expect(first.value.entries.map(entry => entry.identity.eventId)).toEqual(['e1', 'e2'])
    const rest = await w.inbox.list(w.ctx, {
      recipient: person,
      filter: 'all',
      after: first.value.next,
      limit: 2,
    })
    expect(rest).toMatchObject({
      value: { entries: [{ identity: { eventId: 'e3' } }], next: null },
    })
  })

  it('answers an empty page for an empty inbox', async () => {
    const w = world()
    expect(
      await w.inbox.list(w.ctx, { recipient: person, filter: 'all', after: null, limit: 10 }),
    ).toEqual({
      kind: 'done',
      recalled: false,
      value: { entries: [], next: null },
    })
  })

  it('reads one notification in full without marking it seen', async () => {
    const w = await filled('e1')
    const view = await w.inbox.read(w.ctx, w.ref('e1'))
    expect(view).toMatchObject({
      kind: 'done',
      value: {
        title: 'Title e1',
        body: 'Body e1',
        subject: 'repo/a',
        level: 'weak',
        cause: { kind: 'type-default' },
        marks: { seenAt: null, resolved: null, supersededBy: null },
      },
    })
    expect((await w.list())[0]?.marks.seenAt).toBeNull()
    expect(w.store.commits()).toBe(1)
  })

  it.each([
    ['a limit of zero', { limit: 0 }],
    ['a limit above the page limit', { limit: 51 }],
    ['a negative cursor', { after: -1 }],
    ['an unknown filter', { filter: 'open' }],
    ['an unknown kind of recipient', { recipient: { kind: 'team' } }],
  ])('refuses %s', async (_case, patch) => {
    const w = world()
    const query = { recipient: person, filter: 'all', after: null, limit: 10, ...patch }
    expect(await w.inbox.list(w.ctx, query as never)).toEqual(refused('invalid-request'))
  })

  it('answers basis-unavailable, never an empty page, when it cannot read', async () => {
    const w = await filled('e1')
    w.store.fail('read-unavailable')
    expect(
      await w.inbox.list(w.ctx, { recipient: person, filter: 'all', after: null, limit: 10 }),
    ).toEqual(unavailable)
    w.store.fail('read-unavailable')
    expect(await w.inbox.read(w.ctx, w.ref('e1'))).toEqual(unavailable)
    w.authority.answer(() => 'unavailable')
    expect(await w.inbox.read(w.ctx, w.ref('e1'))).toEqual(unavailable)
    expect(await w.inbox.mark(w.ctx, w.ref('e1'), 'done')).toEqual(unavailable)
  })
})

describe('no authority, no such notification and another tenant answer the same', () => {
  it('for read, list and mark', async () => {
    const w = await filled('e1')
    const missing = [
      await w.inbox.read(w.ctx, w.ref('nope')),
      await w.inbox.read(w.ctx, w.ref('e1', agent('ghost'))),
      await w.inbox.read(context('t2'), w.ref('e1')),
      await w.inbox.read(context('t2'), {
        ...w.ref('e1'),
        identity: { ...w.ref('e1').identity, tenant: 't2' as never },
      }),
      await w.inbox.mark(w.ctx, w.ref('nope'), 'done'),
      await w.inbox.read(w.ctx, {
        ...w.ref('e1'),
        identity: { ...w.ref('e1').identity, tenant: 't2' as never },
      }),
      await w.inbox.mark(
        w.ctx,
        { ...w.ref('e1'), identity: { ...w.ref('e1').identity, tenant: 't2' as never } },
        'done',
      ),
      await w.inbox.mark(context('t2'), w.ref('e1'), 'done'),
    ]
    w.authority.answer(() => 'denied')
    const denied = [
      await w.inbox.read(w.ctx, w.ref('e1')),
      await w.inbox.mark(w.ctx, w.ref('e1'), 'done'),
      await w.inbox.list(w.ctx, { recipient: person, filter: 'all', after: null, limit: 10 }),
    ]
    for (const outcome of [...missing, ...denied]) expect(outcome).toEqual(refused('not-found'))
    w.authority.answer(() => 'allowed')
    expect((await w.list())[0]?.marks.resolved).toBeNull()
  })
})

describe('disposing of a notification', () => {
  it('walks through seen, done, restore and dismiss', async () => {
    const w = await filled('e1')
    const now = w.clock.now()
    const mark = (operation: Parameters<typeof w.inbox.mark>[2]) =>
      w.inbox.mark(w.ctx, w.ref('e1'), operation)
    expect(await mark('seen')).toMatchObject({
      kind: 'done',
      recalled: false,
      value: { seenAt: now },
    })
    expect(await mark('seen')).toMatchObject({ kind: 'done', recalled: true })
    expect(await mark('done')).toMatchObject({
      recalled: false,
      value: { resolved: { how: 'done' } },
    })
    expect(await mark('done')).toMatchObject({ kind: 'done', recalled: true })
    expect(await mark('dismiss')).toEqual(refused('restore-first'))
    expect(await mark('restore')).toMatchObject({
      recalled: false,
      value: { resolved: null, seenAt: now },
    })
    expect(await mark('dismiss')).toMatchObject({ value: { resolved: { how: 'dismissed' } } })
    expect(await w.list(person, 'unresolved')).toEqual([])
    expect(await w.list(person, 'all')).toHaveLength(1)
  })

  it('refuses to restore or resolve a superseded notification', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('old', { replaceKey: 'k' }))
    await w.sending.send(w.ctx, request('new', { replaceKey: 'k' }))
    for (const operation of ['done', 'dismiss', 'restore'] as const)
      expect(await w.inbox.mark(w.ctx, w.ref('old'), operation)).toEqual(refused('superseded'))
    expect(await w.inbox.mark(w.ctx, w.ref('old'), 'seen')).toMatchObject({ kind: 'done' })
  })

  it('changes the marks and nothing of the send', async () => {
    const w = await filled('e1')
    const before = w.store.facts(w.ctx.tenant).sends
    await w.inbox.mark(w.ctx, w.ref('e1'), 'dismiss')
    expect(w.store.facts(w.ctx.tenant).sends).toEqual(before)
  })

  it('answers what the store answered', async () => {
    const w = await filled('e1')
    w.store.fail('rolled-back')
    expect(await w.inbox.mark(w.ctx, w.ref('e1'), 'done')).toEqual(unavailable)
    w.store.fail('unknown-applied')
    expect(await w.inbox.mark(w.ctx, w.ref('e1'), 'done')).toEqual({ kind: 'unknown' })
    expect(await w.inbox.mark(w.ctx, w.ref('e1'), 'done')).toMatchObject({
      kind: 'done',
      recalled: true,
    })
  })

  it('refuses an unknown operation', async () => {
    const w = await filled('e1')
    expect(await w.inbox.mark(w.ctx, w.ref('e1'), 'archive' as never)).toEqual(
      refused('invalid-request'),
    )
  })
})

describe('what the inbox asks and refuses before it reads', () => {
  const identity = (eventId: string) => ({ tenant: 't1', source: 'demo.things', eventId })

  it('asks the authority about the recipient, to read or to dispose', async () => {
    const w = await filled('e1')
    const target = agent('a')
    const ref = { recipient: target, identity: identity('e1') }
    await w.inbox.list(w.ctx, { recipient: target, filter: 'all', after: null, limit: 5 })
    await w.inbox.read(w.ctx, ref)
    await w.inbox.mark(w.ctx, ref, 'seen')
    const read = { kind: 'read-inbox', recipient: target }
    expect(w.authority.asked().slice(-3)).toEqual([
      read,
      read,
      { kind: 'dispose', recipient: target },
    ])
  })

  it('takes a page of one and a cursor of zero, and refuses a page of none and a cursor below zero', async () => {
    const w = await filled('e1', 'e2')
    const list = (more: object) =>
      w.inbox.list(w.ctx, { recipient: person, filter: 'all', after: null, limit: 1, ...more })
    expect(await list({})).toMatchObject({
      kind: 'done',
      value: { entries: [{ sequence: 1 }], next: 1 },
    })
    expect(await list({ after: 0, limit: 2 })).toMatchObject({
      value: { entries: [{}, {}], next: null },
    })
    expect(await list({ limit: 0 })).toEqual(refused('invalid-request'))
    expect(await list({ after: -1 })).toEqual(refused('invalid-request'))
    expect(await list({ limit: 50 })).toMatchObject({ kind: 'done' })
    expect(await list({ limit: 51 })).toEqual(refused('invalid-request'))
  })

  it.each([
    ['a recipient that is not one', { recipient: { kind: 'team' }, identity: identity('e1') }],
    ['an identity that is not one', { recipient: person, identity: identity('') }],
    ['neither', { recipient: { kind: 'team' }, identity: identity('') }],
  ])('refuses to read or mark with %s, and asks nobody', async (_label, ref) => {
    const w = await filled('e1')
    const asked = w.authority.asked().length
    expect(await w.inbox.read(w.ctx, ref as never)).toEqual(refused('invalid-request'))
    expect(await w.inbox.mark(w.ctx, ref as never, 'seen')).toEqual(refused('invalid-request'))
    expect(w.authority.asked()).toHaveLength(asked)
  })

  it('a read is never a recall', async () => {
    const w = await filled('e1')
    const ref = { recipient: person, identity: identity('e1') }
    expect(await w.inbox.read(w.ctx, ref)).toMatchObject({ kind: 'done', recalled: false })
    expect(await w.inbox.read(w.ctx, ref)).toMatchObject({ kind: 'done', recalled: false })
  })
})
