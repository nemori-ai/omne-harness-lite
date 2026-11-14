// @vitest-environment happy-dom
// The main scene through the component and a fake protocol client: create a session, send one
// sentence, see the reply stream in, see it replaced by the committed message, cancel the run.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseInstant } from '@omne-harness/utc-instant'
import { StrictMode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { SessionWorkspace } from '../src/index.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  deltaTree,
  listed,
  listPage,
  page,
  snapshotTree,
  stateFrame,
  userEntry,
} from './fixtures/frames.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 'ses_main'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

it('W1 主场景：新建会话、发一句话、流式回复、被历史替换、取消', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)

  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  const create = await fake.next('create-session')
  create.answer({ outcome: 'succeeded', body: { session: SESSION, recovered: false } })
  await settle()
  const firstRead = await fake.next('read-history')
  expect(firstRead.body).toMatchObject({ session: SESSION, cursor: null, direction: 'backward' })
  firstRead.answer({ outcome: 'succeeded', body: page([], '1') })
  await settle()
  const observation = fake.observations[0]
  if (observation === undefined) throw new Error('no observation')
  act(() => observation.push(stateFrame(null, '1')))
  await settle()

  const input = screen.getByRole('textbox', { name: '输入消息' })
  fireEvent.change(input, { target: { value: '你好' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await settle()
  const send = await fake.next('send-input')
  const body = send.body as {
    acceptId: string
    inputId: string
    message: { entries: { key: string; value: unknown }[] }
  }
  expect(body).toMatchObject({ session: SESSION })
  expect(screen.getByText('发送中')).toBeTruthy()
  expect((input as HTMLTextAreaElement).value).toBe('')
  send.answer({ outcome: 'succeeded', body: { recovered: false } })
  await settle()
  expect(screen.getByText('已受理，等待写入会话')).toBeTruthy()

  const idNode = body.message.entries.find(entry => entry.key === 'id')?.value as
    | { value: string }
    | undefined
  const messageId = idNode?.value ?? ''
  act(() => observation.push(stateFrame('run_1', '3')))
  await settle()
  const catchUp = await fake.next('read-history')
  catchUp.answer({
    outcome: 'succeeded',
    body: page([userEntry('1', '2', '你好', messageId)], '3'),
  })
  await settle()
  expect(screen.queryByText('已受理，等待写入会话')).toBeNull()

  act(() => {
    observation.push({
      kind: 'snapshot',
      projection: 'model-output-v1',
      value: snapshotTree('1', '1', [['0', '正在']]),
    })
    observation.push({
      kind: 'delta',
      projection: 'model-output-v1',
      value: deltaTree({ cursor: '1', revision: '1' }, '2', '2', [['0', '正在回答你']]),
    })
  })
  await settle()
  expect(screen.getByText('正在生成')).toBeTruthy()
  expect(screen.getByText(/正在回答你/)).toBeTruthy()

  // Still running: typing goes on, and Stop is there.
  fireEvent.change(input, { target: { value: '再说一句' } })
  expect((input as HTMLTextAreaElement).value).toBe('再说一句')

  act(() => observation.push(stateFrame('run_1', '4')))
  await settle()
  const committed = await fake.next('read-history')
  committed.answer({
    outcome: 'succeeded',
    body: page(
      [userEntry('1', '2', '你好', messageId), assistantEntry('2', '4', '正在回答你。')],
      '4',
    ),
  })
  await settle()
  expect(screen.queryByText('正在生成')).toBeNull()
  expect(screen.getByText('正在回答你。')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '停止' }))
  const cancel = await fake.next('cancel-run')
  expect(cancel.body).toMatchObject({ session: SESSION, run: 'run_1', urgency: 'graceful' })
  await settle()
  expect(screen.getByRole('button', { name: '正在停止' })).toBeTruthy()
  cancel.answer({ outcome: 'succeeded', body: { kind: 'requested', controlId: 'x', run: 'run_1' } })
  act(() => observation.push(stateFrame(null, '5')))
  await settle()
  expect(screen.queryByRole('button', { name: /停止/ })).toBeNull()
})

