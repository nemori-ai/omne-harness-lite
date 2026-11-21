// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrange, type ListedSession, type SessionList } from '../src/model/session-list.ts'
import { SessionListView } from '../src/view/session-list-panel.tsx'

afterEach(cleanup)

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
