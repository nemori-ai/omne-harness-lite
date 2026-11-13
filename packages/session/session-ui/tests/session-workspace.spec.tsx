// @vitest-environment happy-dom
// The main scene through the component and a fake protocol client: create a session, send one
// sentence, see the reply stream in, see it replaced by the committed message, cancel the run.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { SessionWorkspace } from '../src/index.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  deltaTree,
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

  const messageId = (
    body.message.entries.find(entry => entry.key === 'id')?.value as { value: string }
  ).value
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

it('W3 外壳给的租户读不懂：如实说出来', () => {
  const fake = createFakeClient()
  render(<SessionWorkspace client={fake.client} tenant="not-a-tenant" />)
  expect(screen.getByRole('alert').textContent).toContain('租户读不懂')
})
