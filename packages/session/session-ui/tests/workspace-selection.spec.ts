import { describe, expect, it, vi } from 'vitest'
import {
  reasonText,
  selectText,
  WorkspaceSelectionStore,
} from '../src/model/workspace-selection.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 'ses_a'
const SHOP = { workspace: 'wsp_shop', instance: 'wsi_shop' }
const read = (directory: string | null, workspace: typeof SHOP | null = SHOP) => ({
  outcome: 'succeeded' as const,
  body: { workspace, state: 'attached' as const, directory, reason: null, revision: '3' },
})

function storeWith(reads: readonly unknown[], change: unknown = read('/srv/shop')) {
  const readSelection = vi.fn(async () => reads[readSelection.mock.calls.length - 1])
  const select = vi.fn(async () => change)
  let id = 0
  const client = { 'read-workspace-selection': readSelection, 'select-workspace': select }
  const store = new WorkspaceSelectionStore(client as never, () => `id-${String((id += 1))}`)
  return { store, readSelection, select }
}

describe('the workspace of a session, as Session answered it last', () => {
  it('says each answer of a change, and an unknown one as not known', () => {
    const moved = { outcome: 'succeeded', body: { controlId: 'c', directory: '/srv/shop' } }
    expect(selectText(moved as never)).toBe('已换到 /srv/shop')
    expect(selectText({ outcome: 'succeeded', body: { controlId: 'c', directory: null } })).toBe(
      '已不选工作区，回到默认的工作目录',
    )
    expect(selectText({ outcome: 'invalid', body: { reason: 'instance-unavailable' } })).toBe(
      '没有换：这个实例现在用不了',
    )
    expect(selectText({ outcome: 'archived', body: {} })).toBe('没有换：会话已归档')
    expect(selectText({ outcome: 'frozen', body: {} })).toBe('没有换：会话已冻结')
    expect(selectText({ outcome: 'unknown' })).toBe('不知道换没换成，已重新读取')
    expect(selectText({ outcome: 'unavailable' })).toBe('连不上服务，没有换')
    expect(selectText({ outcome: 'not-found', body: {} })).toBe('没有换成：not-found')
    expect(reasonText('something-new')).toBe('something-new')
  })

  it('asks the change under an identity of its own, then reads the selection again', async () => {
    const { store, readSelection, select } = storeWith([read('/srv/blog'), read('/srv/shop')])
    await store.load(TENANT, SESSION)
    expect(store.read(TENANT, SESSION)).toMatchObject({ kind: 'read', directory: '/srv/blog' })
    expect(await store.select(TENANT, SESSION, SHOP)).toBe('已换到 /srv/shop')
    expect(select.mock.calls[0]).toEqual([
      { tenant: expect.anything(), session: SESSION, controlId: 'id-1', workspace: SHOP },
    ])
    expect(readSelection).toHaveBeenCalledTimes(2)
    expect(store.read(TENANT, SESSION)).toMatchObject({ kind: 'read', directory: '/srv/shop' })
  })

  it('a tenant it cannot read is said, and nothing is sent for it', async () => {
    const { store, readSelection, select } = storeWith([])
    await store.load('not a tenant', SESSION)
    expect(store.read('not a tenant', SESSION)).toEqual({ kind: 'unreadable', reason: 'invalid' })
    expect(await store.select('not a tenant', SESSION, null)).toBe('没有送达：租户读不懂')
    expect([readSelection.mock.calls.length, select.mock.calls.length]).toEqual([0, 0])
  })

  it('a read that does not arrive is shown as unreadable, and listeners hear each answer', async () => {
    const { store } = storeWith([{ outcome: 'denied' }])
    const heard = vi.fn()
    store.subscribe(TENANT, SESSION, heard)
    await store.load(TENANT, SESSION)
    expect(store.read(TENANT, SESSION)).toEqual({ kind: 'unreadable', reason: 'denied' })
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
