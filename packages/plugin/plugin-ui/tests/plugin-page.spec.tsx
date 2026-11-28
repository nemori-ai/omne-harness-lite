// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PluginPage } from '../src/view/plugin-page.tsx'
import type {
  PluginDetail,
  PluginEffect,
  PluginEntry,
  PluginSnapshot,
  PluginView,
} from '../src/view/plugin-port.ts'
import { stubAnimation } from './support/dom-stubs.ts'

const EFFECT: PluginEffect = {
  places: [
    {
      point: 'tool.tools',
      key: 'wordcount',
      id: null,
      side: 'server',
      category: 'tool',
      categoryTitle: '工具',
      standing: 'in effect',
      says: '',
    },
  ],
  advice: null,
  disable: [{ mark: '-', of: null, point: 'tool.tools', key: 'wordcount', id: null, says: '' }],
  remove: [{ mark: '-', of: null, point: 'tool.tools', key: 'wordcount', id: null, says: '' }],
}

const entryWith = (detail: PluginDetail | null, enabled: boolean): PluginEntry => ({
  row: { name: 'tool-kit', enabled, summary: null },
  settings: [],
  detail,
  action: { kind: 'none' },
})

/** A view of the plugins holding one plugin whose detail the test moves along. */
function viewOf(detail: PluginDetail | null, enabled: boolean) {
  const listeners = new Set<() => void>()
  let snapshot: PluginSnapshot
  const hold = (next: PluginDetail | null): void => {
    snapshot = {
      kind: 'read',
      assets: { kind: 'read', entries: [entryWith(next, enabled)], partial: false },
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

const shown = (detail: PluginDetail | null, enabled = true) => {
  const fake = viewOf(detail, enabled)
  render(
    <PluginPage governance={fake.governance} tenant="t" pointAt="tool-kit" go={() => undefined} />,
  )
  return fake
}

beforeAll(stubAnimation)
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

  it('names what it put on a point that tells its items by id by that id, so two on one point are told apart', () => {
    const on = (point: string, id: string) => ({
      place: {
        point,
        key: '',
        id,
        side: 'client' as const,
        category: null,
        categoryTitle: null,
        standing: 'in effect',
        says: '',
      },
      line: { mark: '-' as const, of: null, point, key: '', id, says: '' },
    })
    const brought = [on('shell.pages', 'weather'), on('shell.pages', 'weather-map')]
    const effect: PluginEffect = {
      ...EFFECT,
      places: brought.map(each => each.place),
      disable: brought.map(each => each.line),
    }
    shown({ kind: 'read', asset: { effect } })
    const items = (within: HTMLElement) =>
      [...within.querySelectorAll('li')].map(item => item.textContent?.trim())
    expect(items(screen.getByRole('region', { name: 'tool-kit' }))).toEqual([
      'weather shell.pages',
      'weather-map shell.pages',
    ])
    fireEvent.click(screen.getByRole('switch', { name: '启用「tool-kit」' }))
    expect(items(screen.getByRole('dialog'))).toEqual([
      'weather shell.pages',
      'weather-map shell.pages',
    ])
  })

  it('disabled, lists what it brought without a status word on each; enabled, a member not in effect says why', () => {
    const off = (says: string): PluginEffect => ({
      ...EFFECT,
      places: EFFECT.places.map(place => ({ ...place, standing: 'not in effect', says })),
    })
    shown({ kind: 'read', asset: { effect: off('it is disabled') } }, false)
    expect(screen.getByText('wordcount')).toBeTruthy()
    expect(screen.queryByText('没有生效')).toBeNull()
    expect(screen.queryByText(/it is disabled/u)).toBeNull()
    cleanup()

    shown({ kind: 'read', asset: { effect: off('the server stopped loading it') } })
    expect(screen.getByText('没有生效')).toBeTruthy()
    expect(screen.getByText(/the server stopped loading it/u)).toBeTruthy()
    expect(screen.getByText('有一处没有生效，原因写在那一样下面。别的照常。')).toBeTruthy()
  })
})
