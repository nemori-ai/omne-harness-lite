// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { formatInstant } from '@omne-harness/ui-kit'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { sessionModelChoicesKey, type ModelChoiceHolder } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    setPointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const list = () => screen.getByRole('navigation', { name: '会话列表' })
const minutesAgo = (minutes: number): Instant => {
  const parsed = parseInstant(new Date(Date.now() - minutes * 60_000).toISOString())
  if (!parsed.ok) throw new Error('fixture instant')
  return parsed.value
}
const holderOf = (root: Context): ModelChoiceHolder =>
  (root as unknown as { get(name: string): unknown }).get(
    sessionModelChoicesKey,
  ) as ModelChoiceHolder

describe('会话列表的顶上一行', () => {
  it('「新建会话」是描边、紧凑的钮，新会话的模型是它右边同一行里的下拉，不另占一行', async () => {
    const fake = createFakeClient()
    const { root } = await mountModule(fake.client, TENANT)
    await act(async () => {
      holderOf(root).attach({
        list: async () => ({
          kind: 'listed',
          choices: [{ route: 'openai/gpt-x', selectable: true, note: null }],
        }),
      })
    })
    await settle()
    const create = screen.getByRole('button', { name: '新建会话' })
    const picker = screen.getByRole('button', { name: /新会话的模型/u })
    expect(create.getAttribute('data-variant')).toBe('outline')
    expect(create.getAttribute('data-size')).toBe('compact')
    expect(picker.parentElement).toBe(create.parentElement)
    expect([...create.parentElement!.children]).toEqual([create, picker])
    expect(picker.textContent).toBe('默认模型')
  })
})

describe('会话列表的行', () => {
  it('一行标题，下面只有最近一次活动的相对时间；精确的时刻在提示里，不写创建时间与绝对时间', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    const at = minutesAgo(3)
    const created = minutesAgo(600)
    ;(await fake.next('list-sessions')).answer(
      // The fixture types the creation time as absent; the wire may carry one, and the row must not show it.
      listPage([
        { ...listed('ses_t', '周末安排'), lastActivityAt: at, createdAt: created as never },
      ]),
    )
    await settle()
    const row = screen.getByRole('button', { name: /周末安排/u })
    expect(row.querySelector('.omne-session-item-title')?.textContent).toBe('周末安排')
    const time = row.querySelector('time')!
    expect(time.textContent).toBe('3 分钟前')
    expect(time.getAttribute('title')).toBe(formatInstant(time.getAttribute('datetime')!))
    expect(row.querySelectorAll('time')).toHaveLength(1)
    expect(row.textContent).toBe('周末安排3 分钟前')
  })

  it('每行是滑动高亮的行，当前会话是选中的底', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_a', '甲'), listed('ses_b', '乙')]),
    )
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '乙' }))
    await settle()
    const rows = within(list()).getAllByRole('button')
    expect(rows.every(row => row.closest('[data-glide-menu]') !== null)).toBe(true)
    expect(rows.every(row => row.hasAttribute('data-glide-row'))).toBe(true)
    expect(rows.map(row => row.getAttribute('data-selected'))).toEqual(['false', 'true'])
  })

  it('状态词只给正在初始化与已冻结，中性；正常的会话什么都不写', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(
      listPage([
        listed('ses_i', '在建的', 'initializing'),
        listed('ses_f', '冻住的', 'frozen'),
        listed('ses_a', '在跑的', 'active'),
        listed('ses_d', '歇着的', 'dormant'),
      ]),
    )
    await settle()
    const word = (name: string) =>
      screen.getByRole('button', { name: new RegExp(name, 'u') }).querySelector('[data-tone]')
    expect(word('在建的')?.textContent).toBe('正在初始化')
    expect(word('冻住的')?.textContent).toBe('已冻结')
    expect([word('在建的'), word('冻住的')].map(node => node?.getAttribute('data-tone'))).toEqual([
      'neutral',
      'neutral',
    ])
    expect(screen.getByRole('button', { name: /在跑的/u }).textContent).toBe('在跑的')
    expect(screen.getByRole('button', { name: /歇着的/u }).textContent).toBe('歇着的')
  })
})

describe('会话列表的加载、空与读不到', () => {
  it('读首页时一行「正在读会话列表……」；空时说新的会话会出现在这里，旁边就是「新建会话」', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    const first = await fake.next('list-sessions')
    expect(within(list()).getByRole('status').textContent).toBe('正在读会话列表……')
    first.answer(listPage([]))
    await settle()
    expect(within(list()).queryByRole('status')).toBeNull()
    expect(list().textContent).toBe('新的会话会出现在这里。')
    expect(screen.getAllByRole('button', { name: '新建会话' })).toHaveLength(1)
  })

  it('有了行之后，活动后的重读不出加载的字', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    ;(await fake.next('create-session')).answer({
      outcome: 'succeeded',
      body: { session: 'ses_new', recovered: false },
    })
    await settle()
    await fake.next('list-sessions')
    expect(list().textContent).not.toContain('正在读会话列表')
  })

  it('读不到能重试是注意的语气并带「重试」；被拒是中性的一句原因，不能重试', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer({ outcome: 'basis-unavailable' })
    await settle()
    const notice = () => list().querySelector('[data-inline-notice]')
    expect(notice()?.getAttribute('data-tone')).toBe('caution')
    expect(notice()?.textContent).toContain('会话列表暂时读不到。')
    fireEvent.click(within(list()).getByRole('button', { name: '重试' }))
    ;(await fake.next('list-sessions')).answer({ outcome: 'denied' })
    await settle()
    expect(notice()?.getAttribute('data-tone')).toBe('neutral')
    expect(notice()?.textContent).toBe('没有权限，或登录已失效。')
    expect(within(list()).queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('末尾「列表可能不全」与「更多」是说明字号', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_a', '甲')], 'cur-2', 'partial'),
    )
    await settle()
    const end = list().querySelector('.omne-sessions-end')!
    expect(end.querySelector('.omne-sessions-note')?.textContent).toBe('列表可能不全')
    expect(within(end as HTMLElement).getByRole('button', { name: '更多' }).className).toContain(
      'text-xs',
    )
  })
})
