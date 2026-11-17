// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import { CardsHub, DecisionsPage } from '../src/index.ts'
import { approvalItem, page, questionItem } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const OTHER_SESSION = 'ses_fedcba9876543210'

const hubOf = (fake: FakeClient) => new CardsHub({ client: fake.client })

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
  render(<DecisionsPage hub={hubOf(fake)} tenant={TENANT} />)
  await answer(fake, 'list-cards', page(items))
  return fake
}

type Scope = ReturnType<typeof within>

const shownCard = (): Scope => within(screen.getByRole('article'))

const choose = (scope: Scope, label: string) =>
  fireEvent.click(scope.getByText(label).closest('label')!.querySelector('[role="radio"]')!)

const write = (scope: Scope, text: string) =>
  fireEvent.change(scope.getByRole('textbox'), { target: { value: text } })

const submitButton = () => screen.getByRole('button', { name: '提交' }) as HTMLButtonElement

const titled = (title: string, cardId: string): HumanInterventionCardItem => {
  const item = questionItem(cardId)
  return { ...item, card: { ...item.card, question: { ...item.card.question, title } } }
}

const DECIDED = (item: HumanInterventionCardItem) => ({
  outcome: 'succeeded',
  body: {
    kind: 'decided',
    decisionRef: {
      card: item.card.ref,
      decisionId: 'd',
      submission: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
    },
    revision: '4',
    delivery: 'pending',
  },
})

it('V1 打开时只列当前租户待定的卡：一页一百张', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage hub={hubOf(fake)} tenant={TENANT} />)
  const call = await fake.next('list-cards')
  expect(call.body).toMatchObject({
    filter: { states: ['pending'] },
    cursor: null,
    limit: 100,
  })
  expect(encodeTenantText((call.body as { tenant: TenantId }).tenant)).toBe(TENANT)
  expect(screen.getByText('正在读取……')).toBeTruthy()
})

it('V2 问题卡：卡头写谁在问，来源另起一行，选项、常在的文本框、「不回答这一题」按钮与后果', async () => {
  await listed()
  const question = shownCard()
  expect(question.getByText('Agent 在问你')).toBeTruthy()
  expect(question.getByText('来源：工具 · Ask')).toBeTruthy()
  expect(question.getByRole('heading', { name: '用哪个分支发布？' })).toBeTruthy()
  expect(question.getByText('有两个候选分支。')).toBeTruthy()
  expect(question.getByText('从主干发布。')).toBeTruthy()
  expect(question.getAllByRole('radio')).toHaveLength(2)
  expect(question.getByText('或者用你自己的话回答：')).toBeTruthy()
  expect(question.getByRole('textbox')).toBeTruthy()
  expect(question.getByRole('button', { name: '不回答这一题' })).toBeTruthy()
  expect(question.getByText('跳过之后这一轮按没有回答继续。')).toBeTruthy()
  expect(submitButton().disabled).toBe(true)
  expect(screen.getByRole('button', { name: '还差 1 题' })).toBeTruthy()
  expect(screen.queryByRole('tablist')).toBeNull()
})

it('V3 四种卡的卡头：问询、请示、放行、扩展；请示的文本框写「用你自己的话说」', async () => {
  const base = approvalItem()
  const kindOf = (kind: 'admission' | 'extension', cardId: string): HumanInterventionCardItem => {
    const item = approvalItem(cardId)
    return { ...item, card: { ...item.card, question: { ...item.card.question, kind } } }
  }
  const fake = await listed([base, kindOf('admission', 'card-4'), kindOf('extension', 'card-6')])
  const heads = ['Agent 想先问你批不批准', '系统要你放行', '拓展件在问你']
  for (const [at, head] of heads.entries()) {
    fireEvent.click(screen.getAllByRole('tab')[at]!)
    expect(shownCard().getByText(head)).toBeTruthy()
    expect(shownCard().getByText('来源：系统放行')).toBeTruthy()
    expect(shownCard().getByText('或者用你自己的话说：')).toBeTruthy()
  }
  for (const tab of screen.getAllByRole('tab')) {
    fireEvent.click(tab)
    fireEvent.click(shownCard().getByRole('button', { name: '不回答这一题' }))
  }
  fireEvent.click(submitButton())
  expect((await fake.next('submit-reply')).body).toMatchObject({
    reply: { kind: 'decline' },
    card: base.card.ref,
  })
})