it('W2 发送结果未知：显示未知，用同一个受理编号认回，不重发', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: SESSION, recovered: false },
  })
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '1') })
  const input = screen.getByRole('textbox', { name: '输入消息' })
  fireEvent.change(input, { target: { value: '在吗' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  await settle()
  const send = await fake.next('send-input')
  send.answer({ outcome: 'uncertain' })
  await settle()
  expect(screen.getByText('未知，正在确认')).toBeTruthy()
  const query = await fake.next('query-send-input')
  expect((query.body as { acceptId: string }).acceptId).toBe(
    (send.body as { acceptId: string }).acceptId,
  )
  expect(fake.calls.filter(call => call.operation === 'send-input')).toHaveLength(1)
  query.answer({ outcome: 'unknown' })
  await settle()
  expect(screen.getByText('发送的结果仍然未知。可以再确认一次。')).toBeTruthy()
})

it('W4 StrictMode 下挂上、收掉、再挂上之后仍能用，只发一次建会话', async () => {
  const fake = createFakeClient()
  render(
    <StrictMode>
      <SessionWorkspace client={fake.client} tenant={TENANT} />
    </StrictMode>,
  )
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: SESSION, recovered: false },
  })
  await settle()
  expect(fake.calls.filter(call => call.operation === 'create-session')).toHaveLength(1)
  expect(screen.getByRole('textbox', { name: '输入消息' })).toBeTruthy()
})

it('W5 回复增长时，已提交的那几条在 DOM 里一点不变', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: SESSION, recovered: false },
  })
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page(
      [userEntry('1', '1', '第一句', 'msg_a'), assistantEntry('2', '2', '第一个回答')],
      '2',
    ),
  })
  await settle()
  const observation = fake.observations[0]
  if (observation === undefined) throw new Error('no observation')
  act(() => {
    observation.push(stateFrame('run_1', '2'))
    observation.push({
      kind: 'snapshot',
      projection: 'model-output-v1',
      value: snapshotTree('1', '1', [['0', '一']]),
    })
  })
  await settle()
  const committed = screen.getByText('第一个回答').closest('article')
  if (committed === null) throw new Error('no committed article')
  const mutations: MutationRecord[] = []
  const watcher = new MutationObserver(records => mutations.push(...records))
  watcher.observe(committed, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  let text = '一'
  for (let at = 1; at < 20; at += 1) {
    const base = { cursor: String(at), revision: String(at) }
    text += '二'
    act(() =>
      observation.push({
        kind: 'delta',
        projection: 'model-output-v1',
        value: deltaTree(base, String(at + 1), String(at + 1), [['0', text]]),
      }),
    )
  }
  await settle()
  watcher.disconnect()
  expect(screen.getByText(text)).toBeTruthy()
  expect(committed.isConnected).toBe(true)
  expect(mutations).toEqual([])
})

it('W6 列表项有最近活动时刻时显示它，机读的值是那个 UTC 时刻', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  const at = parseInstant('2026-11-13T07:00:00Z')
  if (!at.ok) throw new Error('fixture instant')
  ;(await fake.next('list-sessions')).answer(
    listPage([{ ...listed('ses_t', '有时刻的'), lastActivityAt: at.value }]),
  )
  await settle()
  const time = screen.getByRole('navigation', { name: '会话列表' }).querySelector('time')
  expect(time?.getAttribute('datetime')).toBe('2026-11-13T07:00:00Z')
  expect(time?.textContent).toBe(new Date('2026-11-13T07:00:00Z').toLocaleString())
})

it('W6 列表项：无标题写「未命名的会话」与标识前 8 位，无时刻不显示，已冻结标出；更多接在后面', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  const first = await fake.next('list-sessions')
  expect(first.body).toEqual({ tenant: expect.anything(), cursor: null })
  first.answer(
    listPage(
      [
        listed('ses_12345678xyz', null),
        listed('ses_b', '冻住的', 'frozen'),
        listed('ses_c', '平常的'),
      ],
      'cur-2',
      'partial',
    ),
  )
  await settle()
  const list = screen.getByRole('navigation', { name: '会话列表' })
  expect(list.textContent).toContain('未命名的会话 ses_1234')
  expect(list.textContent).not.toContain('ses_12345')
  expect(screen.getByRole('button', { name: /冻住的/ }).textContent).toContain('已冻结')
  expect(screen.getByRole('button', { name: /平常的/ }).textContent).toBe('平常的')
  expect(list.querySelector('time')).toBeNull()
  expect(list.textContent).toContain('列表可能不全')

  fireEvent.click(screen.getByRole('button', { name: '更多' }))
  const more = await fake.next('list-sessions')
  expect(more.body).toEqual({ tenant: expect.anything(), cursor: 'cur-2' })
  more.answer(listPage([listed('ses_c', '平常的'), listed('ses_d', '更早的')]))
  await settle()
  expect(
    [...list.querySelectorAll('.omne-session-item-title')].map(node => node.textContent),
  ).toEqual(['未命名的会话 ses_1234', '冻住的', '平常的', '更早的'])
  expect(screen.queryByRole('button', { name: '更多' })).toBeNull()
})

