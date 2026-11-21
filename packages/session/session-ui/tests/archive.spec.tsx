// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@omne-harness/ui-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ArchiveStore,
  archiveText,
  archivedByText,
  unarchiveText,
  type ArchivedItem,
} from '../src/model/archive.ts'
import type { SessionWorkspaces } from '../src/model/session-workspaces.ts'
import { ArchiveAction, ArchivedSessions } from '../src/view/archive.tsx'

afterEach(cleanup)

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

const item = (session: string, extra: Partial<ArchivedItem> = {}): ArchivedItem =>
  ({
    session,
    createdAt: null,
    lastActivityAt: null,
    lifecycle: 'archived',
    title: `title ${session}`,
    archivedAt: null,
    archivedBy: 'person',
    ...extra,
  }) as ArchivedItem

const page = (sessions: readonly ArchivedItem[], next: string | null = null) => ({
  outcome: 'succeeded' as const,
  body: { sessions, next, completeness: 'complete' as const },
})

function clientWith(pages: readonly unknown[]) {
  const listed = vi.fn(
    async (_body: { cursor: string | null; titleContains: string | null }) =>
      pages[listed.mock.calls.length - 1] ?? page([]),
  )
  const archive = vi.fn(async () => ({
    outcome: 'succeeded',
    body: { kind: 'archived', controlId: 'c', runs: 1, backgroundCalls: 2 },
  }))
  const unarchive = vi.fn(async () => ({
    outcome: 'succeeded',
    body: { kind: 'unarchived', controlId: 'c' },
  }))
  const client = {
    'list-archived-sessions': listed,
    'archive-session': archive,
    'unarchive-session': unarchive,
  }
  return { store: new ArchiveStore(client as never), listed, archive, unarchive }
}

function workspacesWith() {
  const loadList = vi.fn()
  const workspaces = {
    acquire: () => ({ driver: { loadList }, release: () => {} }),
  } as unknown as SessionWorkspaces
  return { workspaces, loadList }
}

describe('the words of an archive (C28)', () => {
  it('says what was withdrawn as withdrawn, and an archived session as already archived', () => {
    const archived = (runs: number, backgroundCalls: number) =>
      archiveText({
        outcome: 'succeeded',
        body: { kind: 'archived', controlId: 'c', runs, backgroundCalls },
      })
    expect([archived(1, 2), archived(0, 1), archived(0, 0)]).toEqual([
      '已归档；收起 1 轮，撤回 2 项后台调用',
      '已归档；撤回 1 项后台调用',
      '已归档',
    ])
    expect(
      archiveText({ outcome: 'succeeded', body: { kind: 'already-archived', controlId: 'c' } }),
    ).toBe('它已经归档了')
    expect(archiveText({ outcome: 'denied' } as never)).toBe('归档没有完成：denied')
    expect(
      unarchiveText({ outcome: 'succeeded', body: { kind: 'not-archived', controlId: 'c' } }),
    ).toBe('它没有归档')
  })

  it('names how each session was archived, and an unknown way as unknown', () => {
    expect(
      (['person', 'auto', 'parent', null] as const).map(by =>
        archivedByText(item('s', { archivedBy: by })),
      ),
    ).toEqual(['有人归档', '闲置后自动归档', '随上级会话归档', '归档方式不明'])
  })
})

describe('the archived list (C29)', () => {
  it('reads the first page with the title text, then appends the next page', async () => {
    const { store, listed } = clientWith([page([item('a')], 'n-1'), page([item('b')])])
    store.subscribe(TENANT, () => {})
    await store.load(TENANT, ' build ')
    await store.load(TENANT, ' build ', true)
    expect(listed.mock.calls.map(([body]) => [body.cursor, body.titleContains])).toEqual([
      [null, 'build'],
      ['n-1', 'build'],
    ])
    const view = store.read(TENANT)
    expect(view.kind === 'listed' && view.page.sessions.map(entry => entry.session)).toEqual([
      'a',
      'b',
    ])
  })

  it('reads the list again after an unarchive, and both lists are read again in the view', async () => {
    const { store, listed, unarchive } = clientWith([page([item('a')]), page([])])
    const { workspaces, loadList } = workspacesWith()
    render(<ArchivedSessions store={store} workspaces={workspaces} tenant={TENANT} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '已归档' })))
    expect(screen.getByText('title a')).toBeTruthy()
    expect(screen.getByText('有人归档')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '撤销归档' })))
    expect(unarchive).toHaveBeenCalledWith(expect.objectContaining({ session: 'a' }))
    expect(listed).toHaveBeenCalledTimes(2)
    expect(loadList).toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('已撤销归档')
    expect(screen.getByText('没有已归档的会话。')).toBeTruthy()
  })

  it('the archive action in the heading says what it withdrew and reads the session list again', async () => {
    const { store, archive } = clientWith([])
    const { workspaces, loadList } = workspacesWith()
    const say = vi.fn()
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>更多</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ArchiveAction
            store={store}
            workspaces={workspaces}
            tenant={TENANT}
            session="s-1"
            say={say}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: '归档' })))
    expect(archive).toHaveBeenCalledWith(expect.objectContaining({ session: 's-1' }))
    expect(say).toHaveBeenCalledWith('已归档；收起 1 轮，撤回 2 项后台调用')
    expect(loadList).toHaveBeenCalled()
  })
})
