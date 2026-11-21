// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import { CardsHub, DecisionsPage } from '../src/index.ts'
import { extensionItem, page, questionItem, releaseItem } from './fixtures/cards.ts'
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

const section = (title: string): Scope => within(screen.getByRole('article', { name: title }))

const choose = (scope: Scope, label: string) =>
  fireEvent.click(scope.getByRole('radio', { name: label }))

const write = (scope: Scope, text: string) =>
  fireEvent.change(scope.getByRole('textbox'), { target: { value: text } })

const words = (scope: Scope, text: string) => {
  choose(scope, '用自己的话回答')
  write(scope, text)
}

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

it('V2 问题卡是纸上的一节：种类行、标题、说明、谁在问，作答是一组选择行；没有题号条', async () => {
  await listed()
  const question = shownCard()
  const kind = question.getByText('需要你回答').closest('.hitl-kind') as HTMLElement
  expect(kind.dataset['waiting']).toBe('true')
  expect(kind.textContent).toBe('需要你回答')
  expect(question.getByRole('heading', { name: '用哪个分支发布？' }).dataset['face']).toBe(
    'reading',
  )
  expect(question.getByText('有两个候选分支。')).toBeTruthy()
  expect(question.getByText('Agent 在问你 · Ask')).toBeTruthy()
  expect(question.getByRole('radiogroup', { name: '作答' })).toBeTruthy()
  expect(
    question.getAllByRole('radio').map((radio: HTMLElement) => radio.getAttribute('aria-checked')),
  ).toEqual(['false', 'false', 'false', 'false'])
  for (const label of ['主干', '下一版', '用自己的话回答', '不回答这一题'])
    expect(question.getByRole('radio', { name: label })).toBeTruthy()
  expect(
    question.getByRole('radio', { name: '主干' }).getAttribute('aria-describedby'),
  ).toBeTruthy()
  expect(question.queryByRole('textbox')).toBeNull()
  expect(submitButton().disabled).toBe(true)
  expect(screen.queryByRole('button', { name: /还差|另有/ })).toBeNull()
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(document.querySelectorAll('.hitl-paper')).toHaveLength(1)
})

it('V2b 选中「不回答这一题」时它下面写卡写明的跳过后果；没有选项的卡文本框直接在', async () => {
  const bare = questionItem('card-bare')
  const fake = await listed([
    questionItem(),
    {
      ...bare,
      card: {
        ...bare.card,
        question: { ...bare.card.question, title: '没有选项', options: [] },
      },
    },
  ])
  const question = section('用哪个分支发布？')
  const consequence = () =>
    question.getByText('跳过之后这一轮按没有回答继续。').closest('[data-expand]')
  expect(consequence()?.getAttribute('data-open')).toBe('false')
  choose(question, '不回答这一题')
  expect(consequence()?.getAttribute('data-open')).toBe('true')
  const open = section('没有选项')
  expect(open.queryByRole('radio', { name: '用自己的话回答' })).toBeNull()
  expect(open.getAllByRole('radio')).toHaveLength(1)
  write(open, '自己写')
  fireEvent.click(submitButton())
  expect((await fake.next('submit-reply')).body).toMatchObject({ reply: { kind: 'decline' } })
})

it('V3 扩展卡：种类行「需要你回答」，谁在问写「拓展件在问你」；选「不回答这一题」交 decline', async () => {
  const base = extensionItem()
  const fake = await listed([base])
  expect(shownCard().getByText('需要你回答')).toBeTruthy()
  expect(shownCard().getByText('拓展件在问你')).toBeTruthy()
  choose(shownCard(), '不回答这一题')
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
  expect(document.querySelector('.hitl-paper')).toBeNull()
  await answer(fake, 'list-cards', page([]))
  expect(screen.getByText('待答的问题会在这里等你。')).toBeTruthy()
})

it('V5 用自己的话：选中这一行才展开文本框，写了字才算答，只写空白不算', async () => {
  const fake = await listed()
  const question = shownCard()
  choose(question, '主干')
  words(question, '   ')
  expect(question.getByRole('radio', { checked: true }).getAttribute('aria-labelledby')).toBe(
    question.getByText('用自己的话回答').id,
  )
  expect(submitButton().disabled).toBe(true)
  write(question, '先发主干')
  fireEvent.click(submitButton())
  expect((await fake.next('submit-reply')).body).toMatchObject({
    reply: { kind: 'text', text: '先发主干' },
  })
})