it('W7 刷新之后：列表里点一个旧会话，看得到历史，能接着发消息，受理后列表重读', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '旧会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '旧会话' }))
  await settle()
  const read = await fake.next('read-history')
  expect(read.body).toMatchObject({ session: SESSION, cursor: null, direction: 'backward' })
  expect(fake.observations).toHaveLength(1)
  read.answer({
    outcome: 'succeeded',
    body: page(
      [userEntry('1', '1', '上次说的', 'msg_a'), assistantEntry('2', '2', '上次的回答')],
      '2',
    ),
  })
  await settle()
  expect(screen.getByText('上次的回答')).toBeTruthy()
  expect(screen.getByRole('button', { name: '旧会话' }).getAttribute('aria-current')).toBe('true')

  const input = screen.getByRole('textbox', { name: '输入消息' })
  fireEvent.change(input, { target: { value: '接着说' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await settle()
  const send = await fake.next('send-input')
  expect(send.body).toMatchObject({ session: SESSION })
  send.answer({ outcome: 'succeeded', body: { recovered: false } })
  await settle()
  expect((await fake.next('list-sessions')).body).toMatchObject({ cursor: null })
})

it('W8 换会话：停掉原会话的观察，新会话从头开始', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  ;(await fake.next('list-sessions')).answer(
    listPage([listed('ses_one', '第一个'), listed('ses_two', '第二个')]),
  )
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '第一个' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', '第一个的内容')], '1'),
  })
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '第二个' }))
  await settle()
  expect(fake.observations[0]?.aborted).toBe(true)
  expect(fake.observations[1]?.aborted).toBe(false)
  expect(screen.queryByText('第一个的内容')).toBeNull()
  expect((await fake.next('read-history')).body).toMatchObject({ session: 'ses_two' })
})

it('W9 列表读失败：如实写在列表区，已打开的会话照常；暂时读不到可以重试', async () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  const mounted = await fake.next('list-sessions')
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: SESSION, recovered: false },
  })
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', '会话里的内容')], '1'),
  })
  const reload = await fake.next('list-sessions')
  mounted.answer(listPage([listed('ses_stale', '作废的答复')]))
  reload.answer({ outcome: 'basis-unavailable' })
  await settle()
  const list = screen.getByRole('navigation', { name: '会话列表' })
  expect(list.textContent).toContain('会话列表暂时读不到。')
  expect(list.textContent).not.toContain('作废的答复')
  expect(screen.getByText('会话里的内容')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: '输入消息' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  ;(await fake.next('list-sessions')).answer({ outcome: 'denied' })
  await settle()
  expect(list.textContent).toContain('没有权限，或登录已失效。')
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  expect(screen.getByText('会话里的内容')).toBeTruthy()
})

it('W3 外壳给的租户读不懂：如实说出来', () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant="not-a-tenant" />)
  expect(screen.getByRole('alert').textContent).toContain('租户读不懂')
})

it('W10 外壳重新渲染而租户没变：不重读列表，开着的会话还在', async () => {
  const fake = createFakeClient()
  const view = render(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  ;(await fake.next('list-sessions')).answer(listPage([]))
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: SESSION, recovered: false },
  })
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '1') })
  await settle()
  expect(screen.getByRole('textbox', { name: '输入消息' })).toBeTruthy()
  const creates = () => fake.calls.filter(call => call.operation === 'create-session').length
  const before = fake.observations.length

  view.rerender(<SessionWorkspace client={fake.client} tenant={TENANT} />)
  await settle()
  expect(screen.getByRole('textbox', { name: '输入消息' })).toBeTruthy()
  expect(fake.observations.length).toBe(before)
  expect(creates()).toBe(1)
})
