// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ActionItem } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KeyBindings, type PreferencePort } from '../src/model/bindings.ts'
import { KeysPage } from '../src/view/keys-page.tsx'

beforeAll(() => {
  Object.assign(Element.prototype, {
    scrollIntoView: () => undefined,
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

const action = (
  id: string,
  title: string,
  kind: ActionItem['kind'],
  chord?: string,
  rest: Partial<ActionItem> = {},
): ActionItem => ({
  id,
  title,
  group: 'g',
  kind,
  order: 0,
  ...(chord === undefined ? {} : { keys: [{ chord, layer: 'global' as const }] }),
  available: () => true,
  run: () => undefined,
  ...rest,
})

const ACTIONS: readonly ActionItem[] = [
  action('session.stop', '停止这一轮', 'control', 'Mod+.'),
  action('session.retry', '重试失败的那一轮', 'control', undefined, {
    available: () => '没有可以重试的一轮',
  }),
  action('shell.sidebar', '展开或收起侧栏', 'ui', 'Mod+B'),
  action('slash-command.system:model', '换模型', 'command', undefined, {
    group: '系统命令',
    slash: '/model',
  }),
  action('slash-command.skill:review', '评审', 'command', undefined, {
    group: 'Skill',
    slash: '/review',
  }),
]

function page() {
  const written: string[] = []
  let revision = 0
  const port: PreferencePort = {
    read: async () => ({ kind: 'read', value: null, revision: String(revision) }),
    write: async (_name, value) => {
      written.push(value)
      revision += 1
      return { kind: 'written', revision: String(revision) }
    },
  }
  const bindings = new KeyBindings(port, { read: () => null, write: () => undefined }, 'keys.mac')
  render(
    <KeysPage
      actions={{ items: () => ACTIONS, subscribe: () => () => undefined }}
      bindings={bindings}
      mac
    />,
  )
  return { written, bindings }
}

const row = (title: string) => screen.getByRole('row', { name: new RegExp(title, 'u') })
const press = async (key: string, code: string, held: KeyboardEventInit = {}) =>
  act(async () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...held }),
    )
    await Promise.resolve()
  })

describe('the page of commands and keys (C16)', () => {
  it('lists every command but the Skills by group: name, what it does, slash form, key and whether it can run now', () => {
    page()
    const groups = screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))
    expect(groups).toEqual(['系统命令', '控制', '界面动作'])
    expect(screen.queryByText('评审')).toBeNull()
    expect(row('停止这一轮').textContent).toContain('/stop')
    expect(row('停止这一轮').textContent).toContain('⌘.')
    expect(row('重试失败的那一轮').textContent).toContain('没有可以重试的一轮')
    expect(row('换模型').textContent).toContain('/model')
    expect(within(row('换模型')).queryByRole('button', { name: '改键' })).toBeNull()
  })

  it('a row takes the next key; the change is marked, saved to the account, and can be put back', async () => {
    const { written } = page()
    fireEvent.click(within(row('停止这一轮')).getByRole('button', { name: '改键' }))
    expect(screen.getByText('请按「停止这一轮」的新键')).toBeTruthy()
    await press('S', 'KeyS', { metaKey: true, shiftKey: true })
    expect(row('停止这一轮').textContent).toContain('⌘⇧S')
    expect(row('停止这一轮').textContent).toContain('改过')
    expect(written.at(-1)).toBe('{"session.stop":"Mod+Shift+S"}')
    fireEvent.click(within(row('停止这一轮')).getByRole('button', { name: '恢复缺省' }))
    await act(async () => void (await Promise.resolve()))
    expect(row('停止这一轮').textContent).toContain('⌘.')
    expect(written.at(-1)).toBe('{}')
  })

  it('refuses a key of the system and a key that types, saying why; Escape gives up', async () => {
    const { written } = page()
    fireEvent.click(within(row('停止这一轮')).getByRole('button', { name: '改键' }))
    await press('c', 'KeyC', { metaKey: true })
    expect(screen.getByText('Mod+C 是系统或编辑的键，不能绑')).toBeTruthy()
    fireEvent.click(within(row('停止这一轮')).getByRole('button', { name: '改键' }))
    await press('s', 'KeyS')
    expect(screen.getByText(/不带修饰键的字符键会挡住打字/u)).toBeTruthy()
    fireEvent.click(within(row('停止这一轮')).getByRole('button', { name: '改键' }))
    await press('Escape', 'Escape')
    expect(screen.queryByText('请按「停止这一轮」的新键')).toBeNull()
    expect(written).toEqual([])
  })

  it('a key another command holds says whom, and swapping gives that one the old key', async () => {
    const { written } = page()
    fireEvent.click(within(row('停止这一轮')).getByRole('button', { name: '改键' }))
    await press('b', 'KeyB', { metaKey: true })
    expect(screen.getByText('和 shell.sidebar 撞了')).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '换过来' })))
    expect(written.at(-1)).toBe('{"session.stop":"Mod+B","shell.sidebar":"Mod+."}')
    expect(row('展开或收起侧栏').textContent).toContain('⌘.')
    await act(
      async () => void fireEvent.click(screen.getByRole('button', { name: '全部恢复缺省' })),
    )
    expect(written.at(-1)).toBe('{}')
  })

  it('a key pressed to look it up names what holds it', async () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: '按一个键查它绑在哪' }))
    await press('b', 'KeyB', { metaKey: true })
    expect(screen.getByText('⌘B：展开或收起侧栏')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '按一个键查它绑在哪' }))
    await press('j', 'KeyJ', { metaKey: true })
    expect(screen.getByText('⌘J：没有绑到任何命令')).toBeTruthy()
  })
})
