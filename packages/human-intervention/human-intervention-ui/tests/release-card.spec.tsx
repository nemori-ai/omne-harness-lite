// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { CardsHub, DecisionsPage } from '../src/index.ts'
import { page, questionItem, releaseItem } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

beforeAll(stubAnimation)

afterEach(cleanup)

async function shown(item = releaseItem()) {
  const fake = createFakeClient()
  render(<DecisionsPage hub={new CardsHub({ client: fake.client })} tenant={TENANT} />)
  const call = await fake.next('list-cards')
  call.answer(page([item]))
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return within(screen.getByRole('article'))
}

const facts = (card: Awaited<ReturnType<typeof shown>>) =>
  [...card.getByText('工具').closest('dl')!.querySelectorAll('dt')].map(term => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ])

function offering(...ids: readonly string[]): HumanInterventionCardItem {
  const item = releaseItem()
  const question = item.card.question
  if (question.kind !== 'release') throw new Error('release fixture')
  const options = question.options.map(option => ({ ...option, offered: ids.includes(option.id) }))
  return { ...item, card: { ...item.card, question: { ...question, options } } }
}

const submit = () => screen.getByRole('button', { name: '提交' }) as HTMLButtonElement

describe('the release card body', () => {
  it('says whose move it is and draws the action as a title in the interface face', async () => {
    const card = await shown()
    const kind = card.getByText('需要你放行').closest('.hitl-kind') as HTMLElement
    expect(kind.dataset['waiting']).toBe('true')
    expect(card.getByRole('heading', { name: '要执行 Shell run，放行吗？' }).dataset['face']).toBe(
      'ui',
    )
    expect(card.getByText('系统要你放行这一次调用')).toBeTruthy()
  })

  it('draws the call as a fact table: the tool in mono, the gate, the session and the agent', async () => {
    const card = await shown()
    expect(facts(card)).toEqual([
      ['工具', 'Shell run ls -la'],
      ['动作类别', 'Shell：执行'],
      ['会话', 'ses_01234567…'],
      ['Agent', 'exe-1'],
    ])
    expect(card.getByText('ses_01234567…').getAttribute('title')).toBe('ses_0123456789abcdef')
    expect(card.getByText('Shell run ls -la').tagName).toBe('CODE')
    expect(card.getByText('工具').closest('dl')!.classList.contains('hitl-facts')).toBe(true)
  })

  it('keeps the arguments behind a quiet 详情, and says when they are cut short', async () => {
    const card = await shown()
    const fold = card.getByRole('button', { name: '详情' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(card.getByText('{"cmd":"ls -la"}')).toBeTruthy()
    expect(card.getByText('参数太长，只显示开头。全文摘要 digest-of-all')).toBeTruthy()
  })

  it('makes the one-time options the first rows and folds the lasting three into 这一类动作', async () => {
    const card = await shown()
    const names = () =>
      card
        .getAllByRole('radio')
        .map(radio => radio.querySelector('.omne-choice-label')?.textContent)
    expect(names()).toEqual(['本次不放行', '本次放行', '用自己的话回答', '不回答这一题'])
    fireEvent.click(card.getByRole('button', { name: '这一类动作' }))
    expect(names()).toEqual([
      '本次不放行',
      '本次放行',
      '本会话放行',
      '始终放行',
      '始终禁止',
      '用自己的话回答',
      '不回答这一题',
    ])
    for (const label of ['本次不放行', '本次放行', '本会话放行', '始终放行', '始终禁止'])
      expect(card.getByText(`${label}的作用范围`)).toBeTruthy()
  })

  it('an option it does not offer is shown and cannot be chosen', async () => {
    const card = await shown()
    fireEvent.click(card.getByRole('button', { name: '这一类动作' }))
    const radios = card.getAllByRole('radio') as HTMLButtonElement[]
    expect(radios.map(radio => radio.disabled)).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      false,
    ])
  })

  it('gives no option a default choice or focus', async () => {
    const card = await shown()
    expect(card.queryByRole('radio', { checked: true })).toBeNull()
    expect(card.getAllByRole('radio')).not.toContain(document.activeElement)
  })

  it('arms the one submit in the danger ink while a lasting option is chosen, and keeps its fold open', async () => {
    const card = await shown(offering('deny-once', 'allow-session'))
    expect(submit().dataset['variant']).toBe('default')
    const fold = card.getByRole('button', { name: '这一类动作' })
    fireEvent.click(fold)
    fireEvent.click(card.getByRole('radio', { name: '本会话放行' }))
    expect(submit().dataset['variant']).toBe('destructive')
    expect(screen.getByText('选了有持续效果的一档：以后同一类动作照它处理。')).toBeTruthy()
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(card.getByRole('radio', { name: '本次不放行' }))
    expect(submit().dataset['variant']).toBe('default')
    expect(screen.queryByText('选了有持续效果的一档：以后同一类动作照它处理。')).toBeNull()
  })
})

it('lets one answered release card be submitted while the others stay unanswered', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage hub={new CardsHub({ client: fake.client })} tenant={TENANT} />)
  const call = await fake.next('list-cards')
  call.answer(page([releaseItem('r1'), releaseItem('r2'), releaseItem('r3')]))
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  const submit = screen.getByRole('button', { name: '提交' }) as HTMLButtonElement
  expect(submit.disabled).toBe(true)
  expect(screen.getByRole('button', { name: '还差 3 题' })).toBeTruthy()
  expect(screen.queryByText(/另有/)).toBeNull()
  await act(async () => {
    ;(screen.getAllByRole('radio')[0] as HTMLButtonElement).click()
  })
  expect(submit.disabled).toBe(false)
  expect(screen.getByText('另有 2 张放行卡没答，可以先提交已答的')).toBeTruthy()
  expect(screen.getAllByRole('article')).toHaveLength(3)
})

it('draws no link at the foot of a sheet with one section', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage hub={new CardsHub({ client: fake.client })} tenant={TENANT} />)
  const call = await fake.next('list-cards')
  call.answer(page([releaseItem('r1')]))
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(screen.getByRole('button', { name: '提交' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /还差|另有/ })).toBeNull()
})

it('draws a kind it does not know with the common body, so the card is not lost', async () => {
  const known = questionItem('card-9')
  const item = {
    ...known,
    card: { ...known.card, question: { ...known.card.question, kind: 'survey' } },
  } as unknown as HumanInterventionCardItem
  const card = await shown(item)
  expect(card.getByText('survey · Ask')).toBeTruthy()
  expect(card.getByText('用哪个分支发布？')).toBeTruthy()
  expect(card.getByText('有两个候选分支。')).toBeTruthy()
  expect(card.getAllByRole('radio')).toHaveLength(4)
})
