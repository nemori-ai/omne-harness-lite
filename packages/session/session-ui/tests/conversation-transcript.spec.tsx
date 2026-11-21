// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TranscriptRow } from '../src/view/transcript-arrivals.tsx'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  deltaTree,
  listed,
  listPage,
  page,
  plainEntry,
  snapshotTree,
  stateFrame,
  userEntry,
} from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 'ses_main'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function opened(
  fake: FakeClient,
  entries: Parameters<typeof page>[0] = [],
  upper = '0',
): Promise<void> {
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page(entries, upper) })
  await settle()
}

const transcript = () => document.querySelector<HTMLElement>('.omne-conversation')!
const composer = () => screen.getByRole('textbox', { name: '输入消息' })

it('气泡：说话人的名字不画，只给读屏；行标出是谁的话，换人时间距按段', async () => {
  const fake = createFakeClient()
  await opened(
    fake,
    [
      userEntry('1', '1', '第一句', 'msg_a'),
      assistantEntry('2', '2', '第一个回答'),
      assistantEntry('3', '3', '接着说'),
      userEntry('4', '4', '第二句', 'msg_b'),
    ],
    '4',
  )
  const articles = [...transcript().querySelectorAll('article')]
  expect(articles.map(article => article.querySelector('header'))).toEqual([null, null, null, null])
  expect(
    articles.map(article => article.querySelector('.omne-message-speaker')?.textContent),
  ).toEqual(['你', 'Agent', 'Agent', '你'])
  expect(articles.map(article => article.querySelector('.omne-message-body')?.textContent)).toEqual(
    ['第一句', '第一个回答', '接着说', '第二句'],
  )
  const rows = [...transcript().children].filter(row => !row.matches('.omne-session-dock'))
  expect(rows.map(row => row.getAttribute('data-speaker'))).toEqual([
    'user',
    'agent',
    'agent',
    'user',
  ])
})

it('标记：正常的一轮开始与完成不画；压缩、取消、失败各一行，失败的词用失败色；不认识的种类写明种类名', async () => {
  const fake = createFakeClient()
  await opened(
    fake,
    [
      plainEntry('1', '1', 'run.started', { run: 'run_1' }),
      userEntry('2', '2', '帮我看看', 'msg_a'),
      assistantEntry('3', '3', '看好了'),
      plainEntry('4', '4', 'run.terminal', { terminal: { run: 'run_1', outcome: 'completed' } }),
      plainEntry('5', '5', 'message.compaction', {}),
      plainEntry('6', '6', 'run.started', { run: 'run_2' }),
      plainEntry('7', '7', 'run.terminal', { terminal: { run: 'run_2', outcome: 'cancelled' } }),
      plainEntry('8', '8', 'run.terminal', { terminal: { run: 'run_3', outcome: 'failed' } }),
      plainEntry('9', '9', 'odd.kind', {}),
    ],
    '9',
  )
  expect(transcript().textContent).not.toContain('新的一轮开始')
  expect(transcript().textContent).not.toContain('这一轮已完成')
  const markers = [...transcript().querySelectorAll('.omne-marker')]
  expect(markers.map(marker => [marker.textContent, marker.getAttribute('data-tone')])).toEqual([
    ['前面的对话已压缩', null],
    ['这一轮已取消', null],
    ['这一轮失败了', 'danger'],
  ])
  expect(transcript().querySelector('.omne-placeholder')?.textContent).toBe(
    '不认识的历史条目种类：odd.kind',
  )
})