it('V4 选一个选项提交：带修订号；决定了就去掉卡，这一组收起，再取列表', async () => {
  const fake = await listed()
  choose(shownCard(), '主干')
  expect(submitButton().disabled).toBe(false)
  fireEvent.click(submitButton())
  const call = await fake.next('submit-reply')
  expect(call.body).toMatchObject({
    expectedRevision: '3',
    reply: { kind: 'selection', optionId: 'main' },
    card: questionItem().card.ref,
  })
  await settle()
  expect(screen.getByText('正在提交……')).toBeTruthy()
  call.answer(DECIDED(questionItem()))
  await settle()
  expect(screen.queryByRole('heading', { name: '用哪个分支发布？' })).toBeNull()
  await answer(fake, 'list-cards', page([]))
  expect(screen.getByText('现在没有要你决定的事')).toBeTruthy()
})

it('V5 用自己的话：打字就取消选中，写了字才算答；只写空白不算', async () => {
  const fake = await listed()
  const question = shownCard()
  choose(question, '主干')
  write(question, '   ')
  expect(question.queryByRole('radio', { checked: true })).toBeNull()
  expect(submitButton().disabled).toBe(true)
  write(question, '先发主干')
  fireEvent.click(submitButton())
  expect((await fake.next('submit-reply')).body).toMatchObject({
    reply: { kind: 'text', text: '先发主干' },
  })
})

it('V6 结果未知：同一份正文认回，认回之前这一题不能再交；仍未知时可以再确认', async () => {
  const fake = await listed()
  choose(shownCard(), '主干')
  fireEvent.click(submitButton())
  const submit = await answer(fake, 'submit-reply', { outcome: 'unknown' })
  const query = await fake.next('query-submit-reply')
  expect(query.body).toEqual(submit.body)
  expect(screen.getByText('结果未知，正在确认。')).toBeTruthy()
  expect(submitButton().disabled).toBe(true)
  query.answer({ outcome: 'unknown' })
  await settle()
  expect(screen.getByText('结果仍未知：这次确认没有说出原来那次提交了没有。')).toBeTruthy()
  expect(submitButton().disabled).toBe(true)
  fireEvent.click(shownCard().getByRole('button', { name: '再确认一次' }))
  expect((await fake.next('query-submit-reply')).body).toEqual(submit.body)
})

it('V7 被拒：这一题写明原因，填的还在，可以再提交', async () => {
  const fake = await listed()
  choose(shownCard(), '主干')
  fireEvent.click(submitButton())
  await answer(fake, 'submit-reply', { outcome: 'basis-unavailable' })
  expect(screen.getByText('服务端暂时读不出需要的依据，这一题没有记上。稍后再试。')).toBeTruthy()
  expect(shownCard().getByRole('radio', { checked: true })).toBeTruthy()
  expect(submitButton().disabled).toBe(false)
})

it('V8 读不出：显示原因与「重试」，重试再取一次', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage hub={hubOf(fake)} tenant={TENANT} />)
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
  render(<DecisionsPage hub={hubOf(fake)} tenant={TENANT} />)
  await answer(fake, 'list-cards', page([], null, 'partial'))
  expect(screen.getByText('列表不全：有的来源暂时读不出，这里没有列全。')).toBeTruthy()
})

it('V11 外壳给的租户读不懂：说明，不发请求', async () => {
  const fake = createFakeClient()
  render(<DecisionsPage hub={hubOf(fake)} tenant="not-a-tenant" />)
  await settle()
  expect(screen.getByText('外壳给的租户读不懂，这一页不能工作。')).toBeTruthy()
  expect(fake.calls).toHaveLength(0)
  expect(fake.observations).toHaveLength(0)
})

it('V12 一帧来了就重读，新的卡出现', async () => {
  const fake = await listed([])
  expect(fake.observations[0]!.open).toMatchObject({ tenant: expect.anything() })
  fake.observations[0]!.frame()
  await settle()
  await answer(fake, 'list-cards', page([questionItem()]))
  expect(screen.getByRole('heading', { name: '用哪个分支发布？' })).toBeTruthy()
})

it('V13 更新断了：说正在重连；被拒：说没有权限接收更新', async () => {
  const fake = await listed([])
  fake.observations[0]!.end({ kind: 'unavailable' })
  await settle()
  expect(screen.getByText('更新暂时连不上，列表可能不是最新的，正在重连。')).toBeTruthy()
  cleanup()
  const other = await listed([])
  other.observations[0]!.end({ kind: 'refused', outcome: 'denied' })
  await settle()
  expect(screen.getByText('没有权限接收更新，或登录已失效。')).toBeTruthy()
  expect(screen.queryByText('更新暂时连不上，列表可能不是最新的，正在重连。')).toBeNull()
})

