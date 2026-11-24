// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readTenantText } from '@omne-harness/public-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntryFocus, rowFor } from '../src/model/entry-focus.ts'
import {
  HistorySearchStore,
  contentOf,
  incompleteText,
  indexText,
  refusalText,
  type SearchAsk,
  type SearchHit,
} from '../src/model/history-search.ts'
import { HistorySearchPage } from '../src/view/history-search.tsx'
import { createFakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  listed,
  listPage,
  page,
  toolResultEntry,
  userEntry,
} from './fixtures/frames.ts'
import { iconButton } from './fixtures/icon-button.ts'
import { stubInView } from './fixtures/in-view.ts'
import { mountModule } from './fixtures/shell.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const WORDS: SearchAsk = { text: '受理', mode: 'words', caseSensitive: false, onlyMine: false }
const hit = (position: string, over: Partial<SearchHit> = {}): SearchHit =>
  ({
    session: 'ses_a',
    position,
    kind: 'message.user',
    at: null,
    snippet: { before: '关于', match: '受理', after: '的设计' },
    ...over,
  }) as SearchHit
const found = (hits: readonly SearchHit[], over: object = {}) => ({
  outcome: 'succeeded' as const,
  body: { hits, next: null, complete: true, incomplete: null, ...over },
})

/** The page's one text field: its name is its placeholder, which changes with the way of asking. */
const box = () => screen.getByRole<HTMLInputElement>('textbox')

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

function storeWith(answers: readonly unknown[]) {
  const search = vi.fn(async (_body: Record<string, unknown>) => {
    const answer = answers[search.mock.calls.length - 1]
    if (answer === 'throw') throw new Error('not sent')
    return answer
  })
  return { store: new HistorySearchStore({ 'search-history': search } as never), search }
}

describe('what a search asks for', () => {
  it('takes words apart at spaces and a pattern as it is; nothing to ask is nothing', () => {
    expect(contentOf({ ...WORDS, text: ' 受理  预算 ' })).toEqual({
      kind: 'literals',
      all: ['受理', '预算'],
      caseSensitive: false,
    })
    expect(contentOf({ ...WORDS, text: 'a b', mode: 'regex', caseSensitive: true })).toEqual({
      kind: 'regex',
      pattern: 'a b',
      caseSensitive: true,
    })
    expect(contentOf({ ...WORDS, text: '   ' })).toBeNull()
    expect(contentOf({ ...WORDS, text: '', mode: 'regex' })).toBeNull()
  })

  it('says in words why a page is not through, and why a search was refused', () => {
    expect(incompleteText({ reason: 'budget', behind: 0, progress: null })).toBe(
      '还没搜完：这次搜索到了上限。',
    )
    expect(incompleteText({ reason: 'tail-budget', behind: 3, progress: null })).toBe(
      '还没搜完：最新的一段还没读完，还有 3 个会话没读完。',
    )
    const progress = { indexed: 4, total: 16 }
    expect(incompleteText({ reason: 'rebuilding', behind: 12, progress })).toBe(
      '还没搜完：索引正在建，还有 12 个会话没读完。',
    )
    expect(indexText({ reason: 'rebuilding', behind: 12, progress })).toBe('索引建到 4/16')
    expect(indexText({ reason: 'budget', behind: 0, progress: null })).toBeNull()
    const invalid = (field: string, reason: string) =>
      ({ outcome: 'invalid', body: { field, reason } }) as never
    expect(refusalText(invalid('query', 'pattern-invalid'))).toBe('这条正则写得不对。')
    expect(refusalText(invalid('query', 'something-new'))).toBe('这次搜索没有被接受：something-new')
    expect(refusalText(invalid('cursor', 'the index was rebuilt'))).toBe(
      '索引换了一份，请重新搜一次。',
    )
    expect(refusalText({ outcome: 'limited', body: {} } as never)).toBe(
      '同时在跑的搜索太多了，稍后再试。',
    )
    expect(refusalText({ outcome: 'denied' } as never)).toBe('没有权限，或登录已失效。')
    expect(refusalText({ outcome: 'basis-unavailable' } as never)).toBe('历史暂时搜不了。')
    expect(refusalText({ outcome: 'unavailable' })).toBe('历史暂时搜不了。')
  })
})

