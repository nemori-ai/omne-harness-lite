// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import {
  protocolsContract,
  type ProtocolKey,
  type ProtocolStanding,
} from '@omne-harness/client-assembly'
import { declare, type Entry } from '@omne-harness/dynamis'
import { needProtocol } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { lackOf, lackText } from '../src/page/shell/lacks.ts'
import { chatPage, section, navTitles, settle, setup, CHAT } from './support/shell-setup.tsx'
import { fakeGate } from './support/fake-modules.tsx'

afterEach(cleanup)

const NOTES: ProtocolKey = { name: 'notes', major: 1 }
const TAGS: ProtocolKey = { name: 'tags', major: 1 }

/** A page that counts how often it was mounted, by a module that needs `notes/v1` and may use `tags/v1`. */
function notesModule(mounts: { count: number }) {
  function NotesPage() {
    useEffect(() => {
      mounts.count += 1
    }, [])
    return <p data-notes="">笔记的内容</p>
  }
  return defineUiModule({
    name: 'notes-ui',
    needs: { notes: needProtocol(NOTES), tags: needProtocol(TAGS, { optional: true }) },
    apply(shell) {
      shell.contribute('pages', {
        id: 'notes',
        title: '笔记',
        order: 10,
        icon: 'conversation',
        render: () => <NotesPage />,
      })
    },
  })
}

/** The item of a protocol the server serves and this client holds a client of. */
const served = (key: ProtocolKey, revision: number | undefined): Entry => ({
  point: protocolsContract.name,
  key: `${key.name}/v${key.major}`,
  id: '',
  scope: [],
  rank: 0,
  digest: `${key.name}/v${key.major}@${revision}`,
  item: { protocol: key.name, major: key.major, client: {} },
})

/** A connection that says where each protocol stands, and the point the served ones are put on. */
async function world(initial: ProtocolStanding) {
  const standings = new Map<string, ProtocolStanding>([['notes/v1', initial]])
  const listeners = new Set<() => void>()
  const connection = {
    availability: {
      keys: () => undefined,
      standing: (key: ProtocolKey) =>
        standings.get(`${key.name}/v${key.major}`) ?? { kind: 'absent' },
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    },
  }
  const mounts = { count: 0 }
  const shell = await setup({
    login: 'signed-in',
    connection,
    modules: [fakeGate(), chatPage, notesModule(mounts)],
  })
  await shell.provide(CHAT)
  await act(async () => {
    await shell.root.plugin({
      name: 'connection-protocols',
      inject: ['dynamis'],
      apply: (ctx: Context) => void ctx.dynamis.put([declare(protocolsContract)]),
    })
    await settle()
  })
  /** The server serves the protocol and this client holds its client: the item is on the point. */
  const serve = async (key: ProtocolKey, revision?: number) => {
    const fiber = shell.root.plugin({
      name: `client:${key.name}@${revision}`,
      inject: ['dynamis'],
      apply: (ctx: Context) => void ctx.dynamis.put([served(key, revision)]),
    })
    await act(async () => {
      standings.set(`${key.name}/v${key.major}`, { kind: 'open' })
      await fiber
      for (const listener of listeners) listener()
      await settle()
    })
    return async (after: ProtocolStanding) => {
      await act(async () => {
        standings.set(`${key.name}/v${key.major}`, after)
        await fiber.dispose()
        for (const listener of listeners) listener()
        await settle()
      })
    }
  }
  const tell = async (key: ProtocolKey, standing: ProtocolStanding) => {
    await act(async () => {
      standings.set(`${key.name}/v${key.major}`, standing)
      for (const listener of listeners) listener()
      await settle()
    })
  }
  const notes = () => section('notes')
  const said = () =>
    [...(notes()?.querySelectorAll('.shell-page-lack') ?? [])].map(e => e.textContent)
  return { shell, mounts, serve, tell, notes, said }
}

