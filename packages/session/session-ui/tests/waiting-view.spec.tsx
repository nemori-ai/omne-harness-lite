// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page, plainEntry, userEntry } from './fixtures/frames.ts'
import { sessionRunFailure } from '../src/cordis.ts'
import { mountModule } from './fixtures/shell.tsx'

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

async function openFailed(fake: FakeClient): Promise<void> {
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page(
      [
        userEntry('1', '1', '帮我查一下', 'msg_a'),
        plainEntry('2', '2', 'run.terminal', { terminal: { run: 'run_1', outcome: 'failed' } }),
      ],
      '2',
    ),
  })
  await settle()
}

type Told = {
  kind: string
  detail: string | null
  fault?: { cause: string; upstreamStatus: string | null; throttled: boolean } | null
}

const waiting = (pending: number, cause: Told | null) => ({
  outcome: 'succeeded',
  body: { waiting: { run: 'run_1', pending, cause } },
})

const notice = (block: HTMLElement) => block.querySelector('[data-inline-notice]')

it('一轮失败之后：失败的那一行下面写成因、没处理的条数与「重试」；重试点名那一轮', async () => {
  const fake = createFakeClient()
  await openFailed(fake)
  const read = await fake.next('read-waiting')
  expect(read.body).toMatchObject({ session: SESSION })
  read.answer(waiting(2, { kind: 'no-reply', detail: 'http-400' }))
  await settle()
  const block = screen.getByRole('status', { name: '这一轮失败了' })
  expect(block.previousElementSibling?.textContent).toBe('这一轮失败了')
  expect(block.textContent).toContain('模型没有给出有效的回复。')
  expect(block.getAttribute('data-omne-part')).toBe('session.transcript.failure')
  expect(block.textContent).toContain('还有 2 条消息没有处理')
  // The recovery leads with the retry glyph, as the reference's failure notice does (A4).
  expect(
    screen.getByRole('button', { name: '重试' }).querySelector('svg[data-icon="retry"]'),
  ).not.toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  const retry = await fake.next('retry-run')
  expect(retry.body).toMatchObject({ session: SESSION, run: 'run_1' })
  retry.answer({ outcome: 'no-change', body: {} })
  await settle()
  expect(block.textContent).toContain('没有没处理的消息，发一条新消息让它接着做')
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
})

it('失败通知：只有说事实的那一句带失败色，后面说条数与怎么办的句子是正文的墨', async () => {
  // The shared notice paints itself in the tone's ink (a utility class this test has no sheet for); the session's
  // own sheet decides the sentences under the fact.
  const sheet = document.createElement('style')
  sheet.textContent = `:root { --omne-ink-primary: rgb(1, 2, 3); --omne-ink-muted: rgb(4, 5, 6); }
[data-inline-notice][data-tone='danger'] { color: rgb(150, 63, 54); }
${readFileSync(join(import.meta.dirname, '../src/view/session-ui.css'), 'utf8')
  .replace(/^@import[^;]*;\s*@layer omne-builtin \{/u, '')
  .replace(/\}\s*$/u, '')}`
  document.head.append(sheet)
  try {
    const fake = createFakeClient()
    await openFailed(fake)
    ;(await fake.next('read-waiting')).answer(waiting(2, { kind: 'no-reply', detail: null }))
    await settle()
    const block = screen.getByRole('status', { name: '这一轮失败了' })
    const ink = (text: string) =>
      window.getComputedStyle(within(block).getByText(text, { exact: false })).color
    expect(ink('模型没有给出有效的回复。')).toBe('rgb(150, 63, 54)')
    expect(ink('还有 2 条消息没有处理')).toBe('rgb(1, 2, 3)')
  } finally {
    sheet.remove()
  }
})

it('条数为零：只提示发一条新消息，没有重试', async () => {
  const fake = createFakeClient()
  await openFailed(fake)
  ;(await fake.next('read-waiting')).answer(waiting(0, { kind: 'brand-new', detail: null }))
  await settle()
  const block = screen.getByRole('status', { name: '这一轮失败了' })
  expect(block.textContent).toContain('这一轮失败了，原因是「brand-new」。')
  expect(block.textContent).toContain('没有没处理的消息，发一条新消息让它接着做')
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
})

it('读等人这个操作不在：退回只显示这一轮失败了', async () => {
  const fake = createFakeClient()
  await openFailed(fake)
  ;(await fake.next('read-waiting')).answer({ outcome: 'stage-not-provided' })
  await settle()
  expect(screen.getByText('这一轮失败了')).toBeTruthy()
  expect(screen.queryByRole('status', { name: '这一轮失败了' })).toBeNull()
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
})

it('重试的结果不知道：如实显示，再问一次用同一个编号；恢复了就重新读等人', async () => {
  const fake = createFakeClient()
  await openFailed(fake)
  ;(await fake.next('read-waiting')).answer(waiting(1, null))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  const first = await fake.next('retry-run')
  first.answer({ outcome: 'unknown' })
  await settle()
  expect(screen.getByText(/重试的结果不知道/).className).toBe('omne-waiting-note')
  fireEvent.click(screen.getByRole('button', { name: '再问一次' }))
  const second = await fake.next('retry-run')
  expect((second.body as { controlId: string }).controlId).toBe(
    (first.body as { controlId: string }).controlId,
  )
  second.answer({ outcome: 'succeeded', body: { recovered: true } })
  await settle()
  ;(await fake.next('read-waiting')).answer({ outcome: 'succeeded', body: { waiting: null } })
  await settle()
  expect(screen.queryByRole('status', { name: '这一轮失败了' })).toBeNull()
})

