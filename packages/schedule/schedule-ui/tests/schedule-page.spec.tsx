// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { SchedulePage } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type Call, type FakeClient } from './fixtures/fake-client.ts'
import { stubInView } from './fixtures/in-view.ts'

type Client = ClientOf<ScheduleProtocol>
const OPERATIONS = Object.keys(scheduleProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

/** The protocol client decodes an instant into an Instant, which has no string form. */
function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(text)
  return parsed.value
}

const NEXT = {
  at: instant('2026-11-30T09:00:00Z'),
  local: '2026-11-30T17:00:00',
  calendar: 'cn-legal-holidays',
  version: '2026.1',
}
const MONTHLY = {
  schedule: 'sch_monthly',
  label: '月报提醒',
  control: 'active',
  standing: 'ready',
  author: { kind: 'agent', session: 'ses_1' },
  next: NEXT,
  revision: 2,
}
const WEEKLY = {
  schedule: 'sch_weekly',
  label: null,
  control: 'draft',
  standing: 'ready',
  author: { kind: 'human' },
  next: null,
  revision: 1,
}
const DETAIL = {
  ...MONTHLY,
  basis: { kind: 'blanket', scope: 'standing' },
  createdAt: instant('2026-11-17T03:00:00Z'),
  definition: {},
}

