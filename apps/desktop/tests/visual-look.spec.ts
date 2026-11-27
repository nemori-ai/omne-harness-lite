import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow, IpcMainEvent } from 'electron'
import { expect, it, vi } from 'vitest'
import {
  followVisualTheme,
  isTrustedSender,
  PAGE_BACKGROUND,
  pageBackground,
  themeSource,
} from '../src/main/visual-look.ts'
import type { VisualPreferences } from '../src/shared/visual-record.ts'

it('窗口的背景与页面的纸色是同一对值', () => {
  const tokens = readFileSync(
    join(import.meta.dirname, '../../../packages/frontend/ui-kit/src/styles/tokens.css'),
    'utf8',
  )
  const [, light, dark] =
    /--kami-page: light-dark\((#[0-9a-f]+), (#[0-9a-f]+)\)/u.exec(tokens) ?? []
  expect(PAGE_BACKGROUND).toEqual({ light, dark })
  expect(pageBackground('system', true)).toBe(PAGE_BACKGROUND.dark)
  expect(pageBackground('light', true)).toBe(PAGE_BACKGROUND.light)
  expect(pageBackground('dark', false)).toBe(PAGE_BACKGROUND.dark)
  expect(
    ['system', 'light', 'dark'].map(t => themeSource(t as VisualPreferences['theme'])),
  ).toEqual(['system', 'light', 'dark'])
})

it('只认这个窗口当前的主框架，而且在应用的地址下', () => {
  const mainFrame = { url: 'omne-app://app/' }
  const webContents = { mainFrame }
  const window = { isDestroyed: () => false, webContents } as unknown as BrowserWindow
  const event = (sender: unknown, frame: unknown) =>
    ({ sender, senderFrame: frame }) as unknown as IpcMainEvent
  expect(isTrustedSender(event(webContents, mainFrame), window)).toBe(true)
  expect(isTrustedSender(event(webContents, mainFrame), undefined)).toBe(false)
  expect(isTrustedSender(event({}, mainFrame), window)).toBe(false)
  expect(isTrustedSender(event(webContents, { url: 'omne-app://app/' }), window)).toBe(false)
  expect(isTrustedSender(event(webContents, null), window)).toBe(false)
  mainFrame.url = 'https://example.com/'
  expect(isTrustedSender(event(webContents, mainFrame), window)).toBe(false)
})

it('原生外观跟着镜像的主题，跟随系统时系统一变背景也变，停下后不再跟', () => {
  let theme: VisualPreferences['theme'] = 'dark'
  let changed = (): void => {}
  const mirror = {
    theme: () => theme,
    onThemeChange: (listener: () => void) => {
      changed = listener
      return () => (changed = () => {})
    },
  }
  const listeners = new Map<string, () => void>()
  const native = {
    themeSource: 'system' as const as 'system' | 'light' | 'dark',
    shouldUseDarkColors: false,
    on: vi.fn((name: string, listener: () => void) => void listeners.set(name, listener)),
    off: vi.fn((name: string) => void listeners.delete(name)),
  }
  const window = { isDestroyed: () => false, setBackgroundColor: vi.fn<(color: string) => void>() }
  const stop = followVisualTheme(mirror, native as never, () => [
    window as unknown as BrowserWindow,
  ])
  expect(native.themeSource).toBe('dark')
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith(PAGE_BACKGROUND.dark)
  theme = 'system'
  changed()
  expect(native.themeSource).toBe('system')
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith(PAGE_BACKGROUND.light)
  native.shouldUseDarkColors = true
  listeners.get('updated')?.()
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith(PAGE_BACKGROUND.dark)
  stop()
  expect(listeners.has('updated')).toBe(false)
})
