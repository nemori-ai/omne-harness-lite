import { act, render } from '@testing-library/react'
import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import {
  definePoint,
  type LoginCredentials,
  type LogoutResult,
  type ShellLogin,
  type ShellLoginState,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import {
  createSizeController,
  type ResolvedTheme,
  type SizeRoot,
  type ThemeChoice,
} from '@omne-harness/ui-kit'
import type { Connectivity } from '../../src/page/connectivity.ts'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { DesktopShell, shellPlugin } from '../../src/page/shell/service.ts'
import { Shell } from '../../src/page/shell/shell.tsx'
import { createShellState } from '../../src/page/shell/state.ts'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { fakeGate, fakePage, type Gated } from './fake-modules.tsx'

export const CHAT = 'fake:chat'
export const SETTINGS = 'fake:settings'
export const chatPage = fakePage({
  id: 'chat',
  title: '对话',
  order: 0,
  service: CHAT,
  icon: 'conversation',
})
export const settingsPage = fakePage({
  id: 'settings',
  title: '设置',
  order: 20,
  service: SETTINGS,
  icon: 'settings',
})

export function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  return {
    current: () => value,
    subscribe(listener: (value: T) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: T) {
      value = next
      for (const listener of Array.from(listeners)) listener(next)
    },
  }
}

export const settle = () => new Promise(resolve => setTimeout(resolve, 0))

/** A connection whose server tells nothing of its tree: the modules that follow it load and stay still. */
export const quietConnection = {
  availability: {
    keys: () => undefined,
    standing: () => ({ kind: 'connecting' }) as const,
    subscribe: () => () => undefined,
  },
}

/** The places the cases attach to: a place counts only while a host declared it. */
const TEST_POINTS = ['test.a', 'test.b']
const TEXT = { encode: (value: string) => value, decode: (value: string) => value }

export async function setup(
  options: {
    login?: ShellLoginState
    modules?: readonly Plugin.Object[]
    logout?: LogoutResult
    connectivity?: Connectivity
    missingAtForwarding?: readonly string[]
    theme?: ThemeChoice
    /** The connection of the tree, for a case that says where a protocol stands. */
    connection?: object | null
  } = {},
) {
  const login = source<ShellLoginState>(options.login ?? 'signed-out')
  const connectivity = source<Connectivity>(options.connectivity ?? 'connected')
  const handedOver: LoginCredentials[] = []
  const chosen: ThemeChoice[] = []
  const inner: ShellLogin = {
    state: login.current,
    subscribe: login.subscribe,
    login: async credentials => {
      handedOver.push(credentials)
      return 'signed-in'
    },
    logout: async () => {
      login.set('signing-out')
      await settle()
      login.set('signed-out')
      return options.logout ?? 'signed-out'
    },
  }
  const state = createShellState(inner)
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(state))
  if (options.connection !== null)
    root.reflect.provide('connection', options.connection ?? quietConnection)
  for (const name of TEST_POINTS) definePoint({ name, subject: TEXT }).declare(root.shell)
  const gated = new Map<string, Plugin.Object[]>()
  for (const module of options.modules ?? [fakeGate(), chatPage, settingsPage]) {
    const gate = (module as Partial<Gated>).gatedBy
    if (gate === undefined) await root.plugin(module)
    else gated.set(gate, [...(gated.get(gate) ?? []), module])
  }
  const theme = {
    initial: options.theme ?? ('system' as ThemeChoice),
    select(choice: ThemeChoice): ResolvedTheme {
      chosen.push(choice)
      return choice === 'dark' ? 'dark' : 'light'
    },
  }
  const sizeRoot: SizeRoot = { dataset: {} }
  const size = createSizeController({ read: () => null, write: () => undefined, root: sizeRoot })
  const view = render(
    <Shell
      appName="omne"
      state={state}
      connectivity={connectivity}
      theme={theme}
      size={size}
      {...(options.missingAtForwarding === undefined
        ? {}
        : { missingAtForwarding: options.missingAtForwarding })}
    />,
  )
  /** Gives the named thing: the protocol of that name is served, and the modules gated by it are loaded. */
  const provide = async (name: string) => {
    let given: Fiber[] = []
    await act(async () => {
      const served = await serveProtocol(root, { name, major: 1 }, {})
      given = [served, ...(gated.get(name) ?? []).map(module => root.plugin(module))]
      await settle()
    })
    return async () => {
      await act(async () => {
        for (const fiber of given) await fiber.dispose()
        await settle()
      })
    }
  }
  /** A module that only holds the shell service, as a caller of its ports. */
  async function module(name: string): Promise<{ fiber: Fiber; shell: ShellService }> {
    let shell: ShellService | undefined
    const fiber = root.plugin({
      name,
      inject: ['shell'],
      apply(ctx: Context) {
        shell = ctx.shell
      },
    })
    await act(async () => {
      await fiber
    })
    return { fiber, shell: shell! }
  }
  const service = root.get('shell') as unknown as DesktopShell
  return {
    login,
    connectivity,
    state,
    root,
    provide,
    module,
    handedOver,
    chosen,
    service,
    size,
    sizeRoot,
    view,
  }
}

/** The navigation's rows in both segments, in page order; the home is not one of them. */
export const navTitles = () =>
  [...document.querySelectorAll('.shell-nav-link')].map(link => link.textContent)

/** The one selected place: `家` for the home, otherwise the row's title. */
export const current = () => {
  const selected = [...document.querySelectorAll('[aria-current="page"]')]
  if (selected.length > 1) throw new Error(`${selected.length} places are selected`)
  const [place] = selected
  if (place === undefined) return undefined
  return place.classList.contains('shell-home') ? '家' : place.textContent
}

export const home = () => document.querySelector<HTMLElement>('.shell-home')

export const section = (id: string) =>
  document.querySelector<HTMLElement>(`section[data-page="${id}"]`)
