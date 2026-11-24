// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(text)
  return parsed.value
}
/** The protocol client decodes a JSON leaf into a tree. */
const programTree = {
  kind: 'object',
  entries: [
    { key: 'kind', value: { kind: 'string', value: 'program' } },
    { key: 'programRef', value: { kind: 'string', value: 'probe' } },
    { key: 'input', value: { kind: 'object', entries: [] } },
  ],
}

const MONTHLY = {
  schedule: 'sch_monthly',
  label: '月报提醒',
  control: 'active',
  standing: 'ready',
  author: { kind: 'human' },
  next: null,
  revision: 2,
}
const DETAIL = { ...MONTHLY, createdAt: instant('2026-11-17T03:00:00Z'), definition: {} }
const CARD = {
  job: 'job_1',
  state: 'concluded',
  outcome: 'succeeded',
  stop: 'none',
  origin: 'catchUp',
  acceptedAt: instant('2026-11-30T09:00:00Z'),
  startedAt: instant('2026-11-30T09:00:00Z'),
  endedAt: instant('2026-11-30T09:12:00Z'),
}
const SLOT = {
  kind: 'slot',
  row: 'slot:1',
  schedule: 'sch_monthly',
  at: instant('2026-11-30T09:00:00Z'),
  local: '2026-11-30T17:00:00',
  disposition: 'acceptedExecution',
  reason: 'accepted',
  job: CARD,
}
const SKIPPED = {
  ...SLOT,
  row: 'slot:0',
  at: instant('2026-11-29T09:00:00Z'),
  local: '2026-11-29T17:00:00',
  disposition: 'skipped',
  reason: 'overlap',
  job: null,
}
const LAPSE = {
  kind: 'lapse',
  row: 'lapse:1',
  schedule: 'sch_monthly',
  at: instant('2026-11-20T09:00:00Z'),
  through: instant('2026-11-28T09:00:00Z'),
  cause: 'stopped',
  reason: 'catch-up-latest',
  count: 7,
  selected: 1,
}
const JOB = {
  ...CARD,
  state: 'running',
  outcome: null,
  endedAt: null,
  schedule: 'sch_monthly',
  slot: instant('2026-11-30T09:00:00Z'),
  local: '2026-11-30T17:00:00',
  calendar: 'cn-legal-holidays',
  version: '2026.1',
  revision: 2,
  work: programTree,
  reason: null,
  where: { kind: 'program', program: 'probe', execution: 'program:g:job_1' },
  events: [
    { seq: 1, kind: 'accepted', at: instant('2026-11-30T09:00:00Z') },
    { seq: 2, kind: 'startIntent', at: instant('2026-11-30T09:00:01Z') },
  ],
}