it('V5b 选了别的行，文本框收起、写下的字留着，只发选中的那一行', async () => {
  const fake = await listed()
  const question = shownCard()
  words(question, '先发主干')
  choose(question, '主干')
  expect(question.queryByRole('textbox')).toBeNull()
  choose(question, '用自己的话回答')
  expect((question.getByRole('textbox') as HTMLTextAreaElement).value).toBe('先发主干')
  choose(question, '下一版')
  fireEvent.click(submitButton())
  expect((await fake.next('submit-reply')).body).toMatchObject({
    reply: { kind: 'selection', optionId: 'next' },
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
  const kind = shownCard().getByText('未确认').closest('.hitl-kind') as HTMLElement
  expect(kind.dataset['waiting']).toBe('false')
  expect(shownCard().queryByText('需要你回答')).toBeNull()
  expect(
    screen
      .getByText('结果未知，正在确认。')
      .closest('[data-inline-notice]')
      ?.getAttribute('data-tone'),
  ).toBe('neutral')
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
  expect(screen.getByText('待答的问题会在这里等你。')).toBeTruthy()
})

it('V9 页上没有「刷新」：列表随观察自己更新，没有帧就不再取', async () => {
  const fake = await listed([])
  await settle()
  expect(screen.queryByRole('button', { name: '刷新' })).toBeNull()
  expect(fake.calls.filter(call => call.operation === 'list-cards')).toHaveLength(1)
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
  await listed([questionItem(), elsewhere, extensionItem()])
  const groups = screen.getAllByRole('region')
  expect(groups.map(group => group.getAttribute('aria-label'))).toEqual([
    '会话 ses_01234567…',
    '会话 ses_fedcba98…',
    '不属于会话的问题',
  ])
  for (const group of groups)
    expect(within(group).getAllByRole('button', { name: '提交' })).toHaveLength(1)
})

it('V15 一组三题叠在一张纸上：节间一条细线，种类行尾写 n / m；没有题号条与左右箭头；选了不跳', async () => {
  await listed([titled('第一问', 'card-a'), titled('第二问', 'card-b'), titled('第三问', 'card-c')])
  const papers = document.querySelectorAll('.hitl-paper')
  expect(papers).toHaveLength(1)
  expect(within(papers[0] as HTMLElement).getAllByRole('article')).toHaveLength(3)
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.queryByRole('button', { name: '上一题' })).toBeNull()
  expect(screen.queryByRole('button', { name: '下一题' })).toBeNull()
  expect(
    [...document.querySelectorAll('.hitl-kind-trail')].map(trail => trail.textContent),
  ).toEqual(['1 / 3', '2 / 3', '3 / 3'])
  const third = section('第三问')
  third.getByRole('radio', { name: '主干' }).focus()
  choose(third, '主干')
  expect(document.activeElement).toBe(third.getByRole('radio', { name: '主干' }))
  expect(screen.getAllByRole('article')).toHaveLength(3)
  words(section('第一问'), '再说')
  expect(document.activeElement).not.toBe(section('第二问').getAllByRole('radio')[0])
  fireEvent.click(screen.getByRole('button', { name: '还差 1 题' }))
  expect(document.activeElement).toBe(section('第二问').getByRole('radio', { name: '主干' }))
  choose(section('第二问'), '不回答这一题')
  expect(submitButton().disabled).toBe(false)
  expect(screen.queryByRole('button', { name: /还差/ })).toBeNull()
})

it('V16 一组三题一次提交：每题各交一次、依次发出；结局逐题，没记上的留着人填的，点「知道了」去掉', async () => {
  const [a, b, c] = [
    titled('第一问', 'card-a'),
    titled('第二问', 'card-b'),
    titled('第三问', 'card-c'),
  ]
  const fake = await listed([a, b, c])
  choose(section('第一问'), '主干')
  choose(section('第二问'), '下一版')
  words(section('第三问'), '第三题我自己说')
  fireEvent.click(submitButton())
  const first = await fake.next('submit-reply')
  await settle()
  expect(fake.calls.filter(call => call.operation === 'submit-reply')).toHaveLength(1)
  expect(screen.getByText('正在提交……')).toBeTruthy()
  expect(submitButton().getAttribute('aria-busy')).toBe('true')
  expect(submitButton().textContent).toBe('提交')
  expect(section('第一问').getByText('正在提交')).toBeTruthy()
  expect(section('第二问').queryByText('正在提交')).toBeNull()
  expect((section('第三问').getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  expect(
    section('第二问')
      .getAllByRole('radio')
      .every((radio: HTMLElement) => (radio as HTMLButtonElement).disabled),
  ).toBe(true)
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
  expect(screen.getAllByRole('article')).toHaveLength(2)
  const closed = section('第一问')
  const kind = closed.getByText('已关闭').closest('.hitl-kind') as HTMLElement
  expect(kind.dataset['waiting']).toBe('false')
  expect(closed.getByText('已在别处答了，这次的答复没有采用。')).toBeTruthy()
  expect(
    closed
      .getByText('已在别处答了，这次的答复没有采用。')
      .closest('[data-inline-notice]')
      ?.getAttribute('data-tone'),
  ).toBe('neutral')
  expect(closed.queryByRole('radio')).toBeNull()
  expect(closed.getByRole('radio', { checked: true, hidden: true })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '提交' })).toBeNull()
  fireEvent.click(closed.getByRole('button', { name: '知道了' }))
  expect(shownCard().getByText('这次提问已经关掉：那一轮被取消了。')).toBeTruthy()
  fireEvent.click(shownCard().getByRole('button', { name: '知道了' }))
  expect(screen.queryByRole('article')).toBeNull()
})

it('V17 被关掉的一节留在它原来的位置，指针下的东西不动；新来的卡接在最后', async () => {
  const [a, b] = [titled('第一问', 'card-a'), releaseItem('card-r')]
  const fake = await listed([a, b])
  const titles = () =>
    screen.getAllByRole('article').map(article => article.querySelector('h3')?.textContent)
  expect(titles()).toEqual(['第一问', '要执行 Shell run，放行吗？'])
  choose(section('第一问'), '主干')
  fireEvent.click(submitButton())
  await answer(fake, 'submit-reply', {
    outcome: 'succeeded',
    body: { kind: 'invalidated', reason: 'archived' },
  })
  await answer(fake, 'list-cards', page([b, titled('第三问', 'card-c')]))
  expect(titles()).toEqual(['第一问', '要执行 Shell run，放行吗？', '第三问'])
  expect(section('第一问').getByText('这次提问已经关掉：会话已归档。')).toBeTruthy()
})
