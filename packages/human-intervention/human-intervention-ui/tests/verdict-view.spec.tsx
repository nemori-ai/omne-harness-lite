// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { CardsHub, DecisionsPage } from '../src/index.ts'
import { page, questionItem, releaseItem } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

beforeAll(stubAnimation)

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function listed(items: readonly HumanInterventionCardItem[]): Promise<FakeClient> {
  const fake = createFakeClient()
  render(<DecisionsPage hub={new CardsHub({ client: fake.client })} tenant={TENANT} />)
  const call = await fake.next('list-cards')
  call.answer(page(items))
  await settle()
  return fake
}

/** The release fixture with the given options offered now. */
function offering(...ids: readonly string[]): HumanInterventionCardItem {
  const item = releaseItem()
  const question = item.card.question
  if (question.kind !== 'release') throw new Error('release fixture')
  const options = question.options.map(option => ({ ...option, offered: ids.includes(option.id) }))
  return { ...item, card: { ...item.card, question: { ...question, options } } }
}

const ALL = ['deny-once', 'allow-once', 'allow-session', 'allow-always', 'deny-always'] as const

const foot = () => within(document.querySelector<HTMLElement>('.hitl-foot')!)

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

const glyphOf = (element: HTMLElement) =>
  element.querySelector('svg')?.getAttribute('data-icon') ?? null

const footNames = () =>
  foot()
    .getAllByRole('button')
    .map(each => each.textContent)

const DECIDED = (item: HumanInterventionCardItem) => ({
  outcome: 'succeeded',
  body: {
    kind: 'decided',
    decisionRef: {
      card: item.card.ref,
      decisionId: 'd',
      submission: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
    },
    revision: '2',
    delivery: 'pending',
  },
})

describe('钮式：一节、露在外面的选项少而短', () => {
  it('the options are the buttons at the foot, in the asker’s order: the last is the main one, the others outlined; no 提交', async () => {
    await listed([offering(...ALL)])
    expect(footNames()).toEqual(['本次不放行', '本次放行'])
    expect(button('本次不放行').dataset['variant']).toBe('outline')
    expect(button('本次放行').dataset['variant']).toBe('default')
    expect(screen.queryByRole('button', { name: '提交' })).toBeNull()
    expect(screen.queryByRole('radio', { name: '本次放行' })).toBeNull()
  })

  it('P0 the buttons are in the actions part of the foot, and there is no submit part', async () => {
    await listed([offering(...ALL)])
    const verdicts = document.querySelectorAll(
      '[data-omne-part="human-intervention.paper.foot.actions"]',
    )
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0]?.classList.contains('hitl-actions')).toBe(true)
    expect(
      document.querySelectorAll('[data-omne-part="human-intervention.paper.foot.submit"]'),
    ).toHaveLength(0)
  })

  it('draws a button’s glyph from its role: approve is the check, reject the close glyph; no role, no glyph', async () => {
    await listed([offering(...ALL)])
    expect(glyphOf(button('本次不放行'))).toBe('close')
    expect(glyphOf(button('本次放行'))).toBe('done')
    cleanup()
    await listed([questionItem()])
    expect(footNames()).toEqual(['主干', '下一版'])
    expect(glyphOf(button('主干'))).toBeNull()
    expect(glyphOf(button('下一版'))).toBeNull()
  })

  it('puts an option’s description in its button’s tooltip', async () => {
    await listed([questionItem()])
    await act(async () => button('主干').focus())
    expect((await screen.findByRole('tooltip')).textContent).toBe('从主干发布。')
  })

  it('pressing an option sends that one choice at once, and the button waits while it is sent', async () => {
    const fake = await listed([offering(...ALL)])
    fireEvent.click(button('本次放行'))
    const sent = await fake.next('submit-reply')
    expect(sent.body).toMatchObject({
      reply: { kind: 'selection', optionId: 'allow-once' },
      expectedRevision: '1',
    })
    await settle()
    expect(button('本次放行').getAttribute('aria-busy')).toBe('true')
    expect(button('本次放行').querySelector('[data-loading-indicator], svg')).not.toBeNull()
    expect(glyphOf(button('本次放行'))).not.toBe('done')
    expect(button('本次不放行').disabled).toBe(true)
    expect(screen.getByText('正在提交……')).toBeTruthy()
    sent.answer(DECIDED(offering(...ALL)))
    await settle()
    expect(document.querySelector('.hitl-paper')).toBeNull()
  })

  it('an option it does not offer is a button that cannot be pressed', async () => {
    await listed([offering('deny-once')])
    expect(button('本次不放行').disabled).toBe(false)
    expect(button('本次放行').disabled).toBe(true)
  })

  it('a refused send leaves the buttons to press again; an unknown one holds them until it is confirmed', async () => {
    const fake = await listed([questionItem()])
    fireEvent.click(button('主干'))
    const first = await fake.next('submit-reply')
    first.answer({ outcome: 'basis-unavailable' })
    await settle()
    expect(screen.getByText('服务端暂时读不出需要的依据，这一题没有记上。稍后再试。')).toBeTruthy()
    expect(button('主干').disabled).toBe(false)
    fireEvent.click(button('下一版'))
    const second = await fake.next('submit-reply')
    expect(second.body).toMatchObject({ reply: { kind: 'selection', optionId: 'next' } })
    second.answer({ outcome: 'unknown' })
    await settle()
    expect(button('主干').disabled).toBe(true)
    expect(button('下一版').disabled).toBe(true)
  })
})