beforeAll(stubAnimation)
beforeEach(() => {
  stubInView()
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

/** The page with one schedule opened and its record and preview read; the runs are left to the test. */
async function opened(detail: object = DETAIL) {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  await answer(await fake.next('list-schedules'), {
    outcome: 'succeeded',
    body: { items: [MONTHLY], next: null },
  })
  fireEvent.click(screen.getByRole('button', { name: /^月报提醒/ }))
  await answer(await fake.next('read-schedule'), { outcome: 'succeeded', body: detail })
  await answer(await fake.next('preview'), {
    outcome: 'succeeded',
    body: { upcoming: [], complete: true },
  })
  return fake
}

const happened = () => screen.getByLabelText('已发生')

async function withRuns(items: unknown[], next: string | null = null) {
  const fake = await opened()
  const list = await fake.next('list-jobs')
  expect(list.body).toMatchObject({ schedule: 'sch_monthly', cursor: null })
  await answer(list, { outcome: 'succeeded', body: { items, next } })
  return fake
}

async function openJob(fake: FakeClient<Client>) {
  fireEvent.click(screen.getByRole('button', { name: /^2026-11-30 17:00/ }))
  const read = await fake.next('read-job')
  expect(read.body).toMatchObject({ job: 'job_1' })
  await answer(read, { outcome: 'succeeded', body: JOB })
}

it('E1 the runs: planned times are not clickable, then each slot with its word and one fact, a skipped one, and a missed stretch', async () => {
  await withRuns([SLOT, SKIPPED, LAPSE])
  expect(screen.getByText('到点时按当时的定义重新核')).toBeTruthy()
  const rows = [...happened().children].map(child => child.textContent)
  expect(rows).toEqual([
    '2026-11-30 17:00完成补跑 · 用时 12 分钟',
    '2026-11-29 17:00已跳过上一次还没收场，按重叠的策略跳过',
    '这一段共 7 次没有补（停机，只补最近几次）',
  ])
  expect(happened().querySelectorAll('button')).toHaveLength(1)
})

it('E2 nothing has happened yet: one sentence; a stretch not counted one by one says so', async () => {
  await withRuns([])
  expect(screen.getByText('还没有到点。')).toBeTruthy()
  cleanup()
  await withRuns([{ ...LAPSE, count: null, reason: 'over-budget' }])
  expect(happened().textContent).toBe('这一段没有逐个算，都没有补（停机，超出了计算的预算）')
})

it('E3 runs that cannot be read say why and read again on 重试', async () => {
  const fake = await opened()
  await answer(await fake.next('list-jobs'), { outcome: 'basis-unavailable' })
  expect(screen.getByText('读不出：服务端暂时取不到依据。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await answer(await fake.next('list-jobs'), {
    outcome: 'succeeded',
    body: { items: [], next: null },
  })
  expect(screen.getByText('还没有到点。')).toBeTruthy()
})

it('E4 a blocked schedule says why at the top of the runs, and what lets it run again', async () => {
  const fake = await opened({
    ...DETAIL,
    standing: 'blocked',
    reasons: ['carrier-missing:notification'],
  })
  await answer(await fake.next('list-jobs'), {
    outcome: 'succeeded',
    body: { items: [], next: null },
  })
  expect(
    screen.getByText('这份安排要发通知，通知还没有接上。接上之后，受阻的这一段按漏过处理。'),
  ).toBeTruthy()
})

it('E5 更早的 reads the page after the cursor and adds it below', async () => {
  const fake = await withRuns([SLOT], 'c2')
  fireEvent.click(screen.getByRole('button', { name: '更早的' }))
  const more = await fake.next('list-jobs')
  expect(more.body).toMatchObject({ cursor: 'c2' })
  await answer(more, { outcome: 'succeeded', body: { items: [SKIPPED], next: null } })
  expect(happened().children).toHaveLength(2)
  expect(screen.queryByRole('button', { name: '更早的' })).toBeNull()
})

it('J1 a run opens its Job: the time as its title, its state, cause, basis, requirement, carrier and steps', async () => {
  const fake = await withRuns([SLOT])
  await openJob(fake)
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('2026-11-30 17:00的作业')
  const facts = screen.getByLabelText('作业详情').textContent
  expect(facts).toContain('状态执行中')
  expect(facts).toContain('成因补跑')
  expect(facts).toContain('依据cn-legal-holidays，版本 2026.1 · 安排的修订 2')
  expect(facts).toContain('要求程序 probe，输入 {}（受理时冻结）')
  expect(facts).toContain('承接程序 probe（执行 program:g:job_1）')
  expect(screen.getByLabelText('经过的每一步').children).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '回到月报提醒' }))
  await answer(await fake.next('read-schedule'), { outcome: 'succeeded', body: DETAIL })
  await answer(await fake.next('list-jobs'), {
    outcome: 'succeeded',
    body: { items: [SLOT], next: null },
  })
  expect(screen.getByLabelText('已发生')).toBeTruthy()
})

