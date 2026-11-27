// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginPage } from '../src/view/plugin-page.tsx'
import type {
  PluginDetail,
  PluginEffect,
  PluginEntry,
  PluginSnapshot,
  PluginView,
} from '../src/view/plugin-port.ts'

const EFFECT: PluginEffect = {
  places: [
    {
      point: 'tool.tools',
      key: 'wordcount',
      side: 'server',
      category: 'tool',
      categoryTitle: '工具',
      standing: 'in effect',
      says: '',
    },
  ],
  advice: null,
  disable: [{ mark: '-', of: null, point: 'tool.tools', key: 'wordcount', says: '' }],
  remove: [{ mark: '-', of: null, point: 'tool.tools', key: 'wordcount', says: '' }],
}

const entryWith = (detail: PluginDetail | null): PluginEntry => ({
  row: { name: 'tool-kit', enabled: true, summary: null },
  settings: [],
  detail,
  action: { kind: 'none' },
})

/** A view of the plugins holding one plugin whose detail the test moves along. */
function viewOf(detail: PluginDetail | null) {
  const listeners = new Set<() => void>()
  let snapshot: PluginSnapshot
  const hold = (next: PluginDetail | null): void => {
    snapshot = {
      kind: 'read',
      assets: { kind: 'read', entries: [entryWith(next)], partial: false },
    }
  }
  hold(detail)
  const setEnabled = vi.fn()
  const view: PluginView = {
    subscribe: listener => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    read: () => undefined,
    openAsset: () => undefined,
    closeAsset: () => undefined,
    setEnabled,
    remove: () => undefined,
    close: () => undefined,
    Row: () => null,
  }
  const move = (next: PluginDetail): void => {
    hold(next)
    act(() => {
      for (const listener of listeners) listener()
    })
  }
  return { governance: { open: () => view }, setEnabled, move }
}

const shown = (detail: PluginDetail | null) => {
  const fake = viewOf(detail)
  render(
    <PluginPage governance={fake.governance} tenant="t" pointAt="tool-kit" go={() => undefined} />,
  )
  return fake
}

afterEach(cleanup)

describe('the page of one plugin', () => {
  it('while what it brought is first read, says so, and disabling waits until what goes with it is listed', () => {
    const { move, setEnabled } = shown({ kind: 'reading' })
    expect(screen.getByRole('status', { name: '正在读取它带来的东西……' })).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: '启用「tool-kit」' }))
    const panel = screen.getByRole('dialog')
    expect(panel.textContent).toContain('正在读取会收回什么……')
    expect(panel.textContent).not.toContain('这一次说不出会收回什么')
    const confirm = screen.getByRole('button', { name: '禁用整份' })
    expect(confirm.hasAttribute('disabled')).toBe(true)

    move({ kind: 'read', asset: { effect: EFFECT } })
    expect(screen.getByRole('dialog').textContent).toContain('wordcount')
    const ready = screen.getByRole('button', { name: '禁用整份' })
    expect(ready.hasAttribute('disabled')).toBe(false)
    fireEvent.click(ready)
    expect(setEnabled.mock.calls).toEqual([['tool-kit', false]])
  })

  it('read without what it brought, says it cannot tell this time and does not keep reading', () => {
    shown({ kind: 'read', asset: {} })
    expect(screen.queryByRole('status', { name: '正在读取它带来的东西……' })).toBeNull()
    expect(screen.getByText('这一次说不出它带来了什么。')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: '启用「tool-kit」' }))
    expect(screen.getByRole('dialog').textContent).toContain('这一次说不出会收回什么。')
    expect(screen.getByRole('button', { name: '禁用整份' }).hasAttribute('disabled')).toBe(false)
  })
})
