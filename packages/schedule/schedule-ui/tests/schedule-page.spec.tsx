// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { SchedulePage } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type Call } from './fixtures/fake-client.ts'

type Client = ClientOf<ScheduleProtocol>
const OPERATIONS = Object.keys(scheduleProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

const NEXT = {
  at: '2026-11-30T09:00:00Z',
  local: '2026-11-30 17:00',
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
  basis: { kind: 'blanket', generation: 7 },
  createdAt: '2026-11-17T03:00:00Z',
  definition: {},
}

beforeAll(stubAnimation)
afterEach(cleanup)

async function answer(call: Call, value: unknown): Promise<void> {
  await act(async () => {
    call.answer(value)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function listed(items: unknown[], next: string | null = null) {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  await answer(await fake.next('list-schedules'), { outcome: 'succeeded', body: { items, next } })
  return fake
}

it('L1 lists each schedule with its name, its control, who made it and its next time with the calendar', async () => {
  await listed([MONTHLY, WEEKLY])
  const table = screen.getByLabelText('日程列表').textContent
  expect(table).toContain('月报提醒')
  expect(table).toContain('生效')
  expect(table).toContain('agent（会话 ses_1）')
  expect(table).toContain('2026-11-30 17:00（cn-legal-holidays，版本 2026.1）')
  expect(table).toContain('未命名')
  expect(table).toContain('草稿')
  expect(table).toContain('没有下一次')
})

it('L2 no schedule yet: said as such', async () => {
  await listed([])
  expect(screen.getByText('还没有日程。')).toBeTruthy()
})

it('L3 a list that cannot be read says why and reads again on request', async () => {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  await answer(await fake.next('list-schedules'), { outcome: 'unavailable' })
  expect(screen.getByText('读不出：连不上服务端。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重读' }))
  await answer(await fake.next('list-schedules'), {
    outcome: 'succeeded',
    body: { items: [], next: null },
  })
  expect(screen.getByText('还没有日程。')).toBeTruthy()
})

it('L4 the whole span asks for the ended ones too; more reads the next page after the cursor', async () => {
  const fake = await listed([MONTHLY], 'c1')
  fireEvent.click(screen.getByRole('button', { name: '更多' }))
  const more = await fake.next('list-schedules')
  expect(more.body).toMatchObject({ terminal: false, cursor: 'c1' })
  await answer(more, { outcome: 'succeeded', body: { items: [WEEKLY], next: null } })
  expect(screen.queryByRole('button', { name: '更多' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '全部，含已结束的' }))
  expect((await fake.next('list-schedules')).body).toMatchObject({ terminal: true, cursor: null })
})

it('D1 picking one shows its state, author, the basis it is in effect on, and its next few times', async () => {
  const fake = await listed([MONTHLY])
  fireEvent.click(screen.getByRole('button', { name: '月报提醒' }))
  const read = await fake.next('read-schedule')
  expect(read.body).toMatchObject({ schedule: 'sch_monthly' })
  const preview = await fake.next('preview')
  expect(preview.body).toMatchObject({
    source: { kind: 'schedule', schedule: 'sch_monthly' },
    count: 5,
  })
  await answer(read, { outcome: 'succeeded', body: DETAIL })
  await answer(preview, {
    outcome: 'succeeded',
    body: {
      upcoming: [NEXT, { ...NEXT, at: '2026-12-31T09:00:00Z', local: '2026-12-31 17:00' }],
      complete: false,
    },
  })
  const facts = screen.getByLabelText('日程详情').textContent
  expect(facts).toContain('能按时运行')
  expect(facts).toContain('你的全权同意（设置代次 7）')
  expect(facts).toContain('agent（会话 ses_1）')
  expect(screen.getByLabelText('时间表').children).toHaveLength(2)
  expect(screen.getByText('只列出了能确定的几次。')).toBeTruthy()
})

it.each([
  [{ kind: 'owner' }, '你本人的操作'],
  [
    { kind: 'granular', decision: 'tool-call/abc/card-1' },
    '你对一次请求的回答（tool-call/abc/card-1）',
  ],
  [{ kind: 'none' }, '无：还没有生效'],
])('D2 the basis %o reads as a sentence', async (basis, text) => {
  const fake = await listed([MONTHLY])
  fireEvent.click(screen.getByRole('button', { name: '月报提醒' }))
  await answer(await fake.next('read-schedule'), {
    outcome: 'succeeded',
    body: { ...DETAIL, basis },
  })
  expect(screen.getByLabelText('日程详情').textContent).toContain(text)
})

it('D3 a schedule that is not visible any more, and a preview the calendar cannot answer, say so', async () => {
  const fake = await listed([MONTHLY])
  fireEvent.click(screen.getByRole('button', { name: '月报提醒' }))
  await answer(await fake.next('read-schedule'), { outcome: 'not-visible', body: {} })
  await answer(await fake.next('preview'), { outcome: 'unsupported', body: { reason: 'coverage' } })
  expect(screen.getByText('看不到这条日程。')).toBeTruthy()
  expect(screen.getByText('当前日历答不了接下来几次。')).toBeTruthy()
})

it('D4 picking another schedule drops the late answer of the one picked before', async () => {
  const fake = await listed([MONTHLY, { ...WEEKLY, label: '周报' }])
  fireEvent.click(screen.getByRole('button', { name: '月报提醒' }))
  const late = await fake.next('read-schedule')
  fireEvent.click(screen.getByRole('button', { name: '周报' }))
  await answer(late, { outcome: 'succeeded', body: DETAIL })
  expect(late.options?.signal?.aborted).toBe(true)
  expect(screen.queryByText('月报提醒', { selector: 'dd' })).toBeNull()
})
