// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  type ColorSchemeQuery,
  type ThemeChoice,
  type ThemeRoot,
  createThemeController,
  resolveTheme,
} from '../src/index.ts'

function fakeRoot(): ThemeRoot & { readonly classes: Set<string> } {
  const classes = new Set<string>()
  return {
    dataset: {},
    classes,
    classList: {
      add: token => void classes.add(token),
      remove: token => void classes.delete(token),
    },
  }
}

function fakeSystem(initialDark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initialDark,
    addEventListener: (_type: 'change', listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => void listeners.delete(listener),
  } satisfies ColorSchemeQuery & { matches: boolean }
  return {
    query: query as ColorSchemeQuery & { matches: boolean },
    listeners,
    flip(dark: boolean) {
      query.matches = dark
      for (const listener of [...listeners]) listener()
    },
  }
}

function setup(stored: ThemeChoice, systemDark: boolean | undefined) {
  const root = fakeRoot()
  const system = systemDark === undefined ? undefined : fakeSystem(systemDark)
  const frames: (() => void)[] = []
  const read = vi.fn(() => stored)
  const write = vi.fn<(choice: ThemeChoice) => void>()
  const controller = createThemeController({
    read,
    write,
    system: system?.query,
    root,
    frame: callback => void frames.push(callback),
  })
  const runFrame = (): void => void frames.shift()?.()
  return { root, system, read, write, controller, runFrame, frames }
}

afterEach(() => vi.restoreAllMocks())

it.each([
  ['light', true, 'light'],
  ['light', false, 'light'],
  ['dark', true, 'dark'],
  ['dark', false, 'dark'],
  ['system', true, 'dark'],
  ['system', false, 'light'],
] as const)('stored %s with the system preferring dark=%s paints %s', (stored, dark, painted) => {
  const { root, controller, read, write } = setup(stored, dark)
  expect(controller.start()).toBe(painted)
  expect(root.dataset.theme).toBe(painted)
  expect(root.dataset.themePreference).toBe(stored)
  expect(read).toHaveBeenCalledTimes(1)
  expect(write).not.toHaveBeenCalled()
})

it('a machine without a colour-scheme query is read as preferring dark under system', () => {
  const { root, controller } = setup('system', undefined)
  expect(controller.start()).toBe('dark')
  expect(root.dataset.theme).toBe('dark')
})

it('resolveTheme lets an explicit choice overrule the machine', () => {
  expect(resolveTheme('light', true)).toBe('light')
  expect(resolveTheme('dark', false)).toBe('dark')
  expect(resolveTheme('system', true)).toBe('dark')
  expect(resolveTheme('system', false)).toBe('light')
})

it.each(['light', 'dark', 'system'] as const)(
  'select(%s) hands the choice to write and paints it',
  choice => {
    const { root, controller, write } = setup('system', false)
    controller.start()
    const painted = controller.select(choice)
    expect(write).toHaveBeenCalledExactlyOnceWith(choice)
    expect(painted).toBe(choice === 'dark' ? 'dark' : 'light')
    expect(root.dataset.themePreference).toBe(choice)
  },
)

it('under system the page follows the machine when it changes', () => {
  const { root, system, controller } = setup('system', false)
  controller.start()
  expect(root.dataset.theme).toBe('light')
  system?.flip(true)
  expect(root.dataset.theme).toBe('dark')
  system?.flip(false)
  expect(root.dataset.theme).toBe('light')
})

it('under an explicit choice a machine change is ignored and no listener is held', () => {
  const { root, system, controller } = setup('dark', false)
  controller.start()
  expect(system?.listeners.size).toBe(0)
  system?.flip(false)
  system?.flip(true)
  expect(root.dataset.theme).toBe('dark')
})

it('moving from system to an explicit choice lets go of the machine, and back attaches once', () => {
  const { system, controller } = setup('system', false)
  controller.start()
  expect(system?.listeners.size).toBe(1)
  controller.select('light')
  expect(system?.listeners.size).toBe(0)
  controller.select('system')
  controller.select('system')
  expect(system?.listeners.size).toBe(1)
})

it('dispose lets go of the machine and leaves the last theme on the page', () => {
  const { root, system, controller } = setup('system', true)
  controller.start()
  controller.dispose()
  expect(system?.listeners.size).toBe(0)
  system?.flip(false)
  expect(root.dataset.theme).toBe('dark')
  expect(root.classes.has('theme-switching')).toBe(false)
})

it('a flip freezes transitions for two frames and then lets go', () => {
  const { root, controller, runFrame } = setup('light', false)
  controller.start()
  expect(root.classes.has('theme-switching')).toBe(true)
  runFrame()
  expect(root.classes.has('theme-switching')).toBe(true)
  runFrame()
  expect(root.classes.has('theme-switching')).toBe(false)
  controller.select('light')
  expect(root.classes.has('theme-switching')).toBe(false)
  controller.select('dark')
  expect(root.classes.has('theme-switching')).toBe(true)
})

it('never reads or writes storage by itself', () => {
  const getItem = vi.spyOn(Storage.prototype, 'getItem')
  const setItem = vi.spyOn(Storage.prototype, 'setItem')
  const { controller } = setup('system', true)
  controller.start()
  controller.select('dark')
  controller.select('system')
  controller.dispose()
  expect(getItem).not.toHaveBeenCalled()
  expect(setItem).not.toHaveBeenCalled()
})

it('paints the real document root when none is injected', () => {
  const controller = createThemeController({
    read: () => 'dark',
    write: () => undefined,
    system: undefined,
  })
  controller.start()
  expect(document.documentElement.dataset['theme']).toBe('dark')
  controller.dispose()
  delete document.documentElement.dataset['theme']
  delete document.documentElement.dataset['themePreference']
})