it('提示挂在等的那一轮的失败那一行下面，不挂在别的失败下面，也不挂在末尾', async () => {
  const fake = createFakeClient()
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page(
      [
        plainEntry('1', '1', 'run.terminal', { terminal: { run: 'run_0', outcome: 'failed' } }),
        plainEntry('2', '2', 'run.terminal', { terminal: { run: 'run_1', outcome: 'failed' } }),
        plainEntry('3', '3', 'message.compaction', {}),
      ],
      '3',
    ),
  })
  await settle()
  ;(await fake.next('read-waiting')).answer(waiting(1, null))
  await settle()
  const block = screen.getByRole('status', { name: '这一轮失败了' })
  const markers = [...document.querySelectorAll('.omne-marker')]
  expect(block.previousElementSibling?.contains(markers[1] ?? null)).toBe(true)
  expect(block.nextElementSibling?.textContent).toBe('前面的对话已压缩')
})

it('失败的语气：危险色的行内通知，人话在前，诊断收在「详情」里，不是琥珀', async () => {
  const fake = createFakeClient()
  await openFailed(fake)
  ;(await fake.next('read-waiting')).answer(waiting(2, { kind: 'no-reply', detail: 'http-400' }))
  await settle()
  const block = screen.getByRole('status', { name: '这一轮失败了' })
  expect(notice(block)?.getAttribute('data-tone')).toBe('danger')
  expect(block.querySelector('[data-tone="caution"]')).toBeNull()
  const title = notice(block)?.querySelector('p')
  expect(title?.textContent).toBe('模型没有给出有效的回复。')
  expect(title?.textContent).not.toContain('http-400')
  const details = within(block).getByRole('button', { name: '详情' })
  expect(details.getAttribute('aria-expanded')).toBe('false')
  const region = document.getElementById(details.getAttribute('aria-controls') ?? '')
  expect(region?.textContent).toBe('http-400')
  fireEvent.click(details)
  expect(details.getAttribute('aria-expanded')).toBe('true')
})

it('没有诊断时没有「详情」；重试连不上时写明原因，中性，可以再按', async () => {
  const fake = createFakeClient()
  await openFailed(fake)
  ;(await fake.next('read-waiting')).answer(waiting(1, { kind: 'guard', detail: null }))
  await settle()
  const block = screen.getByRole('status', { name: '这一轮失败了' })
  expect(within(block).queryByRole('button', { name: '详情' })).toBeNull()
  fireEvent.click(within(block).getByRole('button', { name: '重试' }))
  ;(await fake.next('retry-run')).answer({ outcome: 'unavailable' })
  await settle()
  const said = block.querySelector('.omne-waiting-note')
  expect(said?.textContent).toBe('连不上服务，重试没有发出去。')
  expect(said?.closest('[data-tone]')?.getAttribute('data-tone')).toBe('danger')
  expect(within(block).getByRole('button', { name: '重试' })).toBeTruthy()
})

it('失败通知里有 session.run-failure 的位置：放进来的项收到会话、原因与细节，画在通知里；没有原因时不出现', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  sessionRunFailure.contribute(shell, {
    id: 'remedy',
    order: 0,
    render: ({ subject }) => <p data-remedy="">{JSON.stringify(subject)}</p>,
  })
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page(
      [
        userEntry('1', '1', '帮我查一下', 'msg_a'),
        plainEntry('2', '2', 'run.terminal', { terminal: { run: 'run_1', outcome: 'failed' } }),
      ],
      '2',
    ),
  })
  await settle()
  const detail = 'http-401'
  const fault = { cause: 'credential', upstreamStatus: '401', throttled: false }
  ;(await fake.next('read-waiting')).answer(waiting(0, { kind: 'no-reply', detail, fault }))
  await settle()
  const block = screen.getByRole('status', { name: '这一轮失败了' })
  const remedy = block.querySelector('[data-remedy]')
  expect(JSON.parse(remedy?.textContent ?? 'null')).toEqual({
    session: SESSION,
    cause: 'no-reply',
    detail,
    fault,
  })
  expect(within(block).getByText('模型调用没有成功，这一轮没有得到回复。')).toBeTruthy()
})

it('没有原因的失败通知里，session.run-failure 的项不画', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  sessionRunFailure.contribute(shell, {
    id: 'remedy',
    order: 0,
    render: () => <p data-remedy="">补救</p>,
  })
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page(
      [
        userEntry('1', '1', '帮我查一下', 'msg_a'),
        plainEntry('2', '2', 'run.terminal', { terminal: { run: 'run_1', outcome: 'failed' } }),
      ],
      '2',
    ),
  })
  await settle()
  ;(await fake.next('read-waiting')).answer(waiting(0, null))
  await settle()
  expect(
    screen.getByRole('status', { name: '这一轮失败了' }).querySelector('[data-remedy]'),
  ).toBeNull()
})
