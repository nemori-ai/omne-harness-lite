// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const DAY = {
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
  expect(screen.getAllByRole('status', { name: '读取中' })).toHaveLength(2)
  return { fake, view }
}

const HEALTHY = {
  queryAvailability: 'available',
  supply: 'ok',
  horizon: 'ok',
  coverageStart: '2026-01-01',
  coverageEnd: '2026-12-31',
  knowledgeAsOf: null,
  remainingCoverageDays: 300,
  consecutiveFailures: 0,
  lastSuccess: null,
  pendingRuns: 0,
  sources: [],
  reasons: [],
}

const health = (...calendars: Readonly<Record<string, unknown>>[]) => ({
  outcome: 'succeeded',
  body: { calendars: calendars.map(item => ({ ...HEALTHY, ...item })) },
})

/** The setting row of one shipped calendar, found by the name it shows. */
function rowOf(name: string): HTMLElement {
  const rows = [...document.querySelectorAll<HTMLElement>('#calendar-shipped .setting-row')]
  const row = rows.find(item =>
    item.querySelector('.setting-row-label')?.textContent?.includes(name),
  )
  if (row === undefined) throw new Error(`no setting row for ${name}`)
  return row
}

const wordOf = (row: HTMLElement) =>
  row.querySelector('.setting-row-control [data-state-word]')?.textContent ?? null

it('P1 draws the effective calendar as facts, and every shipped calendar as one setting row', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-environment'), { outcome: 'succeeded', body: ENVIRONMENT })
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  const facts = screen.getByLabelText('当前环境').textContent
  expect(facts).toContain('中国法定节假日')
  expect(facts).toContain('Asia/Shanghai')
  expect(facts).toContain('2026.1')
  expect(screen.queryByRole('table')).toBeNull()
  expect(document.querySelectorAll('#calendar-shipped .setting-row')).toHaveLength(2)
  const effective = rowOf('中国法定节假日')
  expect(effective.querySelector('.setting-row-label')?.textContent).toBe('中国法定节假日生效')
  expect(effective.querySelector('.setting-row-hint')?.textContent).toBe(
    'Asia/Shanghai · 2026.1 · 覆盖到 2026-12-31',
  )
  const other = rowOf('日本法定节假日')
  expect(other.querySelector('.setting-row-label')?.textContent).toBe('日本法定节假日')
  expect(other.querySelector('.setting-row-hint')?.textContent).toBe(
    'Asia/Tokyo · 没有可用的版本 · 没有覆盖',
  )
})

it('P1b a deployment that ships no calendar says so', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: { calendars: [] } })
  expect(screen.getByText('部署供应的日历会列在这里。')).toBeTruthy()
})

it('P2 an answer that is not readable is an inline notice in its section with a retry, which reads again', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-environment'), { outcome: 'uncertain' })
  await answer(await fake.next('list-calendars'), { outcome: 'basis-unavailable' })
  const environment = document.querySelector('#calendar-environment [data-inline-notice]')
  expect(environment?.textContent).toContain('读不出：没有收到确定的答复。')
  expect(environment?.getAttribute('data-tone')).toBe('neutral')
  const shipped = document.querySelector('#calendar-shipped [data-inline-notice]')
  expect(shipped?.textContent).toContain('读不出：服务端暂时取不到依据。')
  expect(shipped?.getAttribute('data-tone')).toBe('caution')
  expect(screen.queryByRole('button', { name: '重读' })).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: '重试' })[0]!)
  await answer(await fake.next('read-environment'), { outcome: 'succeeded', body: ENVIRONMENT })
  expect(screen.getByLabelText('当前环境').textContent).toContain('Asia/Shanghai')
})