describe('a page whose module lacks a protocol it needs', () => {
  it('is drawn as usual while the protocol is pinned, with or without the optional one', async () => {
    const w = await world({ kind: 'absent' })
    await w.serve(NOTES)
    expect(w.notes()?.querySelector('[data-notes]')).not.toBeNull()
    expect(w.said()).toEqual([])
    expect(w.mounts.count).toBe(1)
    const withdrawTags = await w.serve(TAGS)
    await withdrawTags({ kind: 'absent' })
    expect(w.notes()?.querySelector('[data-notes]')).not.toBeNull()
    expect(w.mounts.count).toBe(1)
  })

  it('stays in the navigation and says which protocol the server does not serve; the other pages do not change', async () => {
    const w = await world({ kind: 'absent' })
    const withdraw = await w.serve(NOTES)
    const chat = section('chat')?.innerHTML
    await withdraw({ kind: 'absent' })
    expect(navTitles()).toEqual(['笔记'])
    expect(w.notes()?.querySelector('[data-notes]')).toBeNull()
    expect(w.said()).toEqual(['这一页现在用不了：服务端没有提供它要用的 notes/v1。'])
    expect(section('chat')?.innerHTML).toBe(chat)
  })

  it('says the major the server serves, and which side is the old one', async () => {
    const w = await world({ kind: 'other-major', served: [2] })
    expect(w.said()).toEqual([
      '这一页现在用不了：它要用的是 notes/v1，服务端提供的是 v2。这个应用的版本旧了，需要更新。',
    ])
    await w.tell(NOTES, { kind: 'other-major', served: [0] })
    expect(w.said()).toEqual([
      '这一页现在用不了：它要用的是 notes/v1，服务端提供的是 v0。服务端的版本旧了。',
    ])
  })

  it('says that the server has two of it', async () => {
    const w = await world({ kind: 'conflict' })
    expect(w.said()).toEqual(['这一页现在用不了：它要用的 notes/v1 在服务端有两份，都没有生效。'])
  })

  it('two holders of one client are one item: the page is drawn', async () => {
    const w = await world({ kind: 'absent' })
    await w.serve(NOTES)
    await w.serve(NOTES)
    expect(w.notes()?.querySelector('[data-notes]')).not.toBeNull()
    expect(w.said()).toEqual([])
  })

  it('says that this application holds two different clients of it', async () => {
    const w = await world({ kind: 'absent' })
    await w.serve(NOTES, 1)
    await w.serve(NOTES, 2)
    expect(w.notes()?.querySelector('[data-notes]')).toBeNull()
    expect(w.said()).toEqual([
      '这一页现在用不了：它要用的 notes/v1 在这个应用里装了两份，都没有生效。',
    ])
  })

  it('says that this application holds no client of a protocol the server serves', async () => {
    const w = await world({ kind: 'open' })
    expect(w.said()).toEqual(['这一页现在用不了：这个应用没有装 notes/v1 的客户端。'])
  })

  it('waits without a notice while the connection has not told what is served', async () => {
    const w = await world({ kind: 'connecting' })
    expect(w.said()).toEqual([])
    expect(w.notes()?.querySelector('[data-notes]')).toBeNull()
    expect(w.notes()?.querySelector('.shell-connecting')?.textContent).toContain('正在连接服务')
  })

  it('mounts the page anew when the protocol is back', async () => {
    const w = await world({ kind: 'absent' })
    const withdraw = await w.serve(NOTES)
    expect(w.mounts.count).toBe(1)
    await withdraw({ kind: 'absent' })
    expect(w.said()).toHaveLength(1)
    await w.serve(NOTES)
    expect(w.said()).toEqual([])
    expect(w.notes()?.querySelector('[data-notes]')).not.toBeNull()
    expect(w.mounts.count).toBe(2)
  })
})

describe('lackText', () => {
  it('names a point nobody gives', () => {
    expect(lackText({ kind: 'point', point: 'notes.shelf' })).toBe(
      '这一页现在用不了：它要用的 notes.shelf 没有人提供。',
    )
  })

  it('does not blame a side when the server serves majors on both sides of the wanted one', () => {
    expect(
      lackText({
        kind: 'protocol',
        wanted: 'notes/v2',
        why: 'other-major',
        served: [1, 3],
        majors: [2],
      }),
    ).toBe('这一页现在用不了：它要用的是 notes/v2，服务端提供的是 v1、v3。')
  })
})

describe('lackOf', () => {
  const reference = { point: 'connection.protocols', anyOf: ['notes/v2', 'notes/v1'] }
  const none = { slot: 'notes', reference, answer: 'none', detail: '' } as const

  it('a protocols point that cannot be read is a point nobody gives, whatever the connection says', () => {
    expect(lackOf({ ...none, answer: 'unavailable' }, () => ({ kind: 'absent' }))).toEqual({
      kind: 'point',
      point: 'connection.protocols',
    })
  })

  it('names the major the module prefers, and every major it can speak', () => {
    expect(lackOf(none, () => ({ kind: 'absent' }))).toEqual({
      kind: 'protocol',
      wanted: 'notes/v2',
      why: 'absent',
    })
    expect(lackOf(none, () => ({ kind: 'other-major', served: [3] }))).toEqual({
      kind: 'protocol',
      wanted: 'notes/v2',
      why: 'other-major',
      served: [3],
      majors: [2, 1],
    })
  })

  it('waits while any of the majors is not told yet; a conflict of one of them is said before an absence', () => {
    const one = (kind: 'connecting' | 'conflict') => (key: { major: number }) =>
      key.major === 1 ? { kind } : ({ kind: 'absent' } as const)
    expect(lackOf(none, one('connecting'))).toEqual({ kind: 'connecting' })
    expect(lackOf(none, one('conflict'))).toMatchObject({ why: 'conflict', wanted: 'notes/v2' })
  })

  it('a need for another point is a point lack', () => {
    const shelf = { point: 'notes.shelf', anyOf: [''] }
    expect(lackOf({ ...none, reference: shelf }, () => ({ kind: 'open' }))).toEqual({
      kind: 'point',
      point: 'notes.shelf',
    })
  })
})
