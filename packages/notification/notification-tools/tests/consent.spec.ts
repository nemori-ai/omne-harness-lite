import { describe, expect, it } from 'vitest'
import { cardIdOf } from '@omne-harness/notification-tools'
import { confirmationContent, type SubscriptionChange } from '@omne-harness/notification-contract'
import { CONSENT_STATE_MAX_BYTES, encodeConsentState } from '../src/consent.ts'
import { agent, caller, domain, selected } from './world.ts'

const params = {
  source: 'demo.things',
  type: 'changed',
  level: 'strong',
  scope: { kind: 'subject', equals: 'repo/a' },
  note: 'open a card when it fails',
}
const change = (ref = 'a1') =>
  ({
    ...params,
    recipient: agent(ref),
    term: { kind: 'standing' },
  }) as unknown as SubscriptionChange

/** The first segment of a subscribe the owner has to confirm, with what it kept. */
async function asked(ref = 'a1') {
  const d = domain()
  const a = caller(d, ref)
  const segment = await a.suspended('subscribe', params)
  const state = JSON.parse(new TextDecoder().decode(segment.state))
  return { d, a, segment, state, cardId: state.cardId as string }
}
const decoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('subscribe when the owner asks to confirm', () => {
  it('suspends on one inquiry card that says who wants what, and writes nothing', async () => {
    const { d, segment, state, cardId } = await asked()
    const content = confirmationContent(d.owner.tenant, change())
    expect(state).toEqual({ params, content, cardId: cardIdOf(content) })
    expect(segment.wait).toMatchObject({ kind: 'ask', key: 'consent' })
    const request = JSON.stringify(segment.wait.request)
    for (const text of [
      'agent「a1」',
      'Demo：Label of changed',
      'demo.things / changed',
      '对象是「repo/a」',
      '强提醒',
      '一直有效',
      'open a card when it fails',
      '"approve"',
      '"reject"',
      cardId,
    ])
      expect(request, text).toContain(text)
    expect(segment.closedResult).toMatch(/^owner-skipped: .*nothing was changed$/)
    expect(d.store.commits()).toBe(0)
  })

  it('names the event type alone when the catalogue cannot answer', async () => {
    const d = domain()
    const a = caller(d, 'a1', {
      faces: () => ({
        ...d.faces,
        catalog: { sources: async () => Promise.reject(new Error('down')) },
      }),
    })
    const segment = await a.suspended('subscribe', params)
    expect(JSON.stringify(segment.wait.request)).toContain('agent 想订阅「changed」')
  })

  it('an approval sets the subscription with this card of this call as its basis', async () => {
    const { d, a, segment, cardId } = await asked()
    const answer = await a.resume(segment.state, selected(cardId, 'approve'))
    if (!('ok' in answer) || answer.ok.kind !== 'completed') throw new Error(JSON.stringify(answer))
    const [head, body] = answer.ok.value.split('\n')
    expect(head).toBe('done Notifications subscribe')
    expect(JSON.parse(body!)).toMatchObject({
      ...params,
      term: { kind: 'standing' },
      basis: { kind: 'granular', decision: a.bound.decisionRef(cardId) },
      recalled: false,
    })
    expect(a.bound.decisionRef(cardId)).toMatch(
      /^tool-call\/[0-9a-f]{48}\/notification-consent-[0-9a-f]{64}$/,
    )
    expect(caller(d, 'a1', { call: 'another-call' }).bound.decisionRef(cardId)).not.toBe(
      a.bound.decisionRef(cardId),
    )
    await d.emit('e1')
    expect(await a.ok('inbox')).toMatchObject({
      value: { notifications: [{ event: 'e1', level: 'strong' }] },
    })
    expect(await a.ok('subscribe', params)).toMatchObject({ value: { recalled: true } })
  })

  it.each([
    ['a rejection', (cardId: string) => selected(cardId, 'reject'), /^owner-declined: /],
    [
      'an option that is not one',
      (cardId: string) => selected(cardId, 'whatever'),
      /^owner-declined: /,
    ],
    [
      'an answer in words',
      (cardId: string) => ({
        kind: 'answer',
        value: { answers: [{ cardId, kind: 'text', text: 'not now' }] },
      }),
      /^owner-replied: .*text="not now"$/,
    ],
    ['an answer to another card', () => selected('another-card', 'approve'), /^owner-skipped: /],
    [
      'an answer that is not a selection',
      (cardId: string) => ({ kind: 'answer', value: { answers: [{ cardId, kind: 'other' }] } }),
      /^owner-skipped: /,
    ],
    ['an answer without answers', () => ({ kind: 'answer', value: {} }), /^owner-skipped: /],
    ['a closed wait', () => ({ kind: 'closed' }), /^owner-skipped: /],
  ])('%s writes nothing and fails as cancelled', async (_label, decision, reason) => {
    const { d, a, segment, cardId } = await asked()
    const answer = await a.resume(segment.state, decision(cardId) as never)
    expect(answer).toEqual({
      failure: { kind: 'cancelled', reason: expect.stringMatching(reason) },
    })
    expect(d.store.commits()).toBe(0)
    expect(await a.ok('subscriptions')).toMatchObject({ value: { subscriptions: [] } })
  })

  it('an approval of a card for another request does not set this one', async () => {
    const { d, a, state, cardId } = await asked()
    const louder = { ...state, params: { ...params, scope: { kind: 'all' } } }
    const answer = await a.resume(decoded(louder), selected(cardId, 'approve'))
    expect(answer).toEqual({
      failure: { kind: 'conflict', reason: expect.stringMatching(/^confirmation-mismatch: /) },
    })
    expect(d.store.commits()).toBe(0)
  })

  it('an approval kept by one agent does not subscribe another', async () => {
    const { d, segment, cardId } = await asked('a1')
    const other = caller(d, 'a2')
    const answer = await other.resume(segment.state, selected(cardId, 'approve'))
    expect(answer).toEqual({
      failure: { kind: 'conflict', reason: expect.stringMatching(/^confirmation-mismatch: /) },
    })
    expect(d.store.commits()).toBe(0)
  })

  it.each([
    ['bytes that are not text', new Uint8Array([0xff, 0xfe])],
    ['text that is not JSON', new TextEncoder().encode('{')],
    ['a value that is not an object', decoded(5)],
    ['a state without params', decoded({ content: 'c', cardId: cardIdOf('c') })],
    [
      'a state whose card is not the card of its content',
      decoded({ params, content: 'c', cardId: cardIdOf('d') }),
    ],
    ['a state whose content is not text', decoded({ params, content: 5, cardId: cardIdOf('5') })],
  ])('a kept state that is %s is invalid and writes nothing', async (_label, bytes) => {
    const { d, a, cardId } = await asked()
    const answer = await a.resume(bytes, selected(cardId, 'approve'))
    expect(answer).toEqual({ failure: { kind: 'invalid', reason: 'consent-state-unreadable' } })
    expect(d.store.commits()).toBe(0)
  })

  it('an approval that arrives when the services are gone is unavailable, and the same answer later takes effect', async () => {
    const d = domain()
    let present = true
    const a = caller(d, 'a1', { faces: () => (present ? d.faces : undefined) })
    const segment = await a.suspended('subscribe', params)
    const { cardId } = JSON.parse(new TextDecoder().decode(segment.state))
    present = false
    expect(await a.resume(segment.state, selected(cardId, 'approve'))).toEqual({
      failure: {
        kind: 'unavailable',
        operation: 'Notifications.subscribe',
        reason: expect.stringMatching(/not available now/),
      },
    })
    present = true
    d.store.fail('unknown-applied')
    expect(await a.resume(segment.state, selected(cardId, 'approve'))).toMatchObject({
      failure: { kind: 'unknown', operation: 'Notifications.subscribe' },
    })
    expect(await a.resume(segment.state, selected(cardId, 'approve'))).toMatchObject({
      ok: { kind: 'completed', value: expect.stringContaining('"recalled":true') },
    })
  })

  it('does not ask the owner when the change needs no consent or is refused outright', async () => {
    const d = domain()
    const a = caller(d)
    d.consent.set({ kind: 'automatic', generation: 3 })
    await a.ok('subscribe', params)
    d.consent.set({ kind: 'per-request' })
    expect(await a.ok('subscribe', { ...params, level: 'weak' })).toMatchObject({
      value: { level: 'weak', basis: { kind: 'blanket', generation: 3 }, recalled: false },
    })
    expect(
      await a.failure('subscribe', { source: 'demo.things', type: 'for-people', level: 'weak' }),
    ).toMatchObject({
      reason: expect.stringMatching(/^not-subscribable: /),
    })
    d.consent.set('unavailable')
    expect(await a.failure('subscribe', params)).toMatchObject({ kind: 'unavailable' })
  })

  it('refuses to keep a state over the declared limit instead of cutting it', () => {
    const state = { params: params as never, content: 'c', cardId: cardIdOf('c') }
    const fits = encodeConsentState(state)
    expect('ok' in fits && JSON.parse(new TextDecoder().decode(fits.ok))).toEqual(state)
    const exact = { ...state, content: 'c'.repeat(CONSENT_STATE_MAX_BYTES) }
    expect(encodeConsentState(exact)).toEqual({ failure: 'consent-state-too-large' })
    const room =
      CONSENT_STATE_MAX_BYTES - new TextEncoder().encode(JSON.stringify(state)).byteLength
    const full = encodeConsentState({ ...state, content: `c${'x'.repeat(room)}` })
    expect('ok' in full && full.ok.byteLength).toBe(CONSENT_STATE_MAX_BYTES)
    expect(encodeConsentState({ ...state, content: `c${'x'.repeat(room + 1)}` })).toHaveProperty(
      'failure',
    )
  })

  it('keeps a state that fits its limit even for the longest subscribe the schema takes', async () => {
    const d = domain()
    const a = caller(d)
    const prefix = '字'.repeat(500)
    const big = { ...params, note: '字'.repeat(500), scope: { kind: 'subject-prefix', prefix } }
    const segment = await a.suspended('subscribe', big)
    expect(segment.state.byteLength).toBeLessThan(16_384)
    expect(segment.state.byteLength).toBeGreaterThan(6000)
  })
})