describe('「自己写，或不回答」与「这一类动作」两个折叠', () => {
  it('keeps 用自己的话回答 and 不回答这一题 in a quiet fold below the options, closed at first', async () => {
    await listed([questionItem()])
    const fold = button('自己写，或不回答')
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(
      screen
        .getAllByRole('radio')
        .map(radio => radio.querySelector('.omne-choice-label')?.textContent),
    ).toEqual(['用自己的话回答', '不回答这一题'])
  })

  it('choosing a row in the fold turns the buttons into 取消 and 提交; 提交 sends that choice', async () => {
    const fake = await listed([questionItem()])
    fireEvent.click(button('自己写，或不回答'))
    fireEvent.click(screen.getByRole('radio', { name: '用自己的话回答' }))
    expect(footNames()).toEqual(['取消', '提交'])
    expect(button('提交').disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '先发主干' } })
    expect(button('提交').disabled).toBe(false)
    fireEvent.click(button('提交'))
    expect((await fake.next('submit-reply')).body).toMatchObject({
      reply: { kind: 'text', text: '先发主干' },
    })
  })

  it('取消 clears the choice, folds the fold and brings the option buttons back; the words stay', async () => {
    await listed([questionItem()])
    fireEvent.click(button('自己写，或不回答'))
    fireEvent.click(screen.getByRole('radio', { name: '用自己的话回答' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '先发主干' } })
    fireEvent.click(button('取消'))
    expect(footNames()).toEqual(['主干', '下一版'])
    expect(button('自己写，或不回答').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('radio', { checked: true, hidden: true })).toBeNull()
    fireEvent.click(button('自己写，或不回答'))
    fireEvent.click(screen.getByRole('radio', { name: '用自己的话回答' }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('先发主干')
  })

  it('不回答这一题 in the fold also turns the buttons into 取消 and 提交, and keeps the fold open', async () => {
    const fake = await listed([questionItem()])
    const fold = button('自己写，或不回答')
    fireEvent.click(fold)
    fireEvent.click(screen.getByRole('radio', { name: '不回答这一题' }))
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(footNames()).toEqual(['取消', '提交'])
    fireEvent.click(button('提交'))
    expect((await fake.next('submit-reply')).body).toMatchObject({ reply: { kind: 'decline' } })
  })

  it('a lasting option chosen in 这一类动作 turns the buttons into 取消 and an armed 提交', async () => {
    const fake = await listed([offering(...ALL)])
    fireEvent.click(button('这一类动作'))
    fireEvent.click(screen.getByRole('radio', { name: '本会话放行' }))
    expect(footNames()).toEqual(['取消', '提交'])
    expect(button('提交').dataset['variant']).toBe('destructive')
    expect(screen.getByText('选了有持续效果的一档：以后同一类动作照它处理。')).toBeTruthy()
    fireEvent.click(button('取消'))
    expect(footNames()).toEqual(['本次不放行', '本次放行'])
    expect(screen.queryByText('选了有持续效果的一档：以后同一类动作照它处理。')).toBeNull()
    expect(button('这一类动作').getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button('这一类动作'))
    fireEvent.click(screen.getByRole('radio', { name: '始终放行' }))
    fireEvent.click(button('提交'))
    expect((await fake.next('submit-reply')).body).toMatchObject({
      reply: { kind: 'selection', optionId: 'allow-always' },
    })
  })
})

