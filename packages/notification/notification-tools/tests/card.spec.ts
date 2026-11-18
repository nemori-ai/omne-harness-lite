import { writeJsonText } from '@omne-harness/json-text'
import type { SubscriptionChange } from '@omne-harness/notification-contract'
import { cardIdOf } from '@omne-harness/notification-tools'
import { describe, expect, it } from 'vitest'
import { requestTree } from '../src/consent.ts'
import { agent, caller, domain, selected } from './world.ts'

const params = { source: 'demo.things', type: 'changed', level: 'strong' }
const questionOf = (segment: { wait: { request: unknown } }) =>
  JSON.parse(writeJsonText(segment.wait.request as never)).questions[0] as {
    title: string
    description: string
    declineConsequence: string
    options: { id: string; label: string; description: string }[]
  }
const decoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('the card the owner reads', () => {
  it('names the agent, the notifications it wants, and what each answer does', async () => {
    const question = questionOf(await caller(domain(), 'a7').suspended('subscribe', params))
    expect(question).toMatchObject({
      title: 'agent 想订阅「Demo：Label of changed」',
      description: [
        'agent「a7」想订阅通知，需要你确认。',
        '通知：Demo：Label of changed（demo.things / changed）',
        '范围：全部；级别：强提醒；期限：一直有效',
      ].join('\n'),
      declineConsequence: '不建这条订阅，原来的设置不变。',
      options: [
        { id: 'approve', label: '同意', description: '这个 agent 之后会收到这类通知。' },
        { id: 'reject', label: '不同意', description: '不建这条订阅，原来的设置不变。' },
      ],
    })
  })

  it.each([
    [
      { scope: { kind: 'subject', equals: 'repo/a' } },
      '范围：对象是「repo/a」；级别：强提醒；期限：一直有效',
    ],
    [
      { scope: { kind: 'subject-prefix', prefix: 'repo/' } },
      '范围：对象以「repo/」开头；级别：强提醒',
    ],
    [{ level: 'weak', term: { kind: 'once' } }, '范围：全部；级别：弱提醒；期限：只收下一条'],
    [
      { term: { kind: 'until', at: '2026-12-01T00:00:00.000Z' } },
      '期限：到 2026-12-01T00:00:00.000Z 为止',
    ],
  ])('says the scope, the level and the term of %j', async (more, text) => {
    const question = questionOf(
      await caller(domain()).suspended('subscribe', { ...params, ...more }),
    )
    expect(question.description.split('\n')[2]).toContain(text)
    expect(question.description.split('\n')).toHaveLength(3)
  })

  it('shows the note the agent wrote on a line of its own', async () => {
    const segment = await caller(domain()).suspended('subscribe', {
      ...params,
      note: 'open a card',
    })
    expect(questionOf(segment).description.split('\n')[3]).toBe('它写的备注：open a card')
  })

  const hidden = { kind: 'done', recalled: false, value: [] }
  const without = {
    kind: 'done',
    recalled: false,
    value: [{ name: 'demo.things', label: 'Demo', types: [] }],
  }
  it.each([
    ['is refused', { kind: 'refused', reason: 'not-permitted' }],
    ['cannot read', { kind: 'basis-unavailable' }],
    ['hides the source', hidden],
    ['lists the source without the type', without],
  ])('names the event type alone when the catalogue %s', async (_label, answer) => {
    const d = domain()
    const catalog = { sources: async () => answer }
    const a = caller(d, 'a1', { faces: () => ({ ...d.faces, catalog }) as never })
    const question = questionOf(await a.suspended('subscribe', params))
    expect(question.title).toBe('agent 想订阅「changed」')
    expect(question.description).toContain('通知：changed（demo.things / changed）')
  })

  it('is cut to what a card takes when a label is very long', async () => {
    const d = domain()
    const value = [
      { name: 'demo.things', label: 'L'.repeat(5000), types: [{ name: 'changed', label: 'x' }] },
    ]
    const catalog = { sources: async () => ({ kind: 'done', recalled: false, value }) }
    const a = caller(d, 'a1', { faces: () => ({ ...d.faces, catalog }) as never })
    const question = questionOf(await a.suspended('subscribe', params))
    expect(question.title).toHaveLength(256)
    expect(question.description).toHaveLength(4096)
  })

  it('is not raised when it is not bounded JSON', () => {
    const card = { cardId: 'c', kind: 'question', title: 't', description: 'd'.repeat(70_000) }
    expect(() => requestTree(card as never)).toThrow(/not bounded JSON/)
  })
})

describe('what the call keeps while the owner decides', () => {
  it('a subscribe too long to keep is refused, and no card is raised', async () => {
    const d = domain()
    const control = String.fromCharCode(1).repeat(500)
    const failure = await caller(d).failure('subscribe', {
      ...params,
      note: control,
      scope: { kind: 'subject-prefix', prefix: control },
    })
    expect(failure).toEqual({
      kind: 'too-large',
      reason: expect.stringMatching(/^consent-state-too-large: .*shorten them$/),
    })
    expect(d.store.commits()).toBe(0)
  })

  it.each([
    ['null', null],
    [
      'params the command does not take',
      { params: { ...params, level: 'loud' }, content: 'c', cardId: cardIdOf('c') },
    ],
    ['a stray field', { params, content: 'c', cardId: cardIdOf('c'), basis: { kind: 'owner' } }],
    ['no card', { params, content: 'c' }],
  ])('a kept state with %s is unreadable', async (_label, state) => {
    const d = domain()
    const answer = await caller(d).resume(decoded(state), selected(cardIdOf('c'), 'approve'))
    expect(answer).toEqual({ failure: { kind: 'invalid', reason: 'consent-state-unreadable' } })
    expect(d.store.commits()).toBe(0)
  })

  it('a domain that asks again after an approval gets no second card', async () => {
    const d = domain()
    const first = await caller(d).suspended('subscribe', params)
    const { cardId } = JSON.parse(new TextDecoder().decode(first.state))
    const change = { ...params, recipient: agent('a1') } as unknown as SubscriptionChange
    const again = { kind: 'needs-confirmation', request: { content: 'c', change } }
    const subscriptions = { ...d.faces.subscriptions, set: async () => again }
    const a = caller(d, 'a1', { faces: () => ({ ...d.faces, subscriptions }) as never })
    expect(await a.resume(first.state, selected(cardId, 'approve'))).toEqual({
      failure: { kind: 'conflict', reason: expect.stringMatching(/^confirmation-mismatch: /) },
    })
  })
})