describe('the store of a search', () => {
  it('asks Session and shows what it answered; "only mine" asks for the messages of the person', async () => {
    const { store, search } = storeWith([found([hit('7')]), found([])])
    const seen: string[] = []
    store.subscribe(TENANT, () => seen.push(store.read(TENANT).kind))
    await store.search(TENANT, WORDS)
    expect(seen).toEqual(['searching', 'listed'])
    expect(store.read(TENANT)).toMatchObject({ kind: 'listed', hits: [hit('7')], next: null })
    expect(search.mock.calls[0]![0]).toEqual({
      tenant: readTenantText(TENANT),
      content: { kind: 'literals', all: ['受理'], caseSensitive: false },
      cursor: null,
      modelReadable: 'only',
    })
    await store.search(TENANT, { ...WORDS, onlyMine: true })
    expect(search.mock.calls[1]![0]).toMatchObject({ kinds: ['message.user'] })
  })

  it('goes on from the cursor and adds to what it has; with no way on it asks nothing', async () => {
    const incomplete = { reason: 'budget', behind: 0, progress: null }
    const { store, search } = storeWith([
      found([hit('9')], { next: 'c-2', complete: false, incomplete }),
      found([hit('7')]),
    ])
    await store.search(TENANT, WORDS)
    expect(store.read(TENANT)).toMatchObject({ next: 'c-2', incomplete })
    await store.more(TENANT)
    expect(search.mock.calls[1]![0]).toMatchObject({ cursor: 'c-2', content: { all: ['受理'] } })
    expect(store.read(TENANT)).toMatchObject({
      kind: 'listed',
      hits: [hit('9'), hit('7')],
      next: null,
      incomplete: null,
    })
    await store.more(TENANT)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('keeps the hits it has when a later page is refused, and says why', async () => {
    const { store } = storeWith([
      found([hit('9')], { next: 'c-2' }),
      { outcome: 'invalid', body: { field: 'cursor', reason: 'the index was rebuilt' } },
    ])
    await store.search(TENANT, WORDS)
    await store.more(TENANT)
    expect(store.read(TENANT)).toEqual({
      kind: 'refused',
      ask: WORDS,
      hits: [hit('9')],
      text: '索引换了一份，请重新搜一次。',
    })
  })

  it('shows the answer of the newest ask when an older one comes back later', async () => {
    const fake = createFakeClient()
    const store = new HistorySearchStore(fake.client)
    const first = store.search(TENANT, { ...WORDS, text: '旧' })
    const older = await fake.next('search-history')
    const second = store.search(TENANT, { ...WORDS, text: '新' })
    const newer = await fake.next('search-history')
    newer.answer(found([hit('2')]))
    await second
    older.answer(found([hit('1')]))
    await first
    expect(store.read(TENANT)).toMatchObject({ ask: { text: '新' }, hits: [hit('2')] })
  })

  it('an empty box is the newest ask: nothing is asked, and an older answer that comes back later is not shown', async () => {
    const fake = createFakeClient()
    const store = new HistorySearchStore(fake.client)
    const first = store.search(TENANT, WORDS)
    const older = await fake.next('search-history')
    await store.search(TENANT, { ...WORDS, text: ' ' })
    expect(store.read(TENANT)).toEqual({ kind: 'idle' })
    older.answer(found([hit('1')]))
    await first
    expect(store.read(TENANT)).toEqual({ kind: 'idle' })
  })

  it('asks nothing for an empty box, and says so when the request could not be sent', async () => {
    const { store, search } = storeWith(['throw'])
    await store.search(TENANT, { ...WORDS, text: '  ' })
    expect(search).not.toHaveBeenCalled()
    expect(store.read(TENANT)).toEqual({ kind: 'idle' })
    await store.search(TENANT, WORDS)
    expect(store.read(TENANT)).toMatchObject({ kind: 'refused', text: '历史暂时搜不了。' })
    await store.search('not a tenant', WORDS)
    expect(store.read('not a tenant')).toMatchObject({ kind: 'refused' })
    expect(search).toHaveBeenCalledTimes(1)
  })
})

describe('the search page', () => {
  function shown(answers: readonly unknown[]) {
    const { store, search } = storeWith(answers)
    const onOpen = vi.fn()
    const nameOf = (session: string) => (session === 'ses_a' ? '甲' : null)
    render(<HistorySearchPage store={store} tenant={TENANT} nameOf={nameOf} onOpen={onOpen} />)
    const ask = async (text: string) => {
      fireEvent.change(box(), { target: { value: text } })
      fireEvent.submit(box().form!)
      await settle()
    }
    return { search, onOpen, ask, box }
  }

  it('is a single-column page named 搜索 whose one column is the reading measure, with no button to search', () => {
    shown([])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('搜索')
    const page = screen.getByRole('heading', { level: 1 }).closest('.page-column')
    expect(page?.querySelector(':scope > .page-header')).not.toBeNull()
    const column = page?.querySelector(':scope > .omne-search-column')
    expect(column).not.toBeNull()
    expect(column?.contains(box())).toBe(true)
    expect(page?.querySelector('.page-header')?.contains(box())).toBe(false)
    expect(screen.queryByRole('button', { name: '搜' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^搜/u })).toBeNull()
  })

  it('tops the column with the directory search: the search glyph in the field, the clear button only with words', () => {
    const { box } = shown([])
    const search = box().closest('.list-reading-search') as HTMLElement
    expect(search).not.toBeNull()
    expect(search.parentElement?.className).toBe('omne-search-form')
    expect(search.querySelector(':scope > svg[data-icon="search"]')).not.toBeNull()
    expect(box().getAttribute('placeholder')).toBe('一个或几个词，用空格分开')
    expect(box().getAttribute('aria-label')).toBe('一个或几个词，用空格分开')
    expect(within(search).queryByRole('button', { name: '清除搜索' })).toBeNull()
    fireEvent.change(box(), { target: { value: '受理' } })
    iconButton(search, '清除搜索', 'close')
  })

  it('puts 词 and 正则 and then the two switches on one quiet line under the field', () => {
    const { box } = shown([])
    const line = document.querySelector('.omne-search-ways') as HTMLElement
    expect(box().closest('.list-reading-search')?.nextElementSibling).toBe(line)
    const modes = within(line).getByRole('group', { name: '按词还是按正则' })
    const mine = within(line).getByRole('checkbox', { name: '只看我说的' })
    const cased = within(line).getByRole('checkbox', { name: '区分大小写' })
    expect(line.firstElementChild).toBe(modes)
    expect(modes.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mine.compareDocumentPosition(cased) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(line.contains(box())).toBe(false)
    expect(line.querySelector('details, [data-slot="collapsible"]')).toBeNull()
  })

  it('searches on Enter: the form has one text field and no submit button, so Enter submits it', async () => {
    const { search, box } = shown([found([])])
    const form = box().form!
    // HTML implicit submission: with no submit button, Enter submits a form that has exactly one such field.
    const blocking = [...form.querySelectorAll('input')].filter(input =>
      ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(input.type),
    )
    expect(blocking).toEqual([box()])
    expect(form.querySelectorAll('button[type="submit"], input[type="submit"]')).toHaveLength(0)
    expect(form.querySelectorAll('button:not([type])')).toHaveLength(0)
    fireEvent.change(box(), { target: { value: '受理' } })
    fireEvent.submit(form)
    await settle()
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('lists the hits newest first as the rows of a list: the session, the snippet, then who said it and when', async () => {
    const at = parseInstant(new Date(Date.now() - 3 * 60_000).toISOString())
    if (!at.ok) throw new Error('fixture instant')
    const tool = hit('5', { session: 'ses_unknown_session', kind: 'message.tool' })
    const { ask, onOpen } = shown([found([hit('9', { at: at.value }), tool])])
    await ask('受理')
    const rows = screen.getAllByRole('listitem').map(item => item.querySelector('button')!)
    expect(rows.every(row => row.classList.contains('list-reading-row'))).toBe(true)
    expect(rows.every(row => row.hasAttribute('data-glide-row'))).toBe(true)
    expect(rows.every(row => !row.hasAttribute('aria-current'))).toBe(true)
    expect(rows[0]!.closest('[data-glide-menu]')).not.toBeNull()
    const part = (name: string) =>
      rows.map(row => row.querySelector(`.list-reading-row-${name}`)?.textContent)
    expect(part('title')).toEqual(['甲', 'ses_unkn'])
    expect(part('facts')).toEqual(['关于受理的设计', '关于受理的设计'])
    expect(part('time')).toEqual(['我 · 3 分钟前', '工具结果'])
    const snippet = rows[0]!.querySelector('.list-reading-row-facts .omne-search-snippet')
    expect(snippet?.querySelector('mark')?.textContent).toBe('受理')
    expect(
      rows[0]!.querySelector('.list-reading-row-mark svg[data-icon="conversation"]'),
    ).not.toBeNull()
    fireEvent.click(rows[1]!)
    expect(onOpen).toHaveBeenCalledWith(tool)
  })

  it('says it is searching, and when nothing matches says so in the list’s words, with 清除搜索', async () => {
    const fake = createFakeClient()
    const store = new HistorySearchStore(fake.client)
    render(
      <HistorySearchPage store={store} tenant={TENANT} nameOf={() => null} onOpen={() => {}} />,
    )
    fireEvent.change(box(), { target: { value: ' 没有的词 ' } })
    fireEvent.submit(box().form!)
    const asked = await fake.next('search-history')
    await settle()
    expect(screen.getByRole('status').textContent).toBe('正在搜……')
    asked.answer(found([]))
    await settle()
    expect(screen.queryByText('正在搜……')).toBeNull()
    const empty = document.querySelector('.omne-search-column .empty-state') as HTMLElement
    expect(empty.querySelector('.empty-state-title')?.textContent).toBe(
      '没有匹配「没有的词」的记录。',
    )
    expect(empty.querySelector('.empty-state-mark svg[data-icon="search"]')).not.toBeNull()
    expect(empty.querySelector('.empty-state-hint')).toBeNull()
    expect(screen.queryByText('没有找到。')).toBeNull()
    fireEvent.click(iconButton(empty, '清除搜索', 'close'))
    await settle()
    expect(box().value).toBe('')
    expect(document.querySelector('.empty-state')).toBeNull()
    expect(store.read(TENANT)).toEqual({ kind: 'idle' })
  })

  it('goes back to not searched when the field is cleared, and an answer still on its way is not shown', async () => {
    const fake = createFakeClient()
    const store = new HistorySearchStore(fake.client)
    render(
      <HistorySearchPage store={store} tenant={TENANT} nameOf={() => null} onOpen={() => {}} />,
    )
    fireEvent.change(box(), { target: { value: '受理' } })
    fireEvent.submit(box().form!)
    const first = await fake.next('search-history')
    first.answer(found([hit('9')]))
    await settle()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    const search = box().closest('.list-reading-search') as HTMLElement
    fireEvent.click(iconButton(search, '清除搜索', 'close'))
    await settle()
    expect(box().value).toBe('')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    fireEvent.change(box(), { target: { value: '预算' } })
    fireEvent.submit(box().form!)
    const second = await fake.next('search-history')
    fireEvent.change(box(), { target: { value: '' } })
    await settle()
    second.answer(found([hit('7')]))
    await settle()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(store.read(TENANT)).toEqual({ kind: 'idle' })
  })

  it('never says nothing matches of a search that is not through: why first, the index in 详情, then 接着搜', async () => {
    const incomplete = { reason: 'rebuilding', behind: 2, progress: { indexed: 1, total: 3 } }
    const { ask, search } = shown([
      found([], { next: 'c-2', complete: false, incomplete }),
      found([hit('3')]),
    ])
    await ask('受理')
    expect(document.querySelector('.empty-state')).toBeNull()
    const end = document.querySelector('.omne-search-end') as HTMLElement
    expect(end.querySelector('.omne-search-note')?.textContent).toBe(
      '还没搜完：索引正在建，还有 2 个会话没读完。',
    )
    const detail = within(end).getByRole('button', { name: '详情' })
    expect(detail.getAttribute('aria-expanded')).toBe('false')
    expect(end.textContent).toContain('索引建到 1/3')
    const goOn = iconButton(end, '接着搜', 'retry')
    expect(goOn.previousElementSibling?.previousElementSibling?.className).toBe('omne-search-note')
    fireEvent.click(goOn)
    await settle()
    expect(search.mock.calls[1]![0]).toMatchObject({ cursor: 'c-2' })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(document.querySelector('.omne-search-end')).toBeNull()
  })

  it('asks by pattern, for the person only and with case when the switches say so; reads on when through', async () => {
    const view = stubInView()
    const { ask, search } = shown([
      found([]),
      found([hit('1')], { next: 'c', complete: true }),
      found([hit('2')]),
    ])
    fireEvent.click(screen.getByRole('button', { name: '正则' }))
    expect(box().getAttribute('placeholder')).toBe('一条正则')
    fireEvent.click(screen.getByRole('checkbox', { name: '只看我说的' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '区分大小写' }))
    await ask('a+b')
    expect(search.mock.calls[0]![0]).toMatchObject({
      content: { kind: 'regex', pattern: 'a+b', caseSensitive: true },
      kinds: ['message.user'],
    })
    await ask('a+b')
    expect(screen.queryByRole('button', { name: '更多' })).toBeNull()
    expect(screen.queryByRole('button', { name: '接着搜' })).toBeNull()
    act(() => view.enter())
    act(() => view.enter())
    await settle()
    expect(search).toHaveBeenCalledTimes(3)
    expect(search.mock.calls[2]![0]).toMatchObject({
      cursor: 'c',
      content: { kind: 'regex', pattern: 'a+b', caseSensitive: true },
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(view.watched()).toEqual([])
    act(() => view.enter())
    await settle()
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('reading on that is refused says so under the field, keeps what was found, and reads no more', async () => {
    const view = stubInView()
    const { ask, search } = shown([found([hit('1')], { next: 'c' }), { outcome: 'denied' }])
    await ask('受理')
    act(() => view.enter())
    await settle()
    expect(search).toHaveBeenCalledTimes(2)
    expect(screen.getByText(refusalText({ outcome: 'denied' } as never))).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /更多|接着搜|重试/u })).toBeNull()
    expect(view.watched()).toEqual([])
    act(() => view.enter())
    await settle()
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('keeps every change of the form when two of them come in one task', async () => {
    const { search, box } = shown([found([])])
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    // No render between the three: each handler must build on the state as it is, not as it was drawn.
    await act(async () => {
      screen.getByRole('button', { name: '正则' }).click()
      screen.getByRole('checkbox', { name: '只看我说的' }).click()
      setValue.call(box(), 'a+b')
      box().dispatchEvent(new Event('input', { bubbles: true }))
    })
    fireEvent.submit(box().form!)
    await settle()
    expect(search.mock.calls[0]![0]).toMatchObject({
      content: { kind: 'regex', pattern: 'a+b' },
      kinds: ['message.user'],
    })
  })

  it('writes a refusal under the line of switches, in words and in a neutral voice', async () => {
    const { ask } = shown([
      { outcome: 'invalid', body: { field: 'query', reason: 'pattern-invalid' } },
    ])
    await ask('(')
    const notice = screen.getByText('这条正则写得不对。').closest('[data-inline-notice]')
    expect(notice?.getAttribute('data-tone')).toBe('neutral')
    expect(notice?.closest('form')).toBe(box().form)
    expect(document.querySelector('.omne-search-ways')?.nextElementSibling).toBe(notice)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the row a hit is shown at', () => {
  it('is the row of the entry, or the nearest row before it', () => {
    const rows = ['2', '5', '9', 'live', '12']
    expect(rowFor(rows, '5')).toBe('5')
    expect(rowFor(rows, '7')).toBe('5')
    expect(rowFor(rows, '100')).toBe('12')
    expect(rowFor(rows, '1')).toBeNull()
    expect(rowFor(rows, 'x')).toBeNull()
    expect(rowFor([], '3')).toBeNull()
  })

  it('opening a hit opens its session, turns to the conversation and marks the message', async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.getAttribute('data-entry') ?? '')
    }
    const fake = createFakeClient()
    const { shell } = await mountModule(fake.client, TENANT)
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    fireEvent.change(box(), { target: { value: '结果' } })
    fireEvent.submit(box().form!)
    // The hit is a tool result: it is drawn inside the reply before it, so that reply is shown.
    ;(await fake.next('search-history')).answer(
      found([
        hit('3', { kind: 'message.tool', snippet: { before: '', match: '结果', after: '' } }),
      ]),
    )
    await settle()
    fireEvent.click(screen.getByRole('button', { name: /工具结果/u }))
    expect(shell.navigated).toEqual(['conversation'])
    ;(await fake.next('read-history')).answer({
      outcome: 'succeeded',
      body: page(
        [
          userEntry('1', '1', '问'),
          assistantEntry('2', '2', '我来查'),
          toolResultEntry('3', '3', 'call-x', '结果'),
          assistantEntry('4', '4', '查到了'),
        ],
        '4',
      ),
    })
    await settle()
    const marked = [...document.querySelectorAll('[data-found="true"]')]
    expect(marked.map(node => node.getAttribute('data-entry'))).toEqual(['3'])
    expect(scrolled).toEqual(['3'])
    expect(marked[0]!.textContent).toContain('结果')
  })

  it('keeps one ask at a time and gives it up once it is taken', () => {
    const focus = new EntryFocus()
    const seen: unknown[] = []
    const stop = focus.subscribe(() => seen.push(focus.read()))
    focus.set({ session: 'a', entry: '1' })
    focus.set(null)
    stop()
    focus.set({ session: 'b', entry: '2' })
    expect(seen).toEqual([{ session: 'a', entry: '1' }, null])
    expect(focus.read()).toEqual({ session: 'b', entry: '2' })
  })
})
