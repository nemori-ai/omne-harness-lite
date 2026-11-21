// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page, stateFrame } from './fixtures/frames.ts'
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

async function opened(fake: FakeClient): Promise<void> {
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '0') })
  await settle()
}

const input = (id: string, preview: string, more: Record<string, unknown> = {}) => ({
  input: id,
  position: '7',
  source: { name: 'session.member', label: '成员' },
  role: 'user',
  wakes: true,
  preview,
  ...more,
})
const pending = (inputs: readonly unknown[], next: string | null = null) => ({
  outcome: 'succeeded',
  body: { inputs, next },
})
const card = { owner: 'human-intervention', record: 'card_9', revision: '3', digest: 'd' }
const calls = (items: readonly unknown[]) => ({ outcome: 'succeeded', body: { calls: items } })
const work = () => document.querySelector<HTMLElement>('section.omne-session-work')
const fold = () => within(work()!).getByRole('button')

it('排着的话：一行回执重量的字「还有 n 句话排着没处理」，原地展开成这些话；在等人答的调用不另写一行', async () => {
  const fake = createFakeClient()
  await opened(fake)
  const asked = await fake.next('read-pending')
  expect(asked.body).toMatchObject({ session: SESSION, after: null })
  asked.answer(
    pending([
      input('in_1', '再帮我看一下第二个文件'),
      input('in_2', '定时检查提醒', {
        source: { name: 'schedule.fire', label: '定时' },
        role: 'system_reminder',
        wakes: false,
      }),
    ]),
  )
  const waitingCalls = await fake.next('read-waiting-calls')
  expect(waitingCalls.body).toMatchObject({ session: SESSION })
  waitingCalls.answer(
    calls([{ card, action: 'deploy', passage: 'before-tool', position: '5', run: 'run_1' }]),
  )
  await settle()
  const region = work()!
  expect(screen.getByRole('region', { name: '排着的话' })).toBe(region)
  expect(fold().textContent).toBe('还有 2 句话排着没处理')
  expect(fold().getAttribute('aria-expanded')).toBe('false')
  expect(fold().className).toContain('text-xs')
  const list = region.querySelector('ul')!
  expect(list.closest('[aria-hidden="true"]')).not.toBeNull()
  fireEvent.click(fold())
  expect(fold().getAttribute('aria-expanded')).toBe('true')
  expect([...list.querySelectorAll('li')].map(item => item.textContent)).toEqual([
    '成员：再帮我看一下第二个文件',
    '定时：定时检查提醒',
  ])
  expect(region.textContent).not.toContain('在等人答')
  expect(region.textContent).not.toContain('deploy')
  expect(region.textContent).not.toContain('card_9')
  expect(region.querySelector('[data-inline-notice], .omne-session-work-part')).toBeNull()
})

it('只有在等人答的调用、没有排着的话：什么都不画', async () => {
  const fake = createFakeClient()
  await opened(fake)
  ;(await fake.next('read-pending')).answer(pending([]))
  ;(await fake.next('read-waiting-calls')).answer(
    calls([{ card, action: 'deploy', passage: 'p', position: '5', run: 'run_1' }]),
  )
  await settle()
  expect(work()).toBeNull()
})

it('都没有时不占地方', async () => {
  const fake = createFakeClient()
  await opened(fake)
  ;(await fake.next('read-pending')).answer(pending([]))
  ;(await fake.next('read-waiting-calls')).answer(calls([]))
  await settle()
  expect(work()).toBeNull()
})

it('读不到是一行中性的原因，不说成没有，也不给人看结果码', async () => {
  const fake = createFakeClient()
  await opened(fake)
  ;(await fake.next('read-pending')).answer({ outcome: 'basis-unavailable' })
  ;(await fake.next('read-waiting-calls')).answer({ outcome: 'denied' })
  await settle()
  const region = work()!
  expect(region.textContent).toBe('还排着哪些话现在读不到：服务端暂时不能处理，稍后再试。')
  expect(region.textContent).not.toContain('basis-unavailable')
  expect(region.querySelector('[data-tone]')).toBeNull()
})

it('到了上界：写「至少还有 n 句话排着没处理」，展开后只列前面的', async () => {
  const fake = createFakeClient()
  await opened(fake)
  ;(await fake.next('read-pending')).answer(pending([input('in_1', '第一句')], '7'))
  ;(await fake.next('read-waiting-calls')).answer(calls([]))
  await settle()
  expect(fold().textContent).toBe('至少还有 1 句话排着没处理')
  fireEvent.click(fold())
  expect([...work()!.querySelectorAll('li')].map(item => item.textContent)).toEqual([
    '成员：第一句',
  ])
})

it('会话的日志往前走了就重读，旧的答复不盖新的', async () => {
  const fake = createFakeClient()
  await opened(fake)
  const first = await fake.next('read-pending')
  const firstCalls = await fake.next('read-waiting-calls')
  await act(async () => fake.observations[0]!.push(stateFrame(null, '9')))
  await settle()
  const second = await fake.next('read-pending')
  ;(await fake.next('read-waiting-calls')).answer(calls([]))
  second.answer(pending([]))
  first.answer(pending([input('in_1', '早就处理掉的一句')]))
  firstCalls.answer(calls([{ card, action: null, passage: 'p', position: '5', run: null }]))
  await settle()
  expect(work()).toBeNull()
})
