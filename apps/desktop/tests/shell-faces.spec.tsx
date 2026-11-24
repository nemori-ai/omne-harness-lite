// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { Fiber, Plugin } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { BackProps } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { ITEM_FAILED_TEXT } from '../src/page/shell/item.tsx'
import { fakeGate, placeholder } from './support/fake-modules.tsx'
import {
  CHAT,
  SETTINGS,
  chatPage,
  section,
  settingsPage,
  settle,
  setup,
} from './support/shell-setup.tsx'

afterEach(() => cleanup())

const face = (name: 'front' | 'back') =>
  document.querySelector<HTMLElement>(`[data-face="${name}"]`)
const onShow = (): string | undefined => {
  const shown = [...document.querySelectorAll('[data-face]')].filter(
    element => !element.hasAttribute('inert'),
  )
  if (shown.length !== 1) throw new Error(`${shown.length} faces are on show`)
  return shown[0]?.getAttribute('data-face') ?? undefined
}

const MAC_TURN = { key: 'p', metaKey: true, shiftKey: true }
const OTHER_TURN = { key: 'P', ctrlKey: true, shiftKey: true }

/** Presses the keys and tells whether the shell took them. */
function press(keys: object = MAC_TURN): boolean {
  let taken = false
  act(() => {
    taken = !fireEvent.keyDown(window, keys)
  })
  return taken
}

function backModule(
  render: (props: BackProps) => ReactNode = ({ scope }) => placeholder('反面占位', scope),
  name = 'fake-back',
): Plugin.Object {
  return defineUiModule({
    name,
    needs: {},
    apply(shell) {
      shell.contribute('back', { id: 'canvas', render })
    },
  })
}

function floater(id: string): Plugin.Object {
  return defineUiModule({
    name: `floater-${id}`,
    needs: {},
    apply(shell) {
      shell.contribute('float', { id, order: 0, render: () => <p data-floating={id}>浮着</p> })
    },
  })
}

const signedIn = (modules: readonly Plugin.Object[], platform?: 'mac' | 'other') =>
  setup({
    login: 'signed-in',
    modules: [fakeGate(), chatPage, settingsPage, ...modules],
    ...(platform === undefined ? {} : { platform }),
  })