it('P3 the environment the settings name is not shipped: said as such, not as a failure', async () => {
  const { fake } = await opened()
  await answer(await fake.next('read-environment'), {
    outcome: 'unsupported',
    body: { reason: 'environment' },
  })
  const notice = document.querySelector('#calendar-environment [data-inline-notice]')
  expect(notice?.textContent).toBe('当前设置选的日历不在供应里。')
  expect(notice?.querySelector('button')).toBeNull()
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
  const notice = screen.getByText('读不懂当前的租户。').closest('[data-inline-notice]')
  expect(notice?.getAttribute('data-tone')).toBe('danger')
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

it('H1 the health joins the rows: one state word at the row end from the table, none when all is well', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), {
    outcome: 'succeeded',
    body: {
      calendars: [
        ...CALENDARS.calendars,
        {
          ...CALENDARS.calendars[0]!,
          calendar: 'us-federal-holidays',
          timezone: 'America/New_York',
        },
        { ...CALENDARS.calendars[0]!, calendar: 'kr-holidays', timezone: 'Asia/Seoul' },
      ],
    },
  })
  expect(wordOf(rowOf('中国法定节假日'))).toBeNull()
  await answer(
    await fake.next('read-supply-health'),
    health(
      { calendar: 'cn-legal-holidays' },
      { calendar: 'jp-legal-holidays', supply: 'failed', horizon: 'critical' },
      { calendar: 'us-federal-holidays', horizon: 'warning', remainingCoverageDays: 29 },
      { calendar: 'kr-holidays', supply: 'pending', horizon: 'unknown' },
    ),
  )
  expect(document.querySelector('#calendar-health')).toBeNull()
  expect(wordOf(rowOf('中国法定节假日'))).toBeNull()
  expect(rowOf('中国法定节假日').querySelector('.setting-row-control')).toBeNull()
  expect(wordOf(rowOf('日本法定节假日'))).toBe('失败')
  expect(
    rowOf('日本法定节假日').querySelector('[data-state-word]')?.getAttribute('data-tone'),
  ).toBe('danger')
  const late = rowOf('美国联邦假日')
  expect(wordOf(late)).toBe('待处理')
  expect(late.querySelector('.setting-row-hint')?.textContent).toBe(
    'America/New_York · 2026.1 · 覆盖到 2026-12-31，还剩 29 天',
  )
  expect(wordOf(rowOf('kr-holidays'))).toBe('排队中')
})

it('H2 the word for a supply or a horizon nobody can grade is the unknown one', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  await answer(
    await fake.next('read-supply-health'),
    health(
      { calendar: 'cn-legal-holidays', supply: 'unknown' },
      { calendar: 'jp-legal-holidays', horizon: 'unknown' },
    ),
  )
  expect(wordOf(rowOf('中国法定节假日'))).toBe('未确认')
  expect(wordOf(rowOf('日本法定节假日'))).toBe('未确认')
})

it('H3 failed sources fold away under their row as facts: each source with its reason, the failures, the domain words', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  await answer(
    await fake.next('read-supply-health'),
    health(
      { calendar: 'cn-legal-holidays' },
      {
        calendar: 'jp-legal-holidays',
        supply: 'failed',
        consecutiveFailures: 2,
        sources: [
          {
            source: 'cao-syukujitsu-csv',
            observation: 'failed',
            reason: 'fetch failed',
            consecutiveFailures: 2,
          },
          { source: 'holiday-api', observation: 'failed', reason: null, consecutiveFailures: 1 },
          {
            source: 'vacanza-holidays-library',
            observation: 'unchanged',
            reason: null,
            consecutiveFailures: 0,
          },
        ],
        reasons: ['Some source observations are unknown'],
      },
    ),
  )
  expect(rowOf('中国法定节假日').querySelector('.omne-disclosure')).toBeNull()
  const row = rowOf('日本法定节假日')
  const fold = row.querySelector<HTMLElement>('.setting-row-notice .omne-disclosure')
  expect(fold).not.toBeNull()
  const trigger = within(fold!).getByRole('button', { name: '来源' })
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  const facts = within(fold!).getByLabelText('日本法定节假日的来源')
  const pairs = [...facts.querySelectorAll('.fact-list-row')].map(item => [
    item.querySelector('dt')?.textContent,
    item.querySelector('dd')?.textContent,
  ])
  expect(pairs).toEqual([
    ['cao-syukujitsu-csv', 'fetch failed'],
    ['holiday-api', '没有给出原因'],
    ['连续失败', '2 次'],
    ['说明', 'Some source observations are unknown'],
  ])
})