describe('行式：别的情形', () => {
  it('two sections: each section’s options are rows, one 提交 with the check at the foot', async () => {
    await listed([questionItem('a'), offering(...ALL)])
    expect(footNames()).toEqual(['还差 1 题', '提交'])
    expect(glyphOf(button('提交'))).toBe('done')
    expect(screen.getAllByRole('radio', { name: '主干' })).toHaveLength(1)
    expect(screen.getByRole('radio', { name: '本次放行' })).toBeTruthy()
  })

  it('four options, or a label too long for a button: rows', async () => {
    const base = questionItem()
    const question = base.card.question
    if (question.kind === 'release') throw new Error('question fixture')
    const many = ['一', '二', '三', '四'].map(label => ({ id: label, label, description: '' }))
    await listed([{ ...base, card: { ...base.card, question: { ...question, options: many } } }])
    expect(screen.getAllByRole('radio', { name: /^[一二三四]$/ })).toHaveLength(4)
    expect(footNames()).toEqual(['提交'])
    cleanup()
    const long = [{ id: 'l', label: '一个超过八个字的选项标签', description: '' }]
    await listed([{ ...base, card: { ...base.card, question: { ...question, options: long } } }])
    expect(screen.getByRole('radio', { name: '一个超过八个字的选项标签' })).toBeTruthy()
    expect(footNames()).toEqual(['提交'])
  })

  it('a card with no options: the field is there, 不回答这一题 is a quiet link that is pressed and pressed again', async () => {
    const base = questionItem()
    const question = base.card.question
    if (question.kind === 'release') throw new Error('question fixture')
    const fake = await listed([
      { ...base, card: { ...base.card, question: { ...question, options: [] } } },
    ])
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button', { name: '自己写，或不回答' })).toBeNull()
    const decline = button('不回答这一题')
    expect(decline.dataset['variant']).toBe('link')
    expect(decline.getAttribute('aria-pressed')).toBe('false')
    const consequence = () =>
      screen.getByText('跳过之后这一轮按没有回答继续。').closest('[data-expand]')
    expect(consequence()?.getAttribute('data-open')).toBe('false')
    fireEvent.click(decline)
    expect(decline.getAttribute('aria-pressed')).toBe('true')
    expect(consequence()?.getAttribute('data-open')).toBe('true')
    fireEvent.click(decline)
    expect(decline.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(decline)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '自己写' } })
    expect(decline.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(decline)
    fireEvent.click(button('提交'))
    expect((await fake.next('submit-reply')).body).toMatchObject({ reply: { kind: 'decline' } })
  })
})

describe('种类行行尾的相对时间', () => {
  const asked = (item: HumanInterventionCardItem, minutes: number): HumanInterventionCardItem => ({
    ...item,
    askedAt: new Date(Date.now() - minutes * 60_000).toISOString(),
  })

  it('writes when the card was asked with Ago at the end of the kind line, the instant in its hint', async () => {
    const item = asked(questionItem(), 5)
    await listed([item])
    const time = document.querySelector<HTMLElement>('.hitl-kind time')!
    expect(time.textContent).toBe('5 分钟前')
    expect(time.getAttribute('datetime')).toBe(item.askedAt)
    expect(time.getAttribute('title')).not.toBe('')
    expect(time.closest('.hitl-kind-trail')).not.toBeNull()
  })

  it('writes nothing when the card has no time; with more than one section the dots say which one, so no n / m', async () => {
    await listed([questionItem()])
    expect(document.querySelector('.hitl-kind time')).toBeNull()
    expect(document.querySelector('.hitl-kind-trail')).toBeNull()
    cleanup()
    await listed([asked(questionItem('a'), 2), questionItem('b')])
    const trails = [...document.querySelectorAll('.hitl-kind-trail')]
    expect(trails.map(trail => trail.textContent)).toEqual(['2 分钟前'])
    expect(trails[0]?.lastElementChild?.tagName).toBe('TIME')
  })
})