describe('外壳：两面', () => {
  it('放了反面时两面都挂着：正面露着，反面带 inert，不用页面的 hidden；反面那一项收到当前租户', async () => {
    const t = await signedIn([backModule()])
    await t.provide(CHAT)
    act(() => t.state.scope.set('tenant-x'))
    expect(onShow()).toBe('front')
    expect(face('back')?.hasAttribute('inert')).toBe(true)
    expect(face('back')?.hidden).toBe(false)
    expect(screen.getByText('反面占位').getAttribute('data-scope')).toBe('tenant-x')
    expect(screen.getByText('对话占位')).toBeTruthy()
  })

  it('⌘⇧P 换到反面，再按换回正面，正面还在原来那一页，两面都没有卸下', async () => {
    const t = await signedIn([backModule()])
    await t.provide(CHAT)
    await t.provide(SETTINGS)
    act(() => t.service.navigate('settings'))
    const chat = screen.getByText('对话占位')
    expect(press()).toBe(true)
    expect(onShow()).toBe('back')
    expect(face('front')?.hasAttribute('inert')).toBe(true)
    expect(screen.getByText('对话占位')).toBe(chat)
    expect(press()).toBe(true)
    expect(onShow()).toBe('front')
    expect(section('settings')?.hidden).toBe(false)
    expect(section('chat')?.hidden).toBe(true)
    expect(screen.getByText('对话占位')).toBe(chat)
  })

  it('别的平台按 Ctrl+Shift+P；各平台只认自己的那一组', async () => {
    await signedIn([backModule()], 'other')
    expect(press(MAC_TURN)).toBe(false)
    expect(onShow()).toBe('front')
    expect(press(OTHER_TURN)).toBe(true)
    expect(onShow()).toBe('back')
    cleanup()
    await signedIn([backModule()], 'mac')
    expect(press(OTHER_TURN)).toBe(false)
    expect(press({ ...MAC_TURN, altKey: true })).toBe(false)
    expect(onShow()).toBe('front')
  })

  it('没有人放反面时应用只有一面，按键不翻、不吃掉这一下', async () => {
    await signedIn([])
    expect(face('back')).toBeNull()
    expect(face('front')?.hasAttribute('inert')).toBe(false)
    expect(press()).toBe(false)
    expect(face('back')).toBeNull()
    expect(face('front')?.hasAttribute('inert')).toBe(false)
  })

  it('没登录时没有两面，按键什么都不做', async () => {
    const t = await setup({ modules: [fakeGate(), backModule()] })
    expect(face('front')).toBeNull()
    expect(face('back')).toBeNull()
    expect(press()).toBe(false)
    act(() => t.login.set('signed-in'))
    expect(onShow()).toBe('front')
  })

  it('反面那一项用 turn() 翻面，和按键一样', async () => {
    await signedIn([
      backModule(({ turn }) => (
        <button type="button" onClick={turn}>
          翻回去
        </button>
      )),
    ])
    press()
    expect(onShow()).toBe('back')
    act(() => screen.getByRole('button', { name: '翻回去' }).click())
    expect(onShow()).toBe('front')
  })

  it('在反面调 navigate：先翻回正面，再把那一页切到前面；页面不在时什么都不做，也不翻', async () => {
    const t = await signedIn([backModule()])
    await t.provide(CHAT)
    await t.provide(SETTINGS)
    press()
    act(() => t.service.navigate('nowhere'))
    expect(onShow()).toBe('back')
    expect(section('chat')?.hidden).toBe(false)
    act(() => t.service.navigate('settings'))
    expect(onShow()).toBe('front')
    expect(section('settings')?.hidden).toBe(false)
  })

  it('露着反面时撤下那一项，直接露出正面；它回来时入口回来，外壳不自己翻过去', async () => {
    const t = await signedIn([])
    let back: Fiber | undefined
    await act(async () => {
      back = t.root.plugin(backModule())
      await back
      await settle()
    })
    press()
    expect(onShow()).toBe('back')
    await act(async () => {
      await back?.dispose()
      await settle()
    })
    expect(face('back')).toBeNull()
    expect(onShow()).toBe('front')
    expect(press()).toBe(false)
    await act(async () => {
      await t.root.plugin(backModule())
      await settle()
    })
    expect(onShow()).toBe('front')
    expect(face('back')?.hasAttribute('inert')).toBe(true)
    expect(press()).toBe(true)
    expect(onShow()).toBe('back')
  })

  it('两个模块都放反面：两份都不画，反面上一行写明是哪几家；翻面照常', async () => {
    await signedIn([
      backModule(() => placeholder('甲的反面'), 'back-a'),
      backModule(() => placeholder('乙的反面'), 'back-b'),
    ])
    expect(screen.queryByText('甲的反面')).toBeNull()
    expect(screen.queryByText('乙的反面')).toBeNull()
    expect(face('back')?.textContent).toContain('back-a')
    expect(face('back')?.textContent).toContain('back-b')
    expect(press()).toBe(true)
    expect(onShow()).toBe('back')
  })

  it('浮层在两面之上：翻到哪一面，浮层的项都在原处，不在收起的一面里', async () => {
    await signedIn([backModule(), floater('pet')])
    const pet = () => document.querySelector('[data-floating="pet"]')
    const before = pet()
    expect(before?.closest('[inert]')).toBeNull()
    press()
    expect(onShow()).toBe('back')
    expect(pet()).toBe(before)
    expect(pet()?.closest('[inert]')).toBeNull()
    expect(pet()?.closest('[data-face]')).toBeNull()
  })

  it('F6 只走露着的那一面', async () => {
    await signedIn([backModule()])
    press()
    const where = () => (document.activeElement as HTMLElement).closest('[data-face]')
    for (let step = 0; step < 3; step += 1) {
      act(() => void fireEvent.keyDown(window, { key: 'F6' }))
      expect(where()).toBe(face('back'))
    }
    press()
    for (let step = 0; step < 3; step += 1) {
      act(() => void fireEvent.keyDown(window, { key: 'F6' }))
      expect(where()).toBe(face('front'))
    }
  })

  describe('反面那一项坏了', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('反面只有这一项读不出，按键照常翻回正面', async () => {
      function Boom(): ReactNode {
        throw new Error('boom')
      }
      const t = await signedIn([backModule(() => <Boom />)])
      await t.provide(CHAT)
      press()
      expect(onShow()).toBe('back')
      expect(face('back')?.textContent).toContain(ITEM_FAILED_TEXT)
      expect(face('front')?.textContent).not.toContain(ITEM_FAILED_TEXT)
      expect(press()).toBe(true)
      expect(onShow()).toBe('front')
      expect(screen.getByText('对话占位')).toBeTruthy()
    })
  })
})
