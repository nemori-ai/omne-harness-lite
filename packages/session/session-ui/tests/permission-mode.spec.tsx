// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { changeText, PermissionModeStore } from '../src/model/permission-mode.ts'
import { PermissionModeAction } from '../src/view/permission-mode.tsx'

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    setPointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})
afterEach(cleanup)

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 's-1'

type Mode = 'never' | 'auto_permission' | 'bypass-permissions'

function clientWith(reads: readonly unknown[], changed: unknown) {
  const read = vi.fn(
    async (_body: unknown) =>
      reads[Math.min(read.mock.calls.length - 1, reads.length - 1)] as never,
  )
  const change = vi.fn(async (_body: { mode: Mode; expectedRevision: string }) => changed as never)
  const client = { 'read-permission-mode': read, 'change-permission-mode': change }
  return { store: new PermissionModeStore(client as never), read, change }
}

const mode = (value: Mode, revision: string) => ({
  outcome: 'succeeded' as const,
  body: { mode: value, revision },
})

describe('the permission mode of a session', () => {
  it('says nothing of a change that took, the dropdown shows it; says why one did not, and an unknown one as not known', () => {
    expect(changeText(mode('auto_permission', '1'))).toBeNull()
    expect(changeText({ outcome: 'no-change', body: { mode: 'never', revision: '0' } })).toBeNull()
    expect(changeText({ outcome: 'conflict', body: {} })).toBe(
      '模式刚被改过，已重新读取，请再选一次',
    )
    expect(changeText({ outcome: 'unknown' })).toBe('不知道改没改成，已重新读取')
    expect(changeText({ outcome: 'denied' })).toBe('没有改成：denied')
  })

  it('asks the change at the revision it read, then reads the mode again', async () => {
    const { store, read, change } = clientWith(
      [mode('bypass-permissions', '4'), mode('auto_permission', '5')],
      mode('auto_permission', '5'),
    )
    store.subscribe(TENANT, SESSION, () => {})
    await store.load(TENANT, SESSION)
    expect(await store.change(TENANT, SESSION, 'auto_permission')).toBeNull()
    expect(change.mock.calls[0]?.[0]).toMatchObject({
      session: SESSION,
      mode: 'auto_permission',
      expectedRevision: '4',
    })
    expect(read).toHaveBeenCalledTimes(2)
    expect(store.read(TENANT, SESSION)).toEqual({
      kind: 'read',
      mode: 'auto_permission',
      revision: '5',
    })
  })

  it('does not ask a change before the mode is read', async () => {
    const { store, change } = clientWith([{ outcome: 'basis-unavailable' }], mode('never', '1'))
    store.subscribe(TENANT, SESSION, () => {})
    await store.load(TENANT, SESSION)
    expect(store.read(TENANT, SESSION)).toEqual({
      kind: 'unreadable',
      reason: 'basis-unavailable',
    })
    expect(await store.change(TENANT, SESSION, 'never')).toBe('当前模式还没读到，没有改')
    expect(change).not.toHaveBeenCalled()
  })

  it('is a quiet dropdown whose face is the mode in force; it offers the three and changes on a choice, with no receipt beside it', async () => {
    const { store, change } = clientWith(
      [mode('bypass-permissions', '0'), mode('never', '1')],
      mode('never', '1'),
    )
    await act(async () => {
      render(<PermissionModeAction store={store} tenant={TENANT} session={SESSION} />)
    })
    const trigger = screen.getByRole('combobox', { name: '权限处理' })
    expect(trigger.textContent).toBe('跳过询问')
    expect(screen.queryByRole('button', { name: '需要时拒绝' })).toBeNull()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    const options = await screen.findAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual([
      '需要时拒绝',
      '需要时问我',
      '跳过询问',
    ])
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: '需要时拒绝' }))
    })
    expect(change.mock.calls[0]?.[0]).toMatchObject({ mode: 'never', expectedRevision: '0' })
    expect(screen.queryByRole('status')).toBeNull()
    expect(document.body.textContent).not.toMatch(/已改为/u)
    expect(screen.getByRole('combobox', { name: '权限处理' }).textContent).toBe('需要时拒绝')
  })

  it('a change that did not take says why beside the dropdown, in words of its own', async () => {
    const { store } = clientWith(
      [mode('bypass-permissions', '0'), mode('bypass-permissions', '1')],
      { outcome: 'conflict', body: {} },
    )
    await act(async () => {
      render(<PermissionModeAction store={store} tenant={TENANT} session={SESSION} />)
    })
    fireEvent.keyDown(screen.getByRole('combobox', { name: '权限处理' }), { key: 'Enter' })
    await screen.findAllByRole('option')
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: '需要时拒绝' }))
    })
    expect(screen.getByRole('status').textContent).toBe('模式刚被改过，已重新读取，请再选一次')
    expect(screen.getByRole('combobox', { name: '权限处理' }).textContent).toBe('跳过询问')
  })
})