it('H4 the list read and the health still out: the rows are drawn with no word, a loading state under them', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  expect(document.querySelectorAll('#calendar-shipped .setting-row')).toHaveLength(2)
  expect(wordOf(rowOf('日本法定节假日'))).toBeNull()
  const loading = document.querySelector('#calendar-shipped [role=status][aria-label=读取中]')
  expect(loading).not.toBeNull()
  expect(loading?.closest('.setting-row')).toBeNull()
})

it('H5 a health that cannot be read: rows stay without words, a notice under them retries the health alone', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  await answer(await fake.next('read-supply-health'), { outcome: 'basis-unavailable' })
  expect(document.querySelectorAll('#calendar-shipped .setting-row')).toHaveLength(2)
  const notice = document.querySelector<HTMLElement>('#calendar-shipped [data-inline-notice]')
  expect(notice?.textContent).toContain('读不出：服务端暂时取不到依据。')
  expect(notice?.closest('.setting-row')).toBeNull()
  fireEvent.click(within(notice!).getByRole('button', { name: '重试' }))
  await answer(
    await fake.next('read-supply-health'),
    health({ calendar: 'jp-legal-holidays', supply: 'failed' }),
  )
  expect(wordOf(rowOf('日本法定节假日'))).toBe('失败')
  expect(fake.calls.filter(call => call.operation === 'list-calendars')).toHaveLength(1)
})

it('H6 a health the domain refuses says so without a retry', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  await answer(await fake.next('read-supply-health'), { outcome: 'invalid' })
  const notice = document.querySelector('#calendar-shipped [data-inline-notice]')
  expect(notice?.textContent).toBe('读不出供应健康。')
  expect(notice?.querySelector('button')).toBeNull()
})

it('P7 looks a day up on a named calendar and version; the version field appears only with a calendar', async () => {
  const { fake } = await opened()
  await answer(await fake.next('list-calendars'), { outcome: 'succeeded', body: CALENDARS })
  expect(screen.queryByLabelText('版本')).toBeNull()
  fireEvent.click(screen.getByLabelText('按哪份日历'))
  fireEvent.click(await screen.findByRole('option', { name: '日本法定节假日' }))
  const version = screen.getByLabelText('版本') as HTMLInputElement
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

it('L1 while a lookup is out only 查 waits: no loading state, the last result gives way', async () => {
  const { fake } = await opened()
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-10-10' } })
  fireEvent.click(screen.getByRole('button', { name: '查' }))
  await answer(await fake.next('answer'), { outcome: 'succeeded', body: DAY })
  expect(screen.getByLabelText('这一天').tagName).toBe('DL')
  fireEvent.click(screen.getByRole('button', { name: '查' }))
  await fake.next('answer')
  const ask = screen.getByRole('button', { name: '查' }) as HTMLButtonElement
  expect(ask.disabled).toBe(true)
  expect(ask.querySelector('[data-loading-indicator]')).not.toBeNull()
  expect(document.querySelector('#calendar-lookup [role=status]')).toBeNull()
  expect(screen.queryByLabelText('这一天')).toBeNull()
})

it('L2 a lookup the calendar refuses is an inline notice under the row, and no facts', async () => {
  const { fake } = await opened()
  fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-02-30' } })
  fireEvent.click(screen.getByRole('button', { name: '查' }))
  await answer(await fake.next('answer'), { outcome: 'invalid', body: { reason: 'input' } })
  const notice = document.querySelector('#calendar-lookup [data-inline-notice]')
  expect(notice?.textContent).toBe('日期要写成「年-月-日」，而且这一天要存在。')
  expect(screen.queryByLabelText('这一天')).toBeNull()
})
