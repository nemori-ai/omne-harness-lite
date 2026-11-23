// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SESSION_TOOL_CALL, sessionToolCall } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import {
  listed,
  listPage,
  messageEntry,
  page,
  toolCallBlock,
  toolResultEntry,
} from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const ENTRIES = [
  messageEntry('1', '1', 'assistant', [
    toolCallBlock('c_web', 'Web', { query: 'omne' }),
    toolCallBlock('c_files', 'Files', { path: 'notes.md' }),
  ]),
  toolResultEntry('2', '2', 'c_web', '三条结果'),
]

async function opened(
  contribute: (shell: Awaited<ReturnType<typeof mountModule>>['shell']) => void,
) {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  contribute(mounted.shell)
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page(ENTRIES, '2') })
  await settle()
  return mounted
}

const lines = () =>
  [...document.querySelectorAll('.omne-process-name')].map(name => name.textContent)

it('点的名字是 session.tool-call，每个工具名一项', () => {
  expect(SESSION_TOOL_CALL).toBe('session.tool-call')
  expect(sessionToolCall.name).toBe(SESSION_TOOL_CALL)
  expect(sessionToolCall.contract).toMatchObject({
    arity: 'keyed-one',
    key: 'the name of the tool',
  })
})

it('没有画法时每次调用都是转写自己的那一行', async () => {
  await opened(() => {})
  expect(lines()).toEqual(['Web', 'Files'])
})

it('给一个工具放了画法，只有它的调用变：收到会话、调用的标识、名字、参数、状态与结果的文字', async () => {
  const seen: unknown[] = []
  await opened(
    shell =>
      void sessionToolCall.put(shell, 'Web', ({ scope, subject }) => {
        seen.push({ scope, subject })
        return <section data-testid="web-card">搜索 {String(subject.result)}</section>
      }),
  )
  expect(screen.getByTestId('web-card').textContent).toBe('搜索 三条结果')
  expect(lines()).toEqual(['Files'])
  expect(seen.at(-1)).toEqual({
    scope: TENANT,
    subject: {
      session: 'ses_a',
      call: 'c_web',
      name: 'Web',
      arguments: { query: 'omne' },
      state: 'completed',
      result: '三条结果',
    },
  })
})

it('画法可以包着转写自己的那一行画', async () => {
  await opened(
    shell =>
      void sessionToolCall.put(shell, 'Files', ({ generic }) => (
        <div data-testid="framed">{generic()}</div>
      )),
  )
  expect(screen.getByTestId('framed').querySelector('.omne-process-name')?.textContent).toBe(
    'Files',
  )
  expect(lines()).toEqual(['Web', 'Files'])
})

it('画法抛出时这一次调用落回转写自己的那一行', async () => {
  await opened(
    shell =>
      void sessionToolCall.put(shell, 'Web', () => {
        throw new Error('this card is broken')
      }),
  )
  expect(lines()).toEqual(['Web', 'Files'])
})

it('这一轮结束了还没有结果的调用，画法收到的状态是没有结果，结果是空', async () => {
  const seen: unknown[] = []
  await opened(
    shell =>
      void sessionToolCall.put(shell, 'Files', ({ subject }) => {
        seen.push([subject.state, subject.result])
        return null
      }),
  )
  expect(seen.at(-1)).toEqual(['no-result', null])
})
