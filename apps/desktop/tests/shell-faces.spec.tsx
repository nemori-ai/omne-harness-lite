// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { Fiber, Plugin } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { BackProps } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { FigureSeat } from '@omne-harness/ui-kit'
import { FACE_KEY, storedFacePreference } from '../src/page/shell/face.ts'
import { ITEM_FAILED_TEXT } from '../src/page/shell/item.tsx'
import { activeSeat } from '../src/page/shell/seats.ts'
import { FACE_TEXT } from '../src/page/shell/shell.tsx'
import { TURN_LABEL } from '../src/page/shell/sidebar.tsx'
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

/** Most cases turn at once, as under reduced motion; the cases of the flip itself let it play. */
let reduced = true
const REDUCED = '(prefers-reduced-motion: reduce)'
const realMatchMedia = window.matchMedia.bind(window)

beforeEach(() => {
  reduced = true
  vi.stubGlobal('matchMedia', (query: string) =>
    query === REDUCED
      ? {
          matches: reduced,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }
      : realMatchMedia(query),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

const signedIn = (
  modules: readonly Plugin.Object[],
  platform?: 'mac' | 'other',
  more: Parameters<typeof setup>[0] = {},
) =>
  setup({
    login: 'signed-in',
    modules: [fakeGate(), chatPage, settingsPage, ...modules],
    ...(platform === undefined ? {} : { platform }),
    ...more,
  })

/** This device's store, as `localStorage` would hold it; `blocked` makes a read or a write throw. */
function device(stored?: string, blocked: 'read' | 'write' | 'none' = 'none') {
  const held = new Map<string, string>(stored === undefined ? [] : [[FACE_KEY, stored]])
  const faces = storedFacePreference(() => ({
    getItem(key: string) {
      if (blocked === 'read') throw new Error('blocked')
      return held.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (blocked === 'write') throw new Error('blocked')
      held.set(key, value)
    },
  }))
  return { held, faces }
}

/** A connection that has said nothing yet, and says what it serves when the case tells it to. */
function telling() {
  let said: number | undefined
  const listeners = new Set<() => void>()
  return {
    connection: {
      availability: {
        keys: () => undefined,
        revision: () => said,
        standing: () => ({ kind: said === undefined ? 'connecting' : 'open' }) as const,
        subscribe(listener: () => void) {
          listeners.add(listener)
          return () => void listeners.delete(listener)
        },
      },
    },
    async say() {
      await act(async () => {
        said = 1
        for (const listener of Array.from(listeners)) listener()
        await settle()
      })
    },
  }
}

const mark = () => screen.queryByRole('button', { name: TURN_LABEL })
const figure = () => document.querySelector<HTMLElement>('[data-control="figure"]')
const rightPressFigure = (): boolean => {
  let taken = false
  act(() => {
    taken = !fireEvent.contextMenu(figure()!)
  })
  return taken
}
const status = () =>
  [...document.querySelectorAll('.app-shell [role="status"]')].map(found => found.textContent)
const skip = () => screen.getByRole('link', { name: '跳到正文' }).getAttribute('href')

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

describe('外壳：翻面的入口', () => {
  it('正面侧栏底部的墨记号翻到反面；反面上对形按右键翻回正面', async () => {
    await signedIn([backModule()])
    expect(mark()).not.toBeNull()
    act(() => mark()!.click())
    expect(onShow()).toBe('back')
    expect(rightPressFigure()).toBe(true)
    expect(onShow()).toBe('front')
  })

  it('在正面对形按右键不翻，也不拦下这一下', async () => {
    await signedIn([backModule()])
    expect(rightPressFigure()).toBe(false)
    expect(onShow()).toBe('front')
  })

  it('应用只有一面时没有墨记号，按键与对形按右键都不翻', async () => {
    await signedIn([])
    expect(mark()).toBeNull()
    expect(press()).toBe(false)
    expect(rightPressFigure()).toBe(false)
    expect(face('back')).toBeNull()
  })

  it('反面那一项渲染抛出时，对形按右键照常翻回正面', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Boom(): ReactNode {
      throw new Error('boom')
    }
    await signedIn([backModule(() => <Boom />)])
    press()
    expect(face('back')?.textContent).toContain(ITEM_FAILED_TEXT)
    expect(rightPressFigure()).toBe(true)
    expect(onShow()).toBe('front')
  })

  it('收起的一面里的座位不算看得见：形坐露着的那一面的座位', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const side = this.dataset['figureSeat'] === undefined ? 0 : 32
      return {
        left: 10,
        top: 10,
        width: side,
        height: side,
        right: 10 + side,
        bottom: 10 + side,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      } as DOMRect
    })
    await signedIn([backModule(() => <FigureSeat name="canvas" />)])
    expect(activeSeat()?.dataset['figureSeat']).toBe('home')
    press()
    expect(activeSeat()?.dataset['figureSeat']).toBe('canvas')
    press()
    expect(activeSeat()?.dataset['figureSeat']).toBe('home')
  })

  it('翻完在隐藏的状态文字里说现在露着哪一面；没翻过时不说', async () => {
    await signedIn([backModule()])
    expect(status()).toContain('')
    expect(status()).not.toContain(FACE_TEXT.front)
    press()
    expect(status()).toContain(FACE_TEXT.back)
    press()
    expect(status()).toContain(FACE_TEXT.front)
  })

  it('「跳到正文」指到露着的那一面，不指到收起的那一面', async () => {
    await signedIn([backModule()])
    const target = () => document.querySelector(skip()!)
    expect(target()?.closest('[inert]')).toBeNull()
    expect(target()?.closest('[data-face]')).toBe(face('front'))
    press()
    expect(target()?.closest('[inert]')).toBeNull()
    expect(target()).toBe(face('back'))
  })
})

