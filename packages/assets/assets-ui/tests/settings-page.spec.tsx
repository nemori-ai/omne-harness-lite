// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { SettingView } from '@omne-harness/assets-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import { SettingsPage } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'

const TENANT_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const TENANT = readTenantText(TENANT_TEXT)
const INDEPENDENT = { kind: 'independent' }

beforeAll(stubAnimation)

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const text = (value: string) => ({ kind: 'string', value }) as const
const schema = (entries: Record<string, unknown>) => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
})

const CALENDAR = { kind: 'independent', providerId: 'calendar', definitionId: 'environment' }
const SCHEDULE = { kind: 'independent', providerId: 'schedule', definitionId: 'agent-authoring' }
const CALENDAR_GROUP = { id: 'calendar', title: '日历与时区', description: '日期问题用的日历。' }
const SCHEDULE_GROUP = {
  id: 'authoring',
  title: 'agent 管理日程',
  description: 'agent 能怎样改日程。',
}

function ordinary(
  owner: typeof CALENDAR,
  group: typeof CALENDAR_GROUP,
  item: string,
  title: string,
  valueSchema: unknown,
  own: unknown = { kind: 'unset' },
): SettingView {
  return {
    kind: 'ordinary',
    owner,
    item,
    revision: '3',
    declaration: {
      title,
      purpose: `${title}的用途。`,
      appliesAt: '下一次读取起生效。',
      clearEffect: '这一层不再提供这个值。',
      group,
    },
    valueSchema,
    default: { kind: 'unset' },
    own,
    effective: { value: { kind: 'unset' }, source: null },
    lockedBy: null,
    editable: { kind: 'yes' },
  } as SettingView
}

const TIMEZONE = ordinary(
  CALENDAR,
  CALENDAR_GROUP,
  'timezone',
  '时区',
  schema({ type: text('string') }),
)
const WHICH = ordinary(
  CALENDAR,
  CALENDAR_GROUP,
  'calendar',
  '生效的日历',
  schema({ type: text('string'), enum: { kind: 'array', items: [text('cn'), text('iso')] } }),
  { kind: 'set', value: text('cn') },
)
const MODE = ordinary(
  SCHEDULE,
  SCHEDULE_GROUP,
  'mode',
  '管理方式',
  schema({ enum: { kind: 'array', items: [text('auto'), text('draft')] } }),
)

async function opened(
  items: readonly SettingView[] = [TIMEZONE, WHICH, MODE],
): Promise<FakeClient> {
  const fake = createFakeClient()
  render(<SettingsPage client={fake.client} tenant={TENANT_TEXT} newId={() => 'op-1'} />)
  const list = await fake.next('list-settings')
  expect(list.body).toEqual({ tenant: TENANT, scope: INDEPENDENT, after: null, limit: 100 })
  list.answer({ outcome: 'succeeded', body: { items, next: null, completeness: 'complete' } })
  await settle()
  return fake
}

const block = (title: string) => screen.getByRole('region', { name: title })
const row = (title: string) => screen.getByRole('heading', { name: title }).closest('li')!

it('只要独立设置，按归属与分组分块：块的标题与说明取分组的', async () => {
  await opened()
  const calendar = within(block('日历与时区'))
  expect(calendar.getByText('日期问题用的日历。')).toBeTruthy()
  expect(
    calendar.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent),
  ).toEqual(['时区', '生效的日历'])
  const schedule = within(block('agent 管理日程'))
  expect(
    schedule.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent),
  ).toEqual(['管理方式'])
})

it('枚举的挑一个再点「设置」：写的是独立归属的这一项，值是挑的那个字符串', async () => {
  const fake = await opened()
  const which = within(row('生效的日历'))
  expect(which.getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual([
    'cn',
    'iso',
  ])
  const set = which.getByRole('button', { name: '设置' }) as HTMLButtonElement
  expect(set.disabled).toBe(true)
  fireEvent.click(which.getByRole('radio', { name: 'iso' }))
  fireEvent.click(set)
  const write = await fake.next('set-setting')
  expect(write.body).toEqual({
    tenant: TENANT,
    owner: CALENDAR,
    item: 'calendar',
    operation: 'op-1',
    expectedRevision: '3',
    value: { kind: 'ordinary', value: text('iso') },
  })
})

it('文本的填好再点「设置」：值是填的文本；没填时不能交', async () => {
  const fake = await opened()
  const timezone = within(row('时区'))
  const set = timezone.getByRole('button', { name: '设置' }) as HTMLButtonElement
  expect(set.disabled).toBe(true)
  fireEvent.change(timezone.getByRole('textbox', { name: '时区：填一个值' }), {
    target: { value: 'Asia/Shanghai' },
  })
  fireEvent.click(set)
  const write = await fake.next('set-setting')
  expect(write.body).toMatchObject({
    owner: CALENDAR,
    item: 'timezone',
    value: { kind: 'ordinary', value: text('Asia/Shanghai') },
  })
})

it('读不了时一句话与「重试」，重试从头再读；没有一项时一句话', async () => {
  const fake = createFakeClient()
  render(<SettingsPage client={fake.client} tenant={TENANT_TEXT} />)
  ;(await fake.next('list-settings')).answer({ outcome: 'unavailable' })
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  const again = await fake.next('list-settings')
  expect(again.body).toMatchObject({ scope: INDEPENDENT, after: null })
  again.answer({ outcome: 'succeeded', body: { items: [], next: null, completeness: 'complete' } })
  await settle()
  expect(screen.getByText('这一层还没有不属于资产的设置。')).toBeTruthy()
})

it('P0 the settings page, its groups and its rows carry their parts', async () => {
  await opened()
  const on = (name: string) => document.querySelectorAll(`[data-omne-part="${name}"]`)
  expect(on('assets.settings-page')[0]?.classList.contains('assets-settings')).toBe(true)
  expect(on('assets.settings-page.group')).toHaveLength(2)
  expect(on('assets.setting')[0]?.tagName).toBe('LI')
  expect(on('assets.setting.control')[0]?.classList.contains('assets-setting-control')).toBe(true)
})
