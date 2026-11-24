// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setup } from './support/shell-setup.tsx'

beforeAll(() => {
  Object.assign(Element.prototype, {
    scrollIntoView: () => undefined,
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

const ran: string[] = []
const acting = defineUiModule({
  name: 'acting',
  needs: {},
  apply(shell) {
    shell.contribute('pages', {
      id: 'first',
      title: '对话',
      order: 0,
      icon: 'conversation',
      render: () => <button type="button">正文里的键</button>,
    })
    shell.contribute('actions', {
      id: 'demo.stop',
      title: '停止这一轮',
      group: '这一轮',
      kind: 'control',
      order: 0,
      keys: [{ chord: 'Mod+.', layer: 'global' }],
      available: () => true,
      run: () => void ran.push('demo.stop'),
    })
    shell.contribute('actions', {
      id: 'demo.retry',
      title: '重试失败的那一轮',
      group: '这一轮',
      kind: 'control',
      order: 1,
      available: () => '没有可以重试的一轮',
      run: () => void ran.push('demo.retry'),
    })
    shell.contribute('actions', {
      id: 'slash-command.model',
      title: '换模型',
      group: '系统命令',
      kind: 'command',
      order: 2,
      slash: '/model',
      available: () => true,
      run: () => void ran.push('slash-command.model'),
    })
  },
})

const press = (key: string, code: string, held: KeyboardEventInit = {}) =>
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...held }),
    )
  })
const mod = /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
const palette = () => screen.queryByRole('listbox', { name: '命令面板' })

describe('the command palette (C15)', () => {
  it('opens on Mod+K, shuts on it again, and gives the focus back to where it was', async () => {
    await setup({ login: 'signed-in', modules: [acting] })
    const origin = screen.getByRole('button', { name: '正文里的键' })
    act(() => origin.focus())
    press('k', 'KeyK', mod)
    expect(palette()).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '找一条命令' }))
    press('k', 'KeyK', mod)
    expect(palette()).toBeNull()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(origin)
  })

  it('lists each action with its key or slash form; one that cannot run is grey with its reason and does not run', async () => {
    ran.length = 0
    await setup({ login: 'signed-in', modules: [acting] })
    press('k', 'KeyK', mod)
    const rows = screen.getAllByRole('option')
    const row = (title: string) => rows.find(each => each.textContent?.startsWith(title))!
    expect(row('停止这一轮').querySelector('kbd')?.textContent).toMatch(/⌘\.|Ctrl\+\./u)
    expect(row('换模型').querySelector('kbd')?.textContent).toBe('/model')
    expect(row('重试失败的那一轮').getAttribute('aria-disabled')).toBe('true')
    expect(row('重试失败的那一轮').textContent).toContain('没有可以重试的一轮')
    act(() => void fireEvent.mouseDown(row('重试失败的那一轮')))
    expect(ran).toEqual([])
    act(() => void fireEvent.mouseDown(row('停止这一轮')))
    expect(ran).toEqual(['demo.stop'])
    expect(palette()).toBeNull()
  })

  it('the key and the palette run the same action', async () => {
    ran.length = 0
    await setup({ login: 'signed-in', modules: [acting] })
    act(() => screen.getByRole('button', { name: '正文里的键' }).focus())
    press('.', 'Period', mod)
    press('k', 'KeyK', mod)
    fireEvent.change(screen.getByRole('combobox', { name: '找一条命令' }), {
      target: { value: '停止' },
    })
    press('Enter', 'Enter')
    expect(ran).toEqual(['demo.stop', 'demo.stop'])
  })
})

describe('the keys of this moment (C15)', () => {
  it('? on the page lists the keys by layer, with the keys that are not commands', async () => {
    await setup({ login: 'signed-in', modules: [acting] })
    act(() => screen.getByRole('button', { name: '正文里的键' }).focus())
    press('?', 'Slash', { shiftKey: true })
    const list = screen.getByRole('listbox', { name: '此刻能按的键' })
    const groups = [...list.querySelectorAll('[role="group"]')].map(g =>
      g.getAttribute('aria-label'),
    )
    expect(groups).toContain('任何地方')
    expect(groups).toContain('不是命令的键')
    expect(list.textContent).toContain('停止这一轮')
    expect(list.textContent).not.toContain('重试失败的那一轮')
    expect(list.textContent).toContain('输入框里换行')
  })
})
