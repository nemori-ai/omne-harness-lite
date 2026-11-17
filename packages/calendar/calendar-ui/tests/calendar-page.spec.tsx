// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { calendarProtocol, type CalendarProtocol } from '@omne-harness/calendar-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { CalendarPage } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type Call } from './fixtures/fake-client.ts'

type Client = ClientOf<CalendarProtocol>
const OPERATIONS = Object.keys(calendarProtocol.operations)
const TENANT_A =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const TENANT_B =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'

const ENVIRONMENT = {
  calendar: 'cn-legal-holidays',
  timezone: 'Asia/Shanghai',
  revision: '3',
  version: '2026.1',
}
const CALENDARS = {
  calendars: [
    {
      calendar: 'cn-legal-holidays',
      timezone: 'Asia/Shanghai',
      version: '2026.1',
      coverageStart: '2026-01-01',
      coverageEnd: '2026-12-31',
    },
    {
      calendar: 'jp-legal-holidays',
      timezone: 'Asia/Tokyo',
      version: null,
      coverageStart: null,
      coverageEnd: null,
    },
  ],
}

beforeAll(stubAnimation)
afterEach(cleanup)

async function answer(call: Call, value: unknown): Promise<void> {
  await act(async () => {
    call.answer(value)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function opened(tenant = TENANT_A) {
  const fake = createFakeClient<Client>(OPERATIONS)
  const view = render(<CalendarPage client={fake.client} tenant={tenant} />)
  return { fake, view }
}

it('P1 draws the effective calendar, its zone and version, and every shipped calendar with its coverage', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-environment'), { outcome: 'succeeded', body: ENVIRONMENT })
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  const facts = screen.getByLabelText('当前环境').textContent
  expect(facts).toContain('中国法定节假日')
  expect(facts).toContain('Asia/Shanghai')
  expect(facts).toContain('2026.1')
  const table = screen.getByLabelText('日历清单').textContent
  expect(table).toContain('2026-01-01 至 2026-12-31')
  expect(table).toContain('日本法定节假日')
  expect(table).toContain('没有覆盖')
  expect(screen.getAllByText('生效')).toHaveLength(1)
})

it('P2 an answer that is not readable says why and offers a reread, which reads again', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-environment'), { outcome: 'uncertain' })
  await answer(await fake.next('list-calendars'), { outcome: 'basis-unavailable' })
  expect(screen.getByText('读不出：没有收到确定的答复。')).toBeTruthy()
  expect(screen.getByText('读不出：服务端暂时取不到依据。')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: '重读' })[0]!)
  await answer(await fake.next('read-environment'), { outcome: 'succeeded', body: ENVIRONMENT })
  expect(screen.getByLabelText('当前环境').textContent).toContain('Asia/Shanghai')
})

it('P3 the environment the settings name is not shipped: said as such, not as a failure', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-environment'), {
    outcome: 'unsupported',
    body: { reason: 'environment' },
  })
  expect(screen.getByText('当前设置选的日历不在供应里。')).toBeTruthy()
})

it('P4 looks up one day and says what kind of day it is, with the calendar and version', async () => {
  const { fake } = await opened()
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-10-10' } })
  fireEvent.click(screen.getByRole('button', { name: '查' }))
  const asked = await fake.next('answer')
  expect(asked.body).toMatchObject({ question: { kind: 'day', date: '2026-10-10' } })
  await answer(asked, {
    outcome: 'succeeded',
    body: {
      calendar: 'cn-legal-holidays',
      version: '2026.1',
      coverageStart: '2026-01-01',
      coverageEnd: '2026-12-31',
      result: {
        kind: 'day',
        date: '2026-10-10',
        classification: 'workingDay',
        working: true,
        adjusted: true,
      },
    },
  })
  const day = screen.getByLabelText('这一天').textContent
  expect(day).toContain('工作日（调休）')
  expect(day).toContain('中国法定节假日，版本 2026.1')
})

it.each([
  [{ outcome: 'invalid', body: { reason: 'input' } }, '日期要写成「年-月-日」，而且这一天要存在。'],
  [
    { outcome: 'unsupported', body: { reason: 'coverage' } },
    '这一天在当前日历的覆盖范围之外，不猜。',
  ],
  [{ outcome: 'denied' }, '读不出：这次登录不能读这个租户的数据。'],
])('P5 a lookup the calendar cannot answer says why (%o)', async (reply, text) => {
  const { fake } = await opened()
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-02-30' } })
  fireEvent.click(screen.getByRole('button', { name: '查' }))
  await answer(await fake.next('answer'), reply)
  expect(screen.getByText(text)).toBeTruthy()
})

it('P6 the tenant changes while a read is out: the late answer of the old tenant is not drawn', async () => {
  const { fake, view } = await opened(TENANT_A)
  const late = await fake.next('read-environment')
  view.rerender(<CalendarPage client={fake.client} tenant={TENANT_B} />)
  await answer(late, { outcome: 'succeeded', body: { ...ENVIRONMENT, timezone: 'Europe/Paris' } })
  expect(late.options?.signal?.aborted).toBe(true)
  expect(screen.queryByText('Europe/Paris')).toBeNull()
  const fresh = await fake.next('read-environment')
  expect(fresh.body).toMatchObject({
    tenant: { account: { text: 'acc_00000000000000000000000002' } },
  })
})

it('P7 a tenant text that cannot be read: nothing is asked', async () => {
  const fake = createFakeClient<Client>(OPERATIONS)
  render(<CalendarPage client={fake.client} tenant="not a tenant" />)
  expect(screen.getByText('读不懂当前的租户。')).toBeTruthy()
  expect(fake.calls).toEqual([])
})