let inView: ReturnType<typeof stubInView>
beforeAll(stubAnimation)
beforeEach(() => {
  inView = stubInView()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function answer(call: Call, value: unknown): Promise<void> {
  await act(async () => {
    call.answer(value)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function listed(items: unknown[], next: string | null = null) {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  expect(screen.getByRole('status', { name: '读取中' })).toBeTruthy()
  await answer(await fake.next('list-schedules'), { outcome: 'succeeded', body: { items, next } })
  return fake
}

const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const workspace = () => document.querySelector('.list-reading-workspace')!
const listCalls = (fake: FakeClient<Client>) =>
  fake.calls.filter(call => call.operation === 'list-schedules').length

async function picked(fake: FakeClient<Client>, name = '月报提醒') {
  fireEvent.click(row(name))
  const read = await fake.next('read-schedule')
  const preview = await fake.next('preview')
  return { read, preview }
}

it('L1 each schedule is a row: its name, a word only when it is not in effect and able to run, and its next time without the calendar', async () => {
  await listed([MONTHLY, WEEKLY])
  expect(row('月报提醒').textContent).toBe('月报提醒2026-11-30 17:00')
  expect(row('未命名').textContent).toBe('未命名草稿没有下一次')
  expect(row('月报提醒').getAttribute('aria-current')).toBeNull()
})

it.each([
  [{ control: 'active', standing: 'blocked' }, '暂时受阻'],
  [{ control: 'active', standing: 'terminallyInvalidated' }, '永久失效'],
  [{ control: 'paused', standing: 'blocked' }, '暂停'],
  [{ control: 'superseded', standing: 'ready' }, '已被取代'],
])('L1b a schedule %o says %s on its row', async (state, word) => {
  await listed([{ ...MONTHLY, ...state }])
  expect(row('月报提醒').textContent).toBe(`月报提醒${word}2026-11-30 17:00`)
})

it('L2 no schedule yet: the list says nothing and the reading pane says what will be here', async () => {
  await listed([])
  expect(screen.getByText('命令行与 agent 建的日程会列在这里。')).toBeTruthy()
  expect(screen.queryByText('选一个日程看它的安排。')).toBeNull()
  expect(workspace().getAttribute('data-empty')).toBe('true')
  expect(document.querySelector('.list-reading-list')?.textContent).toBe('')
})

it('L3 a list that cannot be read says why in a notice and reads again on 重试', async () => {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  await answer(await fake.next('list-schedules'), { outcome: 'unavailable' })
  const notice = screen.getByRole('alert')
  expect(notice.textContent).toContain('读不出：连不上服务端。')
  expect(notice.getAttribute('data-tone')).toBe('caution')
  expect(workspace().getAttribute('data-empty')).toBe('false')
  fireEvent.click(within(notice).getByRole('button', { name: '重试' }))
  await answer(await fake.next('list-schedules'), {
    outcome: 'succeeded',
    body: { items: [], next: null },
  })
  expect(screen.getByText('命令行与 agent 建的日程会列在这里。')).toBeTruthy()
})

it.each([
  ['denied', 'neutral'],
  ['uncertain', 'neutral'],
  ['basis-unavailable', 'caution'],
  ['protocol-rejected', 'danger'],
])('L3b a read answered %s is said in the %s tone', async (outcome, tone) => {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  await answer(await fake.next('list-schedules'), { outcome })
  expect(document.querySelector('[data-inline-notice]')?.getAttribute('data-tone')).toBe(tone)
})

it('L4 the end of the list in view reads the next page after the cursor, once; there is no 更多', async () => {
  const fake = await listed([MONTHLY], 'c1')
  expect(screen.queryByRole('button', { name: '更多' })).toBeNull()
  act(() => {
    inView.enter()
    inView.enter()
  })
  const more = await fake.next('list-schedules')
  expect(more.body).toMatchObject({ terminal: false, cursor: 'c1' })
  expect(listCalls(fake)).toBe(2)
  await answer(more, { outcome: 'succeeded', body: { items: [WEEKLY], next: null } })
  expect(row('未命名')).toBeTruthy()
  expect(inView.watched()).toEqual([])
})

it('L5 the whole span asks for the ended ones too, and the open one stays open', async () => {
  const fake = await listed([MONTHLY])
  await picked(fake)
  fireEvent.click(screen.getByRole('button', { name: '全部，含已结束的' }))
  expect((await fake.next('list-schedules')).body).toMatchObject({ terminal: true, cursor: null })
  expect(workspace().getAttribute('data-detail')).toBe('true')
  expect(screen.getByRole('button', { name: '回到列表' })).toBeTruthy()
})

it('L6 刷新 in the page header reads the list and the open schedule again', async () => {
  const fake = await listed([MONTHLY])
  await picked(fake)
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect((await fake.next('list-schedules')).body).toMatchObject({ cursor: null })
  expect((await fake.next('read-schedule')).body).toMatchObject({ schedule: 'sch_monthly' })
  expect((await fake.next('preview')).body).toMatchObject({ count: 5 })
})

it('R1 nothing picked: the reading pane is the one sentence', async () => {
  await listed([MONTHLY])
  expect(screen.getByText('选一个日程看它的安排。')).toBeTruthy()
  expect(workspace().getAttribute('data-detail')).toBe('false')
  expect(workspace().getAttribute('data-empty')).toBe('false')
})

it('T1 a tenant it cannot read is said under the header, and nothing is asked', () => {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant="not a tenant" />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('日程')
  expect(screen.getByRole('alert').textContent).toBe('读不懂当前的租户。')
  expect(fake.calls).toEqual([])
})

it('D1 picking one opens its record: the name, who made it and how long ago, its facts and its next few times', async () => {
  const fake = await listed([MONTHLY])
  const { read, preview } = await picked(fake)
  expect(read.body).toMatchObject({ schedule: 'sch_monthly' })
  expect(preview.body).toMatchObject({
    source: { kind: 'schedule', schedule: 'sch_monthly' },
    count: 5,
  })
  expect(row('月报提醒').getAttribute('aria-current')).toBe('true')
  expect(workspace().getAttribute('data-detail')).toBe('true')
  expect(document.querySelector('.list-reading-toolbar-name')?.textContent).toBe('月报提醒')
  await answer(read, { outcome: 'succeeded', body: DETAIL })
  await answer(preview, {
    outcome: 'succeeded',
    body: {
      upcoming: [
        NEXT,
        { ...NEXT, at: instant('2026-12-31T09:00:00Z'), local: '2026-12-31T17:00:00' },
      ],
      complete: false,
    },
  })
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('月报提醒')
  const byline = screen.getByRole('heading', { level: 2 }).nextElementSibling
  expect(byline?.textContent).toMatch(/^agent（会话 ses_1）建的 · \S/)
  expect(byline?.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-17T03:00:00Z')
  const facts = screen.getByLabelText('日程详情').textContent
  expect(facts).toContain('状态生效')
  expect(facts).toContain('能否运行能按时运行')
  expect(facts).toContain('下一次2026-11-30 17:00（cn-legal-holidays，版本 2026.1）')
  expect(facts).toContain('凭什么生效你的全权同意（始终放行）')
  expect(facts).toContain('修订2')
  expect(screen.getByLabelText('时间表').children).toHaveLength(2)
  expect(screen.getByText('只列出了能确定的几次。')).toBeTruthy()
  expect(screen.queryByText('选一个日程看它的安排。')).toBeNull()
})

it('D1b a schedule that is not normal says the row’s word as its state', async () => {
  const fake = await listed([{ ...MONTHLY, standing: 'blocked' }])
  const { read } = await picked(fake)
  await answer(read, { outcome: 'succeeded', body: { ...DETAIL, standing: 'blocked' } })
  const state = screen.getByLabelText('日程详情').querySelector('[data-status-pill]')
  expect(state?.textContent).toBe('暂时受阻')
  expect(state?.getAttribute('data-tone')).toBe('caution')
})

it.each([
  [{ kind: 'owner' }, '你本人的操作'],
  [{ kind: 'blanket', scope: 'session' }, '你的全权同意（只在那个会话里）'],
  [{ kind: 'granular' }, '你对这一次的放行'],
  [{ kind: 'none' }, '无：还没有生效'],
])('D2 the basis %o reads as a sentence', async (basis, text) => {
  const fake = await listed([MONTHLY])
  const { read } = await picked(fake)
  await answer(read, { outcome: 'succeeded', body: { ...DETAIL, basis } })
  expect(screen.getByLabelText('日程详情').textContent).toContain(text)
})

it('D3 a schedule that is not visible any more, and a preview the calendar cannot answer, say so without a retry', async () => {
  const fake = await listed([MONTHLY])
  const { read, preview } = await picked(fake)
  await answer(read, { outcome: 'not-visible', body: {} })
  await answer(preview, { outcome: 'unsupported', body: { reason: 'coverage' } })
  expect(screen.getByText('看不到这条日程。')).toBeTruthy()
  expect(screen.getByText('当前日历答不了接下来几次。')).toBeTruthy()
  const notices = [...document.querySelectorAll('[data-inline-notice]')]
  expect(notices.map(notice => notice.getAttribute('data-tone'))).toEqual(['neutral', 'neutral'])
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
})

it('D4 picking another schedule drops the late answer of the one picked before', async () => {
  const fake = await listed([MONTHLY, { ...WEEKLY, label: '周报' }])
  fireEvent.click(row('月报提醒'))
  const late = await fake.next('read-schedule')
  fireEvent.click(row('周报'))
  await answer(late, { outcome: 'succeeded', body: DETAIL })
  expect(late.options?.signal?.aborted).toBe(true)
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
})

it('D5 a late answer of the schedule picked before, arriving after the new one, does not replace it', async () => {
  const fake = await listed([MONTHLY, { ...WEEKLY, label: '周报' }])
  fireEvent.click(row('月报提醒'))
  const late = await fake.next('read-schedule')
  fireEvent.click(row('周报'))
  await answer(await fake.next('read-schedule'), {
    outcome: 'succeeded',
    body: { ...DETAIL, schedule: 'sch_weekly', label: '周报', control: 'draft' },
  })
  await answer(late, { outcome: 'succeeded', body: DETAIL })
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('周报')
  expect(screen.getByLabelText('日程详情').textContent).toContain('草稿')
})

it('D6 回到列表 closes the record without reading the list again', async () => {
  const fake = await listed([MONTHLY])
  await picked(fake)
  fireEvent.click(screen.getByRole('button', { name: '回到列表' }))
  expect(workspace().getAttribute('data-detail')).toBe('false')
  expect(screen.getByText('选一个日程看它的安排。')).toBeTruthy()
  expect(row('月报提醒').getAttribute('aria-current')).toBeNull()
  expect(listCalls(fake)).toBe(1)
})
