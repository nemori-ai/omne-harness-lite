// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react'
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

describe('the release card body', () => {
  it('shows the call as one summary line, its arguments on demand and where it comes from', async () => {
    const card = await shown()
    expect(card.getByText('系统要你放行这一次调用')).toBeTruthy()
    expect(card.getByText('Shell run ls -la').tagName).toBe('CODE')
    const details = card.getByText('参数').closest('details')!
    expect(details.open).toBe(false)
    expect(within(details).getByText('{"cmd":"ls -la"}')).toBeTruthy()
    expect(within(details).getByText('参数太长，只显示开头。全文摘要 digest-of-all')).toBeTruthy()
    expect(card.getByText('会话 ses_0123456789abcdef · Agent exe-1')).toBeTruthy()
  })

  it('names the gate of the action, which every lasting option governs', async () => {
    const card = await shown()
    expect(card.getByText('归「Shell：执行」这一类动作')).toBeTruthy()
  })

  it('shows the five options with their scope, one-time apart from lasting', async () => {
    const card = await shown()
    const groups = card
      .getAllByRole('radio')
      .map(radio => radio.closest('.hitl-release-group')!.getAttribute('data-lasting'))
    expect(groups).toEqual(['false', 'false', 'true', 'true', 'true'])
    for (const label of ['本次不放行', '本次放行', '本会话放行', '始终放行', '始终禁止'])
      expect(card.getByText(`${label}的作用范围`)).toBeTruthy()
  })

  it('an option it does not offer is shown and cannot be chosen', async () => {
    const card = await shown()
    const radios = card.getAllByRole('radio') as HTMLButtonElement[]
    expect(radios.map(radio => radio.disabled)).toEqual([false, true, true, true, true])
  })

  it('gives no option a default choice or focus', async () => {
    const card = await shown()
    expect(card.queryByRole('radio', { checked: true })).toBeNull()
    expect(card.getAllByRole('radio')).not.toContain(document.activeElement)
  })
})

it('draws a kind it does not know with the common body, so the card is not lost', async () => {
  const known = questionItem('card-9')
  const item = {
    ...known,
    card: { ...known.card, question: { ...known.card.question, kind: 'survey' } },
  } as unknown as HumanInterventionCardItem
  const card = await shown(item)
  expect(card.getByText('survey')).toBeTruthy()
  expect(card.getByText('用哪个分支发布？')).toBeTruthy()
  expect(card.getByText('有两个候选分支。')).toBeTruthy()
  expect(card.getAllByRole('radio')).toHaveLength(2)
})
