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
  expect(screen.getAllByRole('status', { name: '读取中' })).toHaveLength(3)
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
  const rows = screen.getAllByRole('row').map(row => row.textContent)
  expect(rows.filter(text => text?.includes('生效'))).toEqual([
    expect.stringContaining('中国法定节假日'),
  ])
  expect(rows[1]).toContain('没有可用的版本')
})

it('P1b a deployment that ships no calendar says so', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: { calendars: [] } })
  expect(screen.getByText('这个部署没有供应任何日历。')).toBeTruthy()
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
    '这一天不在所选日历与版本的覆盖范围里（版本不存在也是这样），不猜。',
  ],
  [{ outcome: 'invalid', body: { reason: 'timezone' } }, '当前时区不合法。'],
  [{ outcome: 'unsupported', body: { reason: 'environment' } }, '当前设置选的日历不在供应里。'],
  [{ outcome: 'unsupported', body: { reason: 'search-limit' } }, '当前日历答不了这个问题。'],
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

it('P4b the lookup cannot be sent empty, nor again while one is out', async () => {
  const { fake } = await opened()
  const ask = screen.getByRole('button', { name: '查' }) as HTMLButtonElement
  expect(ask.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '  ' } })
  expect(ask.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-10-10' } })
  expect(ask.disabled).toBe(false)
  fireEvent.submit(ask.closest('form')!)
  await fake.next('answer')
  expect(ask.disabled).toBe(true)
})

it('P6b the late answer of the old tenant, arriving after the answer for the new tenant, does not replace it', async () => {
  const { fake, view } = await opened(TENANT_A)
  const late = await fake.next('read-environment')
  view.rerender(<CalendarPage client={fake.client} tenant={TENANT_B} />)
  await answer(await fake.next('read-environment'), { outcome: 'succeeded', body: ENVIRONMENT })
  await answer(late, { outcome: 'succeeded', body: { ...ENVIRONMENT, timezone: 'Europe/Paris' } })
  expect(screen.getByLabelText('当前环境').textContent).toContain('Asia/Shanghai')
  expect(screen.queryByText('Europe/Paris')).toBeNull()
})

it('P6 shows the supply health of every calendar in words, warnings and failures marked', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-supply-health'), {
    outcome: 'succeeded',
    body: {
      calendars: [
        {
          calendar: 'jp-legal-holidays',
          queryAvailability: 'available',
          supply: 'failed',
          horizon: 'warning',
          coverageStart: '1955-01-01',
          coverageEnd: '2027-12-31',
          knowledgeAsOf: null,
          remainingCoverageDays: 298,
          consecutiveFailures: 2,
          lastSuccess: null,
          pendingRuns: 0,
          sources: [
            {
              source: 'cao-syukujitsu-csv',
              observation: 'failed',
              reason: 'fetch failed',
              consecutiveFailures: 2,
            },
            {
              source: 'vacanza-holidays-library',
              observation: 'unchanged',
              reason: null,
              consecutiveFailures: 0,
            },
          ],
          reasons: ['Some source observations are unknown'],
        },
      ],
    },
  })
  const health = screen.getByLabelText('各日历的供应健康').textContent
  expect(health).toContain('来源 cao-syukujitsu-csv 失败：fetch failed')
  expect(health).not.toContain('vacanza-holidays-library')
  expect(health).toContain('Some source observations are unknown')
  expect(health).toContain('日本法定节假日')
  expect(health).toContain('供应失败，连续失败 2 次')
  expect(health).toContain('覆盖快用完了')
  expect(health).toContain('覆盖到 2027-12-31，还剩 298 天')
})

it('P6b a health that cannot be read says so, not as an empty table', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-supply-health'), { outcome: 'basis-unavailable' })
  expect(screen.queryByLabelText('各日历的供应健康')).toBeNull()
  expect(document.querySelector('#calendar-health')?.textContent).toContain('服务端暂时取不到依据')
})

it('P7 looks a day up on a named calendar and version; the version waits for a calendar', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  const version = screen.getByLabelText('版本') as HTMLInputElement
  expect(version.disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('按哪份日历'))
  fireEvent.click(await screen.findByRole('option', { name: '日本法定节假日' }))
  expect(version.disabled).toBe(false)
  fireEvent.change(version, { target: { value: 'v-0' } })
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-11-03' } })
  fireEvent.click(screen.getByRole('button', { name: '查' }))
  const asked = await fake.next('answer')
  expect(asked.body).toMatchObject({
    question: { kind: 'day', date: '2026-11-03' },
    calendar: 'jp-legal-holidays',
    version: 'v-0',
  })
})
