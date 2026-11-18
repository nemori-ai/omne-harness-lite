import { describe, expect, it } from 'vitest'
import { attachNotifications, notificationsOf } from '@omne-harness/notification-tools'
import { agent, caller, domain, person } from './world.ts'

const post = (id: string) => ({ id, title: `Title ${id}` })

describe('every refusal the domain can answer', () => {
  /** The class of each reason. The text after the reason says what to do and is never empty. */
  const KINDS = {
    'invalid-request': 'invalid',
    'invalid-source-name': 'invalid',
    'incomplete-identity': 'invalid',
    'invalid-scope': 'invalid',
    'invalid-term': 'invalid',
    'content-too-large': 'too-large',
    'too-large': 'too-large',
    'not-permitted': 'unsupported',
    conflict: 'conflict',
    'unknown-event-type': 'invalid',
    'standing-type': 'invalid',
    'invalid-subject': 'invalid',
    'naming-not-allowed': 'unsupported',
    'recipient-not-admissible': 'invalid',
    'causal-depth-exceeded': 'unsupported',
    'not-found': 'invalid',
    'restore-first': 'conflict',
    superseded: 'conflict',
    'term-in-past': 'invalid',
    'not-subscribable': 'unsupported',
    'scope-does-not-fit': 'invalid',
    'not-own-recipient': 'unsupported',
    'confirmation-mismatch': 'conflict',
  } as const

  async function refusing(reason: string) {
    const d = domain()
    const sending = { ...d.faces.sending, send: async () => ({ kind: 'refused', reason }) }
    const a = caller(d, 'a1', { faces: () => ({ ...d.faces, sending }) as never })
    return a.failure('send', post('p1'))
  }

  it.each(Object.entries(KINDS))(
    '%s is a %s failure that says what to do',
    async (reason, kind) => {
      const failure = await refusing(reason)
      expect(failure.kind).toBe(kind)
      expect(failure.reason).toMatch(new RegExp(`^${reason}: \\w.{15,}$`))
      expect(Object.keys(failure).sort()).toEqual(['kind', 'reason'])
    },
  )

  it('no two reasons share their advice', async () => {
    const advice = new Set<string>()
    for (const reason of Object.keys(KINDS))
      advice.add((await refusing(reason)).reason.slice(reason.length))
    expect(advice.size).toBe(Object.keys(KINDS).length)
  })
})

describe('what a result says about marks', () => {
  it('a post without a body is posted with an empty one', async () => {
    const d = domain()
    await caller(d).ok('send', post('p1'))
    const [stored] = [...d.store.facts(d.owner.tenant).sends.values()]
    expect(stored!.event.content).toEqual({ title: 'Title p1', body: '', locator: null })
  })

  it('sent and inbox show what was marked seen', async () => {
    const d = domain()
    const a = caller(d)
    await a.ok('send', post('p1'))
    const [mine] = await d.boxOf(person)
    await d.faces.inbox.mark(d.owner, { recipient: person, identity: mine!.identity }, 'seen')
    expect(await a.ok('sent', { id: 'p1' })).toMatchObject({
      value: { recipients: [{ recipient: person, seen: true, state: 'unresolved' }] },
    })
    await d.emit('e1', { named: [a.self] })
    await d.emit('e2', { named: [a.self] })
    const [first] = await d.boxOf(a.self)
    await d.faces.inbox.mark(d.owner, { recipient: a.self, identity: first!.identity }, 'seen')
    expect(await a.ok('inbox')).toMatchObject({
      value: {
        notifications: [
          { event: 'e1', seen: true },
          { event: 'e2', seen: false },
        ],
      },
    })
  })
})

describe('the names an agent gives', () => {
  it('an id takes 64 characters and a replace key 120, and one more is invalid', async () => {
    const d = domain()
    const a = caller(d)
    const longest = { id: 'i'.repeat(64), title: 'T', replace: 'r'.repeat(120) }
    expect(await a.ok('send', longest)).toMatchObject({ value: { recalled: false } })
    expect(await a.failure('send', { ...longest, id: 'i'.repeat(65) })).toMatchObject({
      kind: 'invalid',
      reason: expect.stringMatching(/^id: /),
    })
    expect(
      await a.failure('send', { ...longest, id: 'p2', replace: 'r'.repeat(121) }),
    ).toMatchObject({
      kind: 'invalid',
      reason: expect.stringMatching(/^replace: /),
    })
    expect(await a.failure('send', { id: 'p3', title: 'T', replace: '' })).toMatchObject({
      reason: expect.stringMatching(/^replace: /),
    })
    expect(await d.boxOf(person)).toHaveLength(1)
  })
})

describe('the services attached to a call', () => {
  it('are gone once the call finished, and the scope under them finishes once', async () => {
    const d = domain()
    const a = caller(d)
    expect(notificationsOf(a.execution.context)).toBe(a.bound)
    const first = a.execution.finish('returned')
    expect(a.execution.finish('failed')).toBe(first)
    expect(await first).toEqual({ ok: undefined })
    expect(notificationsOf(a.execution.context)).toBeUndefined()
    expect(await a.failure('inbox')).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringMatching(/not attached/),
    })
  })

  it('a later attachment on the same call is not removed by the earlier one finishing', async () => {
    const d = domain()
    const a = caller(d)
    const later = caller(d, 'a2')
    const again = attachNotifications(a.execution, later.bound)
    expect(notificationsOf(a.execution.context)).toBe(later.bound)
    await a.execution.finish('returned')
    expect(notificationsOf(again.context)).toBe(later.bound)
    await again.finish('returned')
    expect(notificationsOf(again.context)).toBeUndefined()
  })

  it('carry the limits of the scope they wrap, and name the agent by the call alone', async () => {
    const d = domain()
    const a = caller(d)
    expect(a.execution.limits).toMatchObject({ authorBufferBytes: 65536 })
    expect(a.bound.scoped(agent('a1'), 'x')).toMatch(/^[0-9a-f]{24}\.x$/)
    expect(a.bound.scoped(agent('a1'), 'x')).toBe(caller(d, 'a1').bound.scoped(agent('a1'), 'x'))
    expect(a.bound.scoped(agent('a2'), 'x')).not.toBe(a.bound.scoped(agent('a1'), 'x'))
  })
})
