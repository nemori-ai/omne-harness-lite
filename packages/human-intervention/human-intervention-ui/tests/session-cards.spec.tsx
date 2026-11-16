// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { CardsHub, DecisionsPage, PendingBadge, SessionCards } from '../src/index.ts'
import { approvalItem, page, questionItem } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 'ses_0123456789abcdef'
const OTHER_SESSION = 'ses_fedcba9876543210'

beforeAll(stubAnimation)

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function answer(
  fake: FakeClient,
  operation: Parameters<FakeClient['next']>[0],
  value: unknown,
) {
  const call = await fake.next(operation)
  call.answer(value)
  await settle()
  return call
}

function inSession(item: HumanInterventionCardItem, sessionRef: string): HumanInterventionCardItem {
  return { ...item, origin: { kind: 'tool', sessionRef, toolCallRef: 'call-9' } }
}

const OTHER_CARD = inSession(questionItem('card-7'), OTHER_SESSION)

const count = (fake: FakeClient, operation: string) =>
  fake.calls.filter(call => call.operation === operation).length

function setup() {
  const fake = createFakeClient()
  return { fake, hub: new CardsHub({ client: fake.client }) }
}

const region = () => screen.queryByRole('region', { name: '这个会话在等你决定' })

describe('会话里的卡', () => {
  it('C1 只显示来源会话等于这个会话的卡，不显示来源', async () => {
    const { fake, hub } = setup()
    render(<SessionCards hub={hub} tenant={TENANT} session={SESSION} />)
    await answer(fake, 'list-cards', page([questionItem(), OTHER_CARD, approvalItem()]))
    const shown = region()!
    expect(shown.className).toBe('hitl-session-cards')
    expect(within(shown).getByText('这个会话在等你决定')).toBeTruthy()
    expect(within(shown).getAllByRole('listitem')).toHaveLength(1)
    expect(within(shown).queryByText('ses_01234567…')).toBeNull()
    expect(within(shown).getByText('问询')).toBeTruthy()
  })

  it('C2 这个会话没有卡：什么都不渲染', async () => {
    const { fake, hub } = setup()
    const view = render(<SessionCards hub={hub} tenant={TENANT} session={SESSION} />)
    await answer(fake, 'list-cards', page([OTHER_CARD, approvalItem()]))
    expect(view.container.innerHTML).toBe('')
  })

  it('C3 租户读不懂：什么都不渲染，不发请求', async () => {
    const { fake, hub } = setup()
    const view = render(<SessionCards hub={hub} tenant="not-a-tenant" session={SESSION} />)
    await settle()
    expect(view.container.innerHTML).toBe('')
    expect(fake.calls).toEqual([])
    expect(fake.observations).toEqual([])
  })

  it('C4 页面与会话里读同一份：一处提交，另一处同一张卡也在提交；成功后两处都消失', async () => {
    const { fake, hub } = setup()
    render(
      <>
        <div data-testid="page">
          <DecisionsPage hub={hub} tenant={TENANT} />
        </div>
        <div data-testid="session">
          <SessionCards hub={hub} tenant={TENANT} session={SESSION} />
        </div>
      </>,
    )
    await answer(fake, 'list-cards', page([questionItem(), OTHER_CARD]))
    expect(fake.observations).toHaveLength(1)
    const inSessionView = within(screen.getByTestId('session'))
    const inPage = within(screen.getByTestId('page'))
    fireEvent.click(
      inSessionView.getByText('主干').closest('label')!.querySelector('[role="radio"]')!,
    )
    fireEvent.click(inSessionView.getByRole('button', { name: '提交' }))
    const submit = await fake.next('submit-reply')
    await settle()
    expect(inSessionView.getByText('正在提交……')).toBeTruthy()
    expect(inPage.getByText('正在提交……')).toBeTruthy()
    submit.answer({ outcome: 'succeeded', body: { kind: 'invalidated', reason: 'archived' } })
    await settle()
    expect(region()).toBeNull()
    expect(inPage.queryByText('ses_01234567…')).toBeNull()
    expect(inPage.getAllByRole('listitem')).toHaveLength(1)
    expect(inPage.getByText('这张卡已经作废：会话已归档。')).toBeTruthy()
    await answer(fake, 'list-cards', page([OTHER_CARD]))
    expect(count(fake, 'list-cards')).toBe(2)
    expect(count(fake, 'submit-reply')).toBe(1)
    expect(fake.observations).toHaveLength(1)
  })

  it('C5 通知只显示说的是这个会话的卡的那一条', async () => {
    const { fake, hub } = setup()
    const second = inSession(questionItem('card-8'), SESSION)
    render(
      <>
        <div data-testid="mine">
          <SessionCards hub={hub} tenant={TENANT} session={SESSION} />
        </div>
        <div data-testid="other">
          <SessionCards hub={hub} tenant={TENANT} session={OTHER_SESSION} />
        </div>
      </>,
    )
    await answer(fake, 'list-cards', page([questionItem(), second, OTHER_CARD]))
    const mine = within(screen.getByTestId('mine'))
    const [first] = mine.getAllByRole('listitem').map(item => within(item))
    fireEvent.click(first!.getByText('主干').closest('label')!.querySelector('[role="radio"]')!)
    fireEvent.click(first!.getByRole('button', { name: '提交' }))
    await answer(fake, 'submit-reply', {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'archived' },
    })
    expect(mine.getByText('这张卡已经作废：会话已归档。')).toBeTruthy()
    expect(
      within(screen.getByTestId('other')).queryByText('这张卡已经作废：会话已归档。'),
    ).toBeNull()
  })
})

describe('导航上的张数', () => {
  it('B1 张数随列表变：0 张什么都不渲染', async () => {
    const { fake, hub } = setup()
    const view = render(<PendingBadge hub={hub} tenant={TENANT} />)
    await answer(fake, 'list-cards', page([questionItem(), approvalItem()]))
    expect(view.container.textContent).toBe('2')
    fake.observations[0]!.frame()
    await answer(fake, 'list-cards', page([]))
    expect(view.container.innerHTML).toBe('')
  })

  it('B2 超过 99 张显示「99+」', async () => {
    const { fake, hub } = setup()
    const view = render(<PendingBadge hub={hub} tenant={TENANT} />)
    const many = Array.from({ length: 100 }, (_, index) => questionItem(`card-${index}`))
    await answer(fake, 'list-cards', page(many))
    expect(view.container.textContent).toBe('99+')
  })

  it('B3 页面与张数读同一份：只取一次列表，只建一个观察', async () => {
    const { fake, hub } = setup()
    const view = render(
      <>
        <PendingBadge hub={hub} tenant={TENANT} />
        <DecisionsPage hub={hub} tenant={TENANT} />
      </>,
    )
    await answer(fake, 'list-cards', page([questionItem()]))
    expect(view.container.querySelector('.hitl-badge')?.textContent).toBe('1')
    expect(count(fake, 'list-cards')).toBe(1)
    expect(fake.observations).toHaveLength(1)
  })

  it('B4 全部视图卸下之后停下观察', async () => {
    const { fake, hub } = setup()
    const view = render(<PendingBadge hub={hub} tenant={TENANT} />)
    await answer(fake, 'list-cards', page([]))
    view.unmount()
    expect(fake.observations[0]!.signal.aborted).toBe(true)
  })
})