it('J2 取消这一次 asks once, sends once, and the Job is read again; a stop not yet confirmed reads as waiting for it to stop', async () => {
  const fake = await withRuns([SLOT])
  await openJob(fake)
  fireEvent.click(screen.getByRole('button', { name: '取消这一次' }))
  expect(fake.calls.filter(call => call.operation === 'cancel-job')).toHaveLength(0)
  fireEvent.click(screen.getAllByRole('button', { name: '取消这一次' }).at(-1)!)
  const cancel = await fake.next('cancel-job')
  expect(cancel.body).toMatchObject({ job: 'job_1' })
  await answer(cancel, {
    outcome: 'succeeded',
    body: { changed: true, job: { ...JOB, stop: 'requested' } },
  })
  await answer(await fake.next('read-job'), {
    outcome: 'succeeded',
    body: { ...JOB, stop: 'requested' },
  })
  expect(screen.getByLabelText('作业详情').textContent).toContain('状态在等它停下')
  expect(screen.queryByRole('button', { name: '取消这一次' })).toBeNull()
})

it('J3 a cancel without a sure answer says so, and 再确认一次 asks for the same cancel by its id', async () => {
  const fake = await withRuns([SLOT])
  await openJob(fake)
  fireEvent.click(screen.getByRole('button', { name: '取消这一次' }))
  fireEvent.click(screen.getAllByRole('button', { name: '取消这一次' }).at(-1)!)
  const cancel = await fake.next('cancel-job')
  await answer(cancel, { outcome: 'unknown' })
  expect(screen.getByText('没有收到确定的答复')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '再确认一次' }))
  const recall = await fake.next('query-cancel-job')
  expect((recall.body as { actionId: string }).actionId).toBe(
    (cancel.body as { actionId: string }).actionId,
  )
  await answer(recall, { outcome: 'succeeded', body: { ...JOB, stop: 'requested' } })
  await answer(await fake.next('read-job'), {
    outcome: 'succeeded',
    body: { ...JOB, stop: 'requested' },
  })
  expect(screen.getByLabelText('作业详情').textContent).toContain('在等它停下')
})

it('J4 a concluded Job has no 取消这一次', async () => {
  const fake = await withRuns([SLOT])
  fireEvent.click(screen.getByRole('button', { name: /^2026-11-30 17:00/ }))
  await answer(await fake.next('read-job'), {
    outcome: 'succeeded',
    body: { ...JOB, state: 'concluded', outcome: 'cancelled' },
  })
  expect(screen.getByLabelText('作业详情').textContent).toContain('状态已取消')
  expect(screen.queryByRole('button', { name: '取消这一次' })).toBeNull()
})

it('E6 a frame of observe-jobs reads the runs and the record again, behind what is shown', async () => {
  const fake = createFakeClient<Client>(OPERATIONS)
  let push: (() => void) | undefined
  const opens: unknown[] = []
  ;(fake.client as unknown as { observe: object }).observe = {
    'observe-jobs': (open: unknown) => {
      opens.push(open)
      return {
        next: () =>
          new Promise(resolve => {
            push = () => resolve({ done: false, value: { kind: 'changed' } })
          }),
      }
    },
  }
  render(<SchedulePage client={fake.client} tenant={TENANT} />)
  await answer(await fake.next('list-schedules'), {
    outcome: 'succeeded',
    body: { items: [MONTHLY], next: null },
  })
  fireEvent.click(screen.getByRole('button', { name: /^月报提醒/ }))
  await answer(await fake.next('read-schedule'), { outcome: 'succeeded', body: DETAIL })
  await answer(await fake.next('preview'), {
    outcome: 'succeeded',
    body: { upcoming: [], complete: true },
  })
  await answer(await fake.next('list-jobs'), {
    outcome: 'succeeded',
    body: { items: [], next: null },
  })
  expect(opens).toHaveLength(1)
  await act(async () => push?.())
  const again = await fake.next('list-jobs')
  expect(screen.getByText('还没有到点。')).toBeTruthy()
  expect(screen.queryByRole('status', { name: '读取中' })).toBeNull()
  await answer(again, { outcome: 'succeeded', body: { items: [SLOT], next: null } })
  expect(happened().children).toHaveLength(1)
  expect(fake.calls.filter(call => call.operation === 'read-schedule')).toHaveLength(2)
})