describe('外壳：停在哪一面', () => {
  it('记在本机：翻到反面后重开，停在反面；再翻回正面后重开，停在正面', async () => {
    const kept = device()
    await signedIn([backModule()], undefined, { faces: kept.faces })
    press()
    expect(kept.held.get(FACE_KEY)).toBe('back')
    cleanup()
    await signedIn([backModule()], undefined, { faces: kept.faces })
    expect(onShow()).toBe('back')
    press()
    cleanup()
    await signedIn([backModule()], undefined, { faces: kept.faces })
    expect(onShow()).toBe('front')
  })

  it.each([
    ['第一次', device()],
    ['读不到', device('back', 'read')],
    ['读不懂', device('the back')],
  ])('%s是正面', async (_name, kept) => {
    await signedIn([backModule()], undefined, { faces: kept.faces })
    expect(onShow()).toBe('front')
  })

  it('存不进时这一次照常翻', async () => {
    const kept = device(undefined, 'write')
    await signedIn([backModule()], undefined, { faces: kept.faces })
    expect(press()).toBe(true)
    expect(onShow()).toBe('back')
    expect(press()).toBe(true)
    expect(onShow()).toBe('front')
  })

  it('没登录时只有登录门，记着的那一面不动；登录之后照它停', async () => {
    const kept = device('back')
    const t = await setup({ modules: [fakeGate(), backModule()], faces: kept.faces })
    expect(face('back')).toBeNull()
    expect(kept.held.get(FACE_KEY)).toBe('back')
    act(() => t.login.set('signed-in'))
    expect(onShow()).toBe('back')
  })

  it('再登录时照记着的那一面停，即使上一次登录里反面撤下过', async () => {
    const kept = device('back')
    const told = telling()
    const t = await signedIn([], undefined, { faces: kept.faces, connection: told.connection })
    await told.say()
    expect(onShow()).toBe('front')
    act(() => t.login.set('signed-out'))
    await act(async () => {
      await t.root.plugin(backModule())
      await settle()
    })
    act(() => t.login.set('signed-in'))
    expect(onShow()).toBe('back')
  })

  it('记着反面而连接还没说开着什么：露一张空纸等着；反面放上了就画它', async () => {
    const kept = device('back')
    const told = telling()
    const t = await signedIn([], undefined, { faces: kept.faces, connection: told.connection })
    expect(onShow()).toBe('back')
    expect(face('back')?.textContent).toBe('')
    await act(async () => {
      await t.root.plugin(backModule())
      await settle()
    })
    expect(onShow()).toBe('back')
    expect(screen.getByText('反面占位')).toBeTruthy()
    await told.say()
    expect(onShow()).toBe('back')
  })

  it('记着反面而定下来没有反面：露出正面，记着的那一面不变', async () => {
    const kept = device('back')
    const told = telling()
    const t = await signedIn([], undefined, { faces: kept.faces, connection: told.connection })
    expect(onShow()).toBe('back')
    await told.say()
    expect(onShow()).toBe('front')
    expect(face('back')).toBeNull()
    expect(kept.held.get(FACE_KEY)).toBe('back')
    await act(async () => {
      await t.root.plugin(backModule())
      await settle()
    })
    expect(onShow()).toBe('front')
  })

  it('露着反面时那一项被撤下：直接露出正面，不播翻面，记着的那一面不变', async () => {
    reduced = false
    const kept = device('back')
    const t = await signedIn([], undefined, { faces: kept.faces })
    let back: Fiber | undefined
    await act(async () => {
      back = t.root.plugin(backModule())
      await back
      await settle()
    })
    expect(onShow()).toBe('back')
    await act(async () => {
      await back?.dispose()
      await settle()
    })
    expect(onShow()).toBe('front')
    expect(document.querySelector('.omne-flip')).toBeNull()
    expect(kept.held.get(FACE_KEY)).toBe('back')
  })
})