it('V14 按会话分组：每组一个标题、一个提交；不属于会话的卡单独一组', async () => {
  const elsewhere: HumanInterventionCardItem = {
    ...questionItem('card-9'),
    origin: { kind: 'tool', sessionRef: OTHER_SESSION, toolCallRef: 'call-9' },
  }
  await listed([questionItem(), elsewhere, approvalItem()])
  const groups = screen.getAllByRole('region')
  expect(groups.map(group => group.getAttribute('aria-label'))).toEqual([
    '会话 ses_01234567…',
    '会话 ses_fedcba98…',
    '不属于会话的问题',
  ])
  for (const group of groups)
    expect(within(group).getAllByRole('button', { name: '提交' })).toHaveLength(1)
})

it('V15 一组三题：题号条、左右切换三种办法、选了跳到下一张没答的、还差 n 题跳到第一张没答的', async () => {
  await listed([titled('第一问', 'card-a'), titled('第二问', 'card-b'), titled('第三问', 'card-c')])
  const tabs = () => screen.getAllByRole('tab')
  expect(tabs().map(tab => tab.textContent)).toEqual(['1未答', '2未答', '3未答'])
  expect(shownCard().getByText('第 1 题，共 3 题')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '下一题' }))
  expect(shownCard().getByRole('heading', { name: '第二问' })).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('button', { name: '上一题' }), { key: 'ArrowLeft' })
  expect(shownCard().getByRole('heading', { name: '第一问' })).toBeTruthy()
  fireEvent.click(tabs()[2]!)
  expect(shownCard().getByRole('heading', { name: '第三问' })).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' })
  expect(shownCard().getByRole('heading', { name: '第三问' })).toBeTruthy()
  choose(shownCard(), '主干')
  expect(shownCard().getByRole('heading', { name: '第一问' })).toBeTruthy()
  expect(tabs()[2]!.textContent).toBe('3已答：主干')
  write(shownCard(), '再说')
  expect(shownCard().getByRole('heading', { name: '第一问' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '还差 1 题' }))
  expect(shownCard().getByRole('heading', { name: '第二问' })).toBeTruthy()
  fireEvent.click(shownCard().getByRole('button', { name: '不回答这一题' }))
  expect(tabs().map(tab => tab.textContent)).toEqual([
    '1已答：再说',
    '2已答：不回答',
    '3已答：主干',
  ])
  expect(submitButton().disabled).toBe(false)
})

it('V16 一组三题一次提交：每题各交一次、依次发出；结局逐题，没记上的留着人填的，点「知道了」去掉', async () => {
  const [a, b, c] = [
    titled('第一问', 'card-a'),
    titled('第二问', 'card-b'),
    titled('第三问', 'card-c'),
  ]
  const fake = await listed([a, b, c])
  choose(shownCard(), '主干')
  choose(shownCard(), '下一版')
  write(shownCard(), '第三题我自己说')
  fireEvent.click(submitButton())
  const first = await fake.next('submit-reply')
  await settle()
  expect(fake.calls.filter(call => call.operation === 'submit-reply')).toHaveLength(1)
  expect(screen.getByText('正在提交……')).toBeTruthy()
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  first.answer({
    outcome: 'succeeded',
    body: {
      kind: 'already-decided',
      decision: {
        ref: {
          card: a.card.ref,
          decisionId: 'd-0',
          submission: { tenantRef: 't', actorRef: 'b', operationId: 'o0' },
        },
        reply: { kind: 'decline' },
        basisRef: 'b',
        commitReceipt: 'c',
      },
    },
  })
  await settle()
  const second = await answer(fake, 'submit-reply', {
    outcome: 'succeeded',
    body: { kind: 'invalidated', reason: 'cancelled' },
  })
  const third = await answer(fake, 'submit-reply', DECIDED(c))
  const replies = [first, second, third].map(
    call => call.body as { card: unknown; replyId: string; reply: unknown },
  )
  expect(replies.map(body => body.card)).toEqual([a.card.ref, b.card.ref, c.card.ref])
  expect(new Set(replies.map(body => body.replyId)).size).toBe(3)
  expect(replies.map(body => body.reply)).toEqual([
    { kind: 'selection', optionId: 'main' },
    { kind: 'selection', optionId: 'next' },
    { kind: 'text', text: '第三题我自己说' },
  ])
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['1被关掉', '2被关掉'])
  expect(shownCard().getByText('已在别处答了，这次的答复没有采用。')).toBeTruthy()
  expect(shownCard().getByRole('radio', { checked: true })).toBeTruthy()
  fireEvent.click(shownCard().getByRole('button', { name: '知道了' }))
  expect(shownCard().getByText('这次提问已经关掉：那一轮被取消了。')).toBeTruthy()
  fireEvent.click(shownCard().getByRole('button', { name: '知道了' }))
  expect(screen.queryByRole('article')).toBeNull()
})
