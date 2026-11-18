/**
 * One test per safety property of the model `NotificationHandoff` in `verification/`.
 * Each test names the property and the invariant of the group it guards.
 */
import { describe, expect, it } from 'vitest'
import { agent, declared, MINUTE, person, request, world } from './world.ts'

/** One minute into a beat slot, so that nothing accepted in a test is already due for a beat. */
function worldWith(defaults: { person: 'strong' | 'off'; agent: 'strong' | 'off' }) {
  const w = world(declared({ defaults }))
  w.clock.set('2026-11-18T06:01:00.000Z')
  return w
}
const strongForPerson = () => worldWith({ person: 'strong', agent: 'off' })
const strongForAgents = () => worldWith({ person: 'off', agent: 'strong' })
const identities = (deliveries: readonly { unit: { members: readonly { eventId: string }[] } }[]) =>
  deliveries.map(delivery => delivery.unit.members.map(member => member.eventId))

describe('NotificationHandoff', () => {
  it('OneNotificationPerRecipient (INV-NO03): a send repeated after any answer leaves one notification', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    w.store.fail('unknown-applied')
    await w.sending.send(w.ctx, request('e2'))
    for (const id of ['e1', 'e1', 'e2', 'e2']) await w.sending.send(w.ctx, request(id))
    expect((await w.list()).map(entry => entry.identity.eventId)).toEqual(['e1', 'e2'])
  })

  it('AcceptedIsBoxed (INV-NO02): when the send is answered accepted, the notification is in the inbox by the same commit', async () => {
    const w = world()
    const outcome = await w.sending.send(w.ctx, request('e1', { named: [agent('a')] }))
    expect(outcome.kind).toBe('done')
    expect(w.store.commits()).toBe(1)
    expect(await w.list(person)).toHaveLength(1)
    expect(await w.list(agent('a'))).toHaveLength(1)
  })

  it('OneLivePerKey (INV-NO06): at most one unresolved notification per replace key, whatever is restored', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('first', { replaceKey: 'k' }))
    await w.inbox.mark(w.ctx, w.ref('first'), 'done')
    await w.sending.send(w.ctx, request('second', { replaceKey: 'k' }))
    expect(await w.inbox.mark(w.ctx, w.ref('first'), 'restore')).toEqual({
      kind: 'refused',
      reason: 'superseded',
    })
    await w.sending.send(w.ctx, request('third', { replaceKey: 'k' }))
    await w.inbox.mark(w.ctx, w.ref('second'), 'restore')
    const live = (await w.list(person, 'unresolved')).map(entry => entry.identity.eventId)
    expect(live).toEqual(['third'])
  })

  it('OneInputPerUnit (INV-NO14): every delivery of a unit carries the same identity', async () => {
    const w = strongForPerson()
    w.inApp.answer({ kind: 'unknown' }, 'throw', { kind: 'delivered' })
    await w.sending.send(w.ctx, request('e1'))
    for (let turn = 0; turn < 3; turn += 1) {
      await w.advance()
      w.clock.advance(MINUTE)
    }
    expect(w.inApp.deliveries).toHaveLength(3)
    expect(new Set(w.inApp.deliveries.map(delivery => delivery.unit.id)).size).toBe(1)
  })

  it('OneUnitPerStrong (INV-NO14, INV-NO30): a strong notification enters one strong unit, and a redelivery carries the members and body the unit was formed with', async () => {
    const w = strongForAgents()
    await w.subscriptions.set(w.ctx, {
      recipient: agent('a'),
      source: 'demo.things',
      type: 'changed',
      scope: { kind: 'all' },
      level: 'strong',
      note: null,
      term: { kind: 'standing' },
    })
    w.session.answer({ kind: 'unknown' })
    await w.sending.send(w.ctx, request('e1'))
    await w.advance()
    await w.sending.send(w.ctx, request('e2'))
    w.clock.advance(MINUTE)
    await w.advance()
    w.clock.advance(10 * MINUTE)
    await w.advance()
    expect(identities(w.session.deliveries)).toEqual([['e1'], ['e1'], ['e2']])
    expect(w.session.deliveries[1]?.unit).toEqual(w.session.deliveries[0]?.unit)
  })

  it('BeatCarriesAllLive (INV-NO18): a beat carries everything that waits, not only what came since the last beat', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('old'))
    w.clock.set('2026-11-18T06:30:00.000Z')
    await w.advance()
    await w.sending.send(w.ctx, request('new'))
    w.clock.set('2026-11-18T07:00:00.000Z')
    await w.advance()
    expect(identities(w.inApp.deliveries)).toEqual([['old'], ['old', 'new']])
  })

  it('NoEmptyBeat (INV-NO17): a beat with nothing to remind of forms no unit, writes nothing and delivers nothing', async () => {
    const w = world()
    await w.sending.send(w.ctx, request('e1'))
    await w.inbox.mark(w.ctx, w.ref('e1'), 'seen')
    const commits = w.store.commits()
    w.clock.set('2026-11-18T06:30:00.000Z')
    await w.advance()
    expect(w.store.commits()).toBe(commits)
    expect(w.inApp.deliveries).toEqual([])
    expect(w.store.facts(w.ctx.tenant).units.size).toBe(0)
  })

  it('StrongPaced (INV-NO19): two strong units to one destination are a minimum interval apart, and what came between is queued, not lost', async () => {
    const w = strongForAgents()
    w.store.facts(w.ctx.tenant).recipients.set('agent:a', agent('a'))
    for (const id of ['e1', 'e2', 'e3']) {
      await w.sending.send(w.ctx, request(id, { named: [agent('a')] }))
      await w.advance()
      w.clock.advance(MINUTE)
    }
    expect(identities(w.session.deliveries)).toEqual([['e1']])
    w.clock.set('2026-11-18T06:10:59.999Z')
    await w.advance()
    expect(w.session.deliveries).toHaveLength(1)
    w.clock.set('2026-11-18T06:11:00.000Z')
    await w.advance()
    expect(identities(w.session.deliveries)).toEqual([['e1'], ['e2', 'e3']])
    const [first, second] = w.session.deliveries.map(delivery => Date.parse(delivery.unit.formedAt))
    expect(second! - first!).toBeGreaterThanOrEqual(10 * MINUTE)
    w.clock.set('2026-11-18T06:25:00.000Z')
    await w.advance()
    expect(w.session.deliveries).toHaveLength(2)
  })
})