describe('外壳：翻面在动', () => {
  async function playing(more: Parameters<typeof setup>[0] = {}) {
    reduced = false
    const t = await signedIn(
      [
        backModule(({ turn }) => (
          <button type="button" onClick={turn}>
            翻回去
          </button>
        )),
      ],
      undefined,
      more,
    )
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    })
    const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
    return { ...t, pass, layer: () => document.querySelector<HTMLElement>('.omne-flip') }
  }

  it('四个入口里外壳管的三个与 turn() 走同一个翻面：途中盖着一层，1500 毫秒内停在要去的那一面', async () => {
    const t = await playing()
    const turns = [
      () => press(),
      () => rightPressFigure(),
      () => act(() => mark()!.click()),
      () => act(() => screen.getByRole('button', { name: '翻回去' }).click()),
    ]
    let expected: 'front' | 'back' = 'front'
    for (const turn of turns) {
      turn()
      expected = expected === 'front' ? 'back' : 'front'
      expect(onShow()).toBe(expected)
      expect(t.layer()).not.toBeNull()
      expect(face(expected === 'front' ? 'back' : 'front')?.hasAttribute('data-flip-leaving')).toBe(
        true,
      )
      t.pass(1500)
      expect(t.layer()).toBeNull()
      expect(document.querySelector('[data-flip-leaving]')).toBeNull()
      if (turns.indexOf(turn) === 0) expect(status()).toContain(FACE_TEXT.back)
    }
  })

  it('途中再按一次：立刻停在要去的那一面，不翻回来', async () => {
    const t = await playing()
    press()
    t.pass(300)
    press()
    expect(t.layer()).toBeNull()
    expect(onShow()).toBe('back')
  })

  it('途中点一下：只让翻面停下，这一下不落到底下的控件上', async () => {
    const t = await playing()
    press()
    t.pass(300)
    const pressed = vi.fn()
    const under = screen.getByRole('button', { name: '翻回去' })
    under.addEventListener('click', pressed)
    const layer = t.layer()!
    act(() => {
      fireEvent.pointerDown(layer, { button: 0 })
      fireEvent.pointerUp(layer, { button: 0 })
      fireEvent.click(layer)
    })
    t.pass(10)
    expect(t.layer()).toBeNull()
    expect(onShow()).toBe('back')
    expect(pressed).not.toHaveBeenCalled()
  })

  it('翻向反面的途中调 navigate：仍然回到正面，再到那一页', async () => {
    const t = await playing()
    await act(async () => {
      await serveSettings(t)
    })
    press()
    act(() => t.service.navigate('settings'))
    t.pass(1500)
    expect(onShow()).toBe('front')
    expect(section('settings')?.hidden).toBe(false)
  })
})

async function serveSettings(t: Awaited<ReturnType<typeof setup>>) {
  vi.useRealTimers()
  await t.provide(SETTINGS)
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  })
}