it('回复进行中转写什么都不说：没有占位的气泡、没有「正在生成」；字到了才有气泡；丢了一段才说一句', async () => {
  const fake = createFakeClient()
  await opened(fake)
  const observation = fake.observations[0]!
  const live = () => transcript().querySelector('article[data-live="true"]')
  act(() => {
    observation.push(stateFrame('run_1', '1'))
    observation.push({
      kind: 'snapshot',
      projection: 'model-output-v1',
      value: snapshotTree('1', '1', []),
    })
    observation.push({ kind: 'refreshing' })
  })
  await settle()
  expect(live()).toBeNull()
  expect(transcript().textContent).toBe('')
  act(() =>
    observation.push({
      kind: 'delta',
      projection: 'model-output-v1',
      value: deltaTree({ cursor: '1', revision: '1' }, '2', '2', [['0', '开始回答']]),
    }),
  )
  await settle()
  expect(live()?.querySelector('.omne-message-body')?.textContent).toBe('开始回答')
  expect(transcript().textContent).not.toContain('正在生成')
  act(() => observation.push({ kind: 'gap', reason: 'buffer' }))
  await settle()
  expect(transcript().querySelector('.omne-live-status')?.textContent).toBe(
    '回复的内容丢了一段（缓冲放不下），正在重新取……',
  )
})

it('没有发出：气泡留着，下一行写原因，词用失败色，没有状态胶囊', async () => {
  const fake = createFakeClient()
  await opened(fake)
  fireEvent.change(composer(), { target: { value: '在吗' } })
  fireEvent.keyDown(composer(), { key: 'Enter' })
  await settle()
  ;(await fake.next('send-input')).answer({ outcome: 'denied' })
  await settle()
  const bubble = transcript().querySelector('article[data-pending]')
  expect(bubble?.querySelector('.omne-message-body')?.textContent).toBe('在吗')
  const note = bubble?.querySelector('.omne-message-note')
  expect(note?.textContent).toBe('没有发出：没有权限，或登录已失效。')
  expect(note?.getAttribute('data-tone')).toBe('danger')
  expect(bubble?.querySelector('[data-slot="status-pill"], header')).toBeNull()
})

it('输入框的占位符照来源：平时「发消息给」加对话头上 Agent 的名字；有在等人答的调用时后面接会排队、不算回答', async () => {
  const fake = createFakeClient()
  await opened(fake)
  const name = document.querySelector('.omne-session-figure-name')?.textContent
  expect(name).toBe('Agent')
  expect(composer().getAttribute('placeholder')).toBe(`发消息给${name}`)
  ;(await fake.next('read-pending')).answer({
    outcome: 'succeeded',
    body: { inputs: [], next: null },
  })
  const card = { owner: 'human-intervention', record: 'card_9', revision: '3', digest: 'd' }
  ;(await fake.next('read-waiting-calls')).answer({
    outcome: 'succeeded',
    body: { calls: [{ card, action: 'deploy', passage: 'p', position: '5', run: 'run_1' }] },
  })
  await settle()
  expect(composer().getAttribute('placeholder')).toBe(`发消息给${name}，会排队，不算回答`)
  expect(composer().getAttribute('aria-label')).toBe('输入消息')
  await act(async () => fake.observations[0]!.push(stateFrame(null, '9')))
  await settle()
  ;(await fake.next('read-pending')).answer({
    outcome: 'succeeded',
    body: { inputs: [], next: null },
  })
  ;(await fake.next('read-waiting-calls')).answer({ outcome: 'succeeded', body: { calls: [] } })
  await settle()
  expect(composer().getAttribute('placeholder')).toBe(`发消息给${name}`)
})

it('从搜索跳来的那一行落定一次（不透明度 .6 到 1），不再找它时不动', () => {
  const animate = vi.fn(() => ({ cancel: () => undefined, finished: Promise.resolve() }))
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  vi.spyOn(Element.prototype, 'animate').mockImplementation(animate as never)
  const row = (found: boolean) => (
    <TranscriptRow arriving={false} entry="3" found={found}>
      结果
    </TranscriptRow>
  )
  const view = render(row(false))
  expect(animate).not.toHaveBeenCalled()
  view.rerender(row(true))
  expect(animate.mock.calls).toEqual([
    [[{ opacity: 0.6 }, { opacity: 1 }], expect.objectContaining({ duration: expect.any(Number) })],
  ])
  view.rerender(row(false))
  expect(animate).toHaveBeenCalledTimes(1)
})
