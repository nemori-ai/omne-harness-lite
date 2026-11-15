// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import { DecisionsPage } from '../src/index.ts'
import { approvalItem, page, questionItem } from './fixtures/cards.ts'
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

async function listed(
  items: readonly HumanInterventionCardItem[] = [questionItem()],
): Promise<FakeClient> {
  const fake = createFakeClient()
  render(<DecisionsPage client={fake.client} tenant={TENANT} />)
  await answer(fake, 'list-cards', page(items))
  return fake
}

const card = (title: string) => within(screen.getByRole('heading', { name: title }).closest('li')!)

const choose = (scope: ReturnType<typeof card>, label: string) =>
  fireEvent.click(scope.getByText(label).closest('label')!.querySelector('[role="radio"]')!)

const submitButton = (scope: ReturnType<typeof card>) => scope.getByRole('button', { name: '提交' })

it('V1 打开时只列当前租户待定的卡：一页一百张', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage client={fake.client} tenant={TENANT} />)
  const call = await fake.next('list-cards')
  expect(call.body).toMatchObject({
    filter: { states: ['pending'] },
    cursor: null,
    limit: 100,
  })
  expect(encodeTenantText((call.body as { tenant: TenantId }).tenant)).toBe(TENANT)
  expect(screen.getByText('正在读取……')).toBeTruthy()
})

it('V2 问题卡：来自哪个会话、问题、每个选项、用自己的话、跳过', async () => {
  await listed()
  const question = card('用哪个分支发布？')
  expect(question.getByText('ses_01234567…')).toBeTruthy()
  expect(question.getByText('有两个候选分支。')).toBeTruthy()
  expect(question.getByText('从主干发布。')).toBeTruthy()
  expect(question.getAllByRole('radio')).toHaveLength(4)
  expect(question.getByText('用自己的话回答')).toBeTruthy()
  expect(question.getByText('跳过')).toBeTruthy()
  expect(question.getByText('跳过之后这一轮按没有回答继续。')).toBeTruthy()
  expect((submitButton(question) as HTMLButtonElement).disabled).toBe(true)
})

it('V3 批准卡：只列协议给的选项，没有会话时写来源', async () => {
  await listed([approvalItem()])
  const approval = card('运行 rm -rf build？')
  expect(approval.getAllByRole('radio')).toHaveLength(2)
  expect(approval.queryByText('跳过')).toBeNull()
  expect(approval.queryByText('用自己的话回答')).toBeNull()
  expect(approval.getByText('准入')).toBeTruthy()
})

it('V4 选一个选项提交：带修订号；决定了就去掉卡，说「已提交」，再取列表', async () => {
  const fake = await listed()
  const question = card('用哪个分支发布？')
  choose(question, '主干')
  fireEvent.click(submitButton(question))
  const call = await fake.next('submit-reply')
  expect(call.body).toMatchObject({
    expectedRevision: '3',
    reply: { kind: 'selection', optionId: 'main' },
    card: questionItem().card.ref,
  })
  await settle()
  expect(screen.getByText('正在提交……')).toBeTruthy()
  call.answer({
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
  expect(screen.queryByRole('heading', { name: '用哪个分支发布？' })).toBeNull()
  expect(screen.getByText('已提交。')).toBeTruthy()
  await answer(fake, 'list-cards', page([]))
  expect(screen.getByText('现在没有要你决定的事')).toBeTruthy()
})

it('V5 用自己的话：写了字才能提交；跳过：答复是跳过', async () => {
  const fake = await listed([questionItem('card-1'), questionItem('card-3')])
  const [first, second] = screen.getAllByRole('listitem').map(item => within(item))
  choose(first!, '用自己的话回答')
  expect((submitButton(first!) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(first!.getByLabelText('你的回答'), { target: { value: '先发主干' } })
  fireEvent.click(submitButton(first!))
  expect((await fake.next('submit-reply')).body).toMatchObject({
    reply: { kind: 'text', text: '先发主干' },
  })
  choose(second!, '跳过')
  fireEvent.click(submitButton(second!))
  expect((await fake.next('submit-reply')).body).toMatchObject({ reply: { kind: 'decline' } })
})

it('V6 结果未知：同一份正文认回，认回之前提交按钮不可用；仍未知时可以再确认', async () => {
  const fake = await listed()
  const question = card('用哪个分支发布？')
  choose(question, '主干')
  fireEvent.click(submitButton(question))
  const submit = await answer(fake, 'submit-reply', { outcome: 'unknown' })
  const query = await fake.next('query-submit-reply')
  expect(query.body).toEqual(submit.body)
  expect(screen.getByText('结果未知，正在确认。')).toBeTruthy()
  expect((submitButton(question) as HTMLButtonElement).disabled).toBe(true)
  query.answer({ outcome: 'unknown' })
  await settle()
  expect(screen.getByText('结果仍未知：这次确认没有说出原来那次提交了没有。')).toBeTruthy()
  expect((submitButton(question) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(question.getByRole('button', { name: '再确认一次' }))
  expect((await fake.next('query-submit-reply')).body).toEqual(submit.body)
})

it('V7 被拒：显示原因，可以再提交', async () => {
  const fake = await listed()
  const question = card('用哪个分支发布？')
  choose(question, '主干')
  fireEvent.click(submitButton(question))
  await answer(fake, 'submit-reply', { outcome: 'basis-unavailable' })
  expect(screen.getByText('服务端暂时读不出需要的依据，没有提交。稍后再试。')).toBeTruthy()
  expect((submitButton(question) as HTMLButtonElement).disabled).toBe(false)
})

it('V8 读不出：显示原因与「重试」，重试再取一次', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage client={fake.client} tenant={TENANT} />)
  await answer(fake, 'list-cards', { outcome: 'basis-unavailable' })
  expect(screen.getByText('服务端暂时读不出需要的依据，稍后再试。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await answer(fake, 'list-cards', page([]))
  expect(screen.getByText('现在没有要你决定的事')).toBeTruthy()
})

it('V9 点「刷新」再取一次；不点就不再取', async () => {
  const fake = await listed([])
  await settle()
  expect(fake.calls.filter(call => call.operation === 'list-cards')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  await answer(fake, 'list-cards', page([questionItem()]))
  expect(screen.getByRole('heading', { name: '用哪个分支发布？' })).toBeTruthy()
})

it('V10 列表不全时说出来', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage client={fake.client} tenant={TENANT} />)
  await answer(fake, 'list-cards', page([], null, 'partial'))
  expect(screen.getByText('列表不全：有的来源暂时读不出，这里没有列全。')).toBeTruthy()
})

it('V11 外壳给的租户读不懂：说明，不发请求', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage client={fake.client} tenant="not-a-tenant" />)
  await settle()
  expect(screen.getByText('外壳给的租户读不懂，这一页不能工作。')).toBeTruthy()
  expect(fake.calls).toHaveLength(0)
})
