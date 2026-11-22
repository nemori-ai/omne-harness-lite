// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { formatInstant } from '@omne-harness/ui-kit'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { arrange, type ListedSession, type SessionList } from '../src/model/session-list.ts'
import { SessionListView } from '../src/view/session-list-panel.tsx'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage } from './fixtures/frames.ts'
import { stubInView } from './fixtures/in-view.ts'
import { mountModule, providerOf, TAKEN } from './fixtures/shell.tsx'

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
const holderOf = (root: Context) => providerOf(root, TAKEN.modelChoices)

describe('会话列表的顶上一行', () => {
  it('「新建会话」是导航那一列里的一行：图标加字的安静钮，不是描边框；模型列着也不在侧栏里选，新会话不带模型', async () => {
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
    expect(create.getAttribute('data-variant')).toBe('ghost')
    expect(create.classList.contains('omne-sessions-new')).toBe(true)
    expect([...create.children].map(child => child.tagName.toLowerCase())).toEqual(['svg', 'span'])
    expect(create.querySelector('svg[data-icon="add"][aria-hidden]')).not.toBeNull()
    expect(create.textContent).toBe('新建会话')
    expect(create.parentElement?.classList.contains('omne-session-sidebar')).toBe(true)
    expect(screen.queryByRole('button', { name: /模型/u })).toBeNull()
    expect(document.querySelector('.omne-session-sidebar')?.textContent).not.toMatch(/模型/u)
    fireEvent.click(create)
    expect((await fake.next('create-session')).body).toEqual({
      createCallId: expect.any(String),
      purpose: '',
    })
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
    const rows = within(within(list()).getByRole('list')).getAllByRole('button')
    expect(rows.every(row => row.closest('[data-glide-menu]') !== null)).toBe(true)
    expect(rows.every(row => row.hasAttribute('data-glide-row'))).toBe(true)
    expect(rows.map(row => row.getAttribute('data-selected'))).toEqual(['false', 'true'])
  })

  it('当前会话只在对话页显示着时是选中的底；别的页显示着时没有一行被选中', async () => {
    const fake = createFakeClient()
    const { shell } = await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_a', '甲'), listed('ses_b', '乙')]),
    )
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '乙' }))
    await settle()
    const marks = () =>
      within(within(list()).getByRole('list'))
        .getAllByRole('button')
        .map(row => [row.getAttribute('data-selected'), row.getAttribute('aria-current')])
    expect(marks()).toEqual([
      ['false', null],
      ['true', 'true'],
    ])
    act(() => shell.navigate('history-search'))
    expect(marks()).toEqual([
      ['false', null],
      ['false', null],
    ])
    act(() => shell.navigate('conversation'))
    expect(marks()).toEqual([
      ['false', null],
      ['true', 'true'],
    ])
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
    // Words of the shared table, drawn as state words: no pill around them.
    expect(
      [word('在建的'), word('冻住的')].map(node => node?.getAttribute('data-state-word')),
    ).toEqual(['initializing', 'frozen'])
    expect(document.querySelector('[data-status-pill]')).toBeNull()
    expect(screen.getByRole('button', { name: /在跑的/u }).textContent).toBe('在跑的')
    expect(screen.getByRole('button', { name: /歇着的/u }).textContent).toBe('歇着的')
  })
})

describe('会话列表的加载、空与读不到', () => {
  it('读首页时一行「正在读会话列表……」；空时列表什么都不写，主区的那一句已经说了，顶上就是「新建会话」', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    const first = await fake.next('list-sessions')
    expect(within(list()).getByRole('status').textContent).toBe('正在读会话列表……')
    first.answer(listPage([]))
    await settle()
    expect(within(list()).queryByRole('status')).toBeNull()
    expect(list().textContent).toBe('')
    expect(document.querySelector('.omne-session-sidebar .empty-state')).toBeNull()
    expect(screen.getAllByText('点「新建会话」开始一段对话。')).toHaveLength(1)
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
    expect(
      within(list()).getByRole('button', { name: '重试' }).querySelector('svg[data-icon="retry"]'),
    ).not.toBeNull()
    fireEvent.click(within(list()).getByRole('button', { name: '重试' }))
    ;(await fake.next('list-sessions')).answer({ outcome: 'denied' })
    await settle()
    expect(notice()?.getAttribute('data-tone')).toBe('neutral')
    expect(notice()?.textContent).toBe('没有权限，或登录已失效。')
    expect(within(list()).queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('末尾「列表可能不全」是说明字号', async () => {
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_a', '甲')], 'cur-2', 'partial'),
    )
    await settle()
    const end = list().querySelector('.omne-sessions-end')!
    expect(end.querySelector('.omne-sessions-note')?.textContent).toBe('列表可能不全')
  })
})

describe('会话列表的末尾：进了视野就接着读，不放「更多」', () => {
  afterEach(() => vi.unstubAllGlobals())

  const reads = (fake: ReturnType<typeof createFakeClient>) =>
    fake.calls.filter(call => call.operation === 'list-sessions').length

  it('末尾进了视野就读下一页；读着时不重读；读完了不再读', async () => {
    const view = stubInView()
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')], 'cur-2'))
    await settle()
    expect(within(list()).queryByRole('button', { name: '更多' })).toBeNull()
    expect(list().textContent).not.toContain('更多')
    expect(reads(fake)).toBe(1)
    act(() => view.enter())
    const second = await fake.next('list-sessions')
    expect(second.body).toEqual({ tenant: expect.anything(), cursor: 'cur-2' })
    act(() => view.enter())
    await settle()
    expect(reads(fake)).toBe(2)
    second.answer(listPage([listed('ses_b', '乙')], 'cur-3'))
    await settle()
    act(() => view.enter())
    const third = await fake.next('list-sessions')
    expect(third.body).toEqual({ tenant: expect.anything(), cursor: 'cur-3' })
    third.answer(listPage([listed('ses_c', '丙')]))
    await settle()
    expect(
      [...list().querySelectorAll('.omne-session-item-title')].map(node => node.textContent),
    ).toEqual(['甲', '乙', '丙'])
    expect(view.watched()).toEqual([])
    act(() => view.enter())
    await settle()
    expect(reads(fake)).toBe(3)
  })

  it('读不到：照现有的说法，行内通知带「重试」，不另加钮，末尾也不再自己读', async () => {
    const view = stubInView()
    const fake = createFakeClient()
    await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_a', '甲')], 'cur-2', 'partial'),
    )
    await settle()
    act(() => view.enter())
    ;(await fake.next('list-sessions')).answer({ outcome: 'basis-unavailable' })
    await settle()
    const notice = list().querySelector('[data-inline-notice]')
    expect(notice?.textContent).toContain('会话列表暂时读不到。')
    expect(list().querySelector('.omne-sessions-note')?.textContent).toBe('列表可能不全')
    expect(
      within(list())
        .getAllByRole('button')
        .filter(button => !button.hasAttribute('data-segment'))
        .map(button => button.textContent),
    ).toEqual(['甲', '重试'])
    expect(view.watched()).toEqual([])
    act(() => view.enter())
    await settle()
    expect(reads(fake)).toBe(2)
  })
})

