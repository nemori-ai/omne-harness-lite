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
const LABEL = '这个会话待答的问题'

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

const region = () => screen.queryByRole('region', { name: LABEL })

const pick = (scope: ReturnType<typeof within>, label: string) =>
  fireEvent.click(scope.getByText(label).closest('label')!.querySelector('[role="radio"]')!)

describe('会话里的卡', () => {
  it('C1 只显示来源会话等于这个会话的卡', async () => {
    const { fake, hub } = setup()
    render(<SessionCards hub={hub} tenant={TENANT} session={SESSION} />)
    await answer(fake, 'list-cards', page([questionItem(), OTHER_CARD, approvalItem()]))
    const shown = region()!
    expect(shown.className).toBe('hitl-session-cards')
    expect(within(shown).getAllByRole('article')).toHaveLength(1)
    expect(within(shown).queryByRole('tablist')).toBeNull()
    expect(within(shown).getByText('Agent 在问你')).toBeTruthy()
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

  it('C4 页面与会话里读同一份：会话里填的页面上也看得到；会话里提交，两处都在提交；记下后两处都收起', async () => {
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
    pick(inSessionView, '主干')
    const mineInPage = within(inPage.getByRole('region', { name: '会话 ses_01234567…' }))
    expect(mineInPage.getByRole('radio', { checked: true })).toBeTruthy()
    fireEvent.click(inSessionView.getByRole('button', { name: '提交' }))
    const submit = await fake.next('submit-reply')
    await settle()
    expect(inSessionView.getByText('正在提交……')).toBeTruthy()
    expect(mineInPage.getByText('正在提交……')).toBeTruthy()
    submit.answer({
      outcome: 'succeeded',
      body: {
        kind: 'decided',
        decisionRef: {
          card: questionItem().card.ref,
          decisionId: 'd',
          submission: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
        },
        revision: '4',
        delivery: 'pending',
      },
    })
    await settle()
    expect(region()).toBeNull()
    expect(inPage.queryByRole('region', { name: '会话 ses_01234567…' })).toBeNull()
    expect(inPage.getAllByRole('article')).toHaveLength(1)
    await answer(fake, 'list-cards', page([OTHER_CARD]))
    expect(count(fake, 'list-cards')).toBe(2)
    expect(count(fake, 'submit-reply')).toBe(1)
    expect(fake.observations).toHaveLength(1)
  })

  it('C5 被关掉的题只出现在它那个会话', async () => {
    const { fake, hub } = setup()
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
    await answer(fake, 'list-cards', page([questionItem(), OTHER_CARD]))
    const mine = within(screen.getByTestId('mine'))
    pick(mine, '主干')
    fireEvent.click(mine.getByRole('button', { name: '提交' }))
    await answer(fake, 'submit-reply', {
      outcome: 'succeeded',
      body: { kind: 'invalidated', reason: 'archived' },
    })
    expect(mine.getByText('这次提问已经关掉：会话已归档。')).toBeTruthy()
    expect(
      within(screen.getByTestId('other')).queryByText('这次提问已经关掉：会话已归档。'),
    ).toBeNull()
  })

  it('C6 卡片区上方的等待提示：数随卡变；没有待答的卡时不写', async () => {
    const { fake, hub } = setup()
    render(<SessionCards hub={hub} tenant={TENANT} session={SESSION} />)
    const second = inSession(questionItem('card-8'), SESSION)
    await answer(fake, 'list-cards', page([questionItem(), second, OTHER_CARD]))
    expect(
      within(region()!).getByText('Agent 在等你回答 2 个问题。在这里发的消息会排队，不算回答。'),
    ).toBeTruthy()
    fake.observations[0]!.frame()
    await answer(fake, 'list-cards', page([second]))
    expect(
      within(region()!).getByText('Agent 在等你回答 1 个问题。在这里发的消息会排队，不算回答。'),
    ).toBeTruthy()
    fake.observations[0]!.frame()
    await answer(fake, 'list-cards', page([]))
    expect(region()).toBeNull()
  })

  it('C7 读不出：照实说读不出与原因，给「重试」，不当成没有卡', async () => {
    const { fake, hub } = setup()
    render(<SessionCards hub={hub} tenant={TENANT} session={SESSION} />)
    await answer(fake, 'list-cards', { outcome: 'basis-unavailable' })
    const shown = within(region()!)
    expect(
      shown.getByText('这个会话的问题读不出来：服务端暂时读不出需要的依据，稍后再试。'),
    ).toBeTruthy()
    fireEvent.click(shown.getByRole('button', { name: '重试' }))
    await answer(fake, 'list-cards', page([questionItem()]))
    expect(within(region()!).getByRole('article')).toBeTruthy()
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