const id = (letter: string) => letter.repeat(64)
const item = (letter: string, extra: Partial<ListedSession> = {}): ListedSession =>
  ({
    session: id(letter),
    createdAt: null,
    lastActivityAt: null,
    lifecycle: 'dormant',
    title: `会话 ${letter}`,
    relation: 'main',
    parent: null,
    origin: null,
    root: id(letter),
    depth: 0,
    attendance: 'attended',
    definition: 'coding',
    ...extra,
  }) as ListedSession
const child = (letter: string, parent: string, depth = 1) =>
  item(letter, { relation: 'child', parent: id(parent), depth, attendance: 'unattended' })
const A = item('a')
const B = item('b')
const A1 = child('c', 'a')
const A11 = child('d', 'c', 2)
const HANDED = item('e', { relation: 'handoff', origin: id('a') })
const ORPHAN = child('f', 'z')
const ALL = [A1, B, A11, A, HANDED, ORPHAN]
const placed = (rows: ReturnType<typeof arrange>) =>
  rows.map(row => `${'>'.repeat(row.level)}${row.item.session[0] ?? ''}`)

describe('the order of the session list', () => {
  it('puts each child under its parent, layer by layer, and keeps the order of the rest', () => {
    expect(placed(arrange(ALL, 'all'))).toEqual(['b', 'a', '>c', '>>d', 'e', 'f'])
  })

  it('keeps a child whose parent is not in the list at the top, where it stood', () => {
    expect(placed(arrange([ORPHAN, A, A1], 'all'))).toEqual(['f', 'a', '>c'])
  })

  it('reads a row that does not say what the session is to others as a main session', () => {
    const { relation: _r, parent: _p, attendance: _a, ...old } = A
    expect(placed(arrange([old as ListedSession, A1], 'main'))).toEqual(['a'])
    expect(placed(arrange([old as ListedSession, A1], 'all'))).toEqual(['a', '>c'])
  })

  it.each([
    ['main', ['b', 'a']],
    ['child', ['c', '>d', 'f']],
    ['handoff', ['e']],
  ] as const)('shows only the sessions of the relation %s', (relation, expected) => {
    expect(placed(arrange(ALL, relation))).toEqual(expected)
  })
})

describe('the session list as a person sees it', () => {
  const read: SessionList = {
    kind: 'read',
    issued: 1,
    page: { sessions: ALL, next: null, completeness: 'complete' },
  }
  const show = (onOpen = vi.fn()) => {
    render(
      <SessionListView
        list={read}
        current={null}
        locked={false}
        onOpen={onOpen}
        driver={{ loadList: vi.fn(), loadMoreSessions: vi.fn() } as never}
      />,
    )
    return onOpen
  }
  const rows = () =>
    within(screen.getByRole('navigation', { name: '会话列表' }))
      .getAllByRole('listitem')
      .map(row => ({ text: row.textContent ?? '', level: row.getAttribute('data-level') }))

  it('marks a child session and who attends it, and sets it in under its parent', () => {
    show()
    expect(rows().map(row => row.level)).toEqual(['0', '0', '1', '2', '0', '0'])
    const [, parent, first, , handed] = rows()
    expect(first?.text).toContain('会话 c')
    expect(first?.text).toContain('子会话')
    expect(first?.text).toContain('无人值守')
    expect(parent?.text).not.toContain('子会话')
    expect(parent?.text).not.toContain('无人值守')
    expect(handed?.text).toContain('交接而来')
  })

  it('narrows the list by relation, and opens the session a person picks', () => {
    const onOpen = show()
    fireEvent.click(screen.getByRole('button', { name: '子会话' }))
    expect(rows().map(row => row.text.slice(0, 4))).toEqual(['会话 c', '会话 d', '会话 f'])
    fireEvent.click(screen.getByRole('button', { name: /会话 d/u }))
    expect(onOpen).toHaveBeenCalledWith(id('d'))
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(rows()).toHaveLength(6)
  })

  it('says so when the relation a person picked has no session in what is loaded', () => {
    render(
      <SessionListView
        list={{ ...read, page: { ...read.page, sessions: [A, B] } } as SessionList}
        current={null}
        locked={false}
        onOpen={vi.fn()}
        driver={{} as never}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '交接而来' }))
    expect(screen.getByText('已载入的会话里没有这一类。')).toBeTruthy()
  })
})
