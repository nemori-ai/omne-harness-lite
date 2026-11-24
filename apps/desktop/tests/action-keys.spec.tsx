// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { serverPointsContract } from '@omne-harness/client-assembly'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  keyClashes,
  keymapOf,
  type ActionItem,
  type ShellLogin,
} from '@omne-harness/shell-contract'
import { servePoint, serveProtocol } from '@omne-harness/shell-contract/testing'
import { createSizeController } from '@omne-harness/ui-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import { bindActionKeys } from '../src/page/shell/dispatch.ts'
import { frameActions, regionActions, sizeActions } from '../src/page/shell/layout-actions.ts'
import { paletteActions, paletteSwitch } from '../src/page/shell/palette.tsx'
import { shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'
import { quietConnection } from './support/shell-setup.tsx'

const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}
const silent = () =>
  new Proxy({}, { get: (_, name) => (name === 'observe' ? {} : () => new Promise(() => {})) })

/** Every action the desktop application has: the shell's own, then what each module of the assembly put. */
async function assembled(): Promise<readonly ActionItem[]> {
  const root = new Context()
  const state = createShellState(login)
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(state))
  root.reflect.provide('connection', quietConnection)
  await servePoint(root, serverPointsContract, {
    keys: () => undefined,
    subscribe: () => () => undefined,
  })
  for (const protocol of assembly.protocols) await serveProtocol(root, protocol, silent())
  for (const module of assembly.modules) await root.plugin(module)
  for (let round = 0; round < 5; round += 1) await Promise.resolve()
  const size = createSizeController({ read: () => null, write: () => undefined })
  return [
    ...regionActions(),
    ...sizeActions(size),
    ...frameActions(),
    ...paletteActions(paletteSwitch()),
    ...state.slots.items('actions'),
  ]
}

const SIGN: Readonly<Record<string, string>> = {
  '/': 'Slash',
  '.': 'Period',
  ',': 'Comma',
  '?': 'Slash',
}
const SIGN_CODE = (key: string): string =>
  /^[A-Z]$/u.test(key) ? `Key${key}` : /^\d$/u.test(key) ? `Digit${key}` : (SIGN[key] ?? key)

/** The key press a chord stands for on macOS; with ⌥ held a printable key types something else. */
function pressOf(chord: string): KeyboardEventInit {
  const parts = chord.split('+')
  const key = parts.pop() ?? ''
  const alt = parts.includes('Alt')
  return {
    key: key.length > 1 ? key : alt ? '≠' : key.toLowerCase(),
    code: SIGN_CODE(key),
    metaKey: parts.includes('Mod'),
    ctrlKey: parts.includes('Ctrl'),
    altKey: alt,
    shiftKey: parts.includes('Shift'),
    bubbles: true,
    cancelable: true,
  }
}

type Where = 'page' | 'field' | 'overlay'

/** design/first-batch.md: each command that comes with a key, the key on macOS, and where it is pressed; Enter is the composer's (session-ui). */
const FIRST_BATCH: readonly (readonly [string, string, Where])[] = [
  ['session.stop', 'Mod+.', 'field'],
  ['session.background', 'Mod+Shift+B', 'page'],
  ['session.send-first', 'Mod+Enter', 'field'],
  ['session.send-after', 'Alt+Enter', 'field'],
  ['session.new', 'Mod+N', 'page'],
  ['session.next', 'Ctrl+Tab', 'page'],
  ['session.previous', 'Ctrl+Shift+Tab', 'page'],
  ['session.search', 'Mod+Shift+F', 'field'],
  ['assets.settings', 'Mod+,', 'page'],
  ['shell.sidebar', 'Mod+B', 'page'],
  ['session.side-panel', 'Mod+Alt+B', 'page'],
  ['session.focus-composer', 'Mod+L', 'page'],
  ['session.start-command', '/', 'page'],
  ['session.details', 'Mod+Shift+D', 'page'],
  ['session.pick-model', 'Mod+Alt+/', 'page'],
  ['session.pick-permission', 'Mod+Shift+P', 'page'],
  ['human-intervention.waiting', 'Mod+Shift+A', 'page'],
  ['shell.next-region', 'F6', 'page'],
  ['shell.prev-region', 'Shift+F6', 'page'],
  ['shell.bigger', 'Mod+=', 'page'],
  ['shell.smaller', 'Mod+-', 'page'],
  ['shell.reset-size', 'Mod+0', 'page'],
  ['shell.close-layer', 'Escape', 'overlay'],
  ['shell.palette', 'Mod+K', 'field'],
  ['shell.palette', 'Mod+K', 'overlay'],
  ['shell.shortcuts', 'Mod+/', 'field'],
  ['shell.shortcuts', '?', 'page'],
]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the keys of the first batch (C14)', () => {
  it('no two actions of the application hold one key in one layer', async () => {
    const actions = await assembled()
    expect(keyClashes(keymapOf(actions, {}, true))).toEqual([])
    expect(keyClashes(keymapOf(actions, {}, false))).toEqual([])
  })

  it.each(FIRST_BATCH)(
    '%s: pressing %s where it is bound runs that action',
    async (id, chord, where) => {
      const ran: string[] = []
      const actions = (await assembled()).map(action => ({
        ...action,
        available: () => true as const,
        run: () => void ran.push(action.id),
      }))
      expect(actions.map(action => action.id)).toContain(id)
      const unbind = bindActionKeys(window, { actions: () => actions, mac: true })
      const target =
        where === 'field' ? document.createElement('textarea') : document.createElement('button')
      if (where === 'overlay') target.setAttribute('aria-modal', 'true')
      document.body.append(target)
      target.dispatchEvent(new KeyboardEvent('keydown', pressOf(chord)))
      unbind()
      expect(ran).toEqual([id])
    },
  )
})

const SHELL_SOURCES = [
  join(import.meta.dirname, '../src/page/shell'),
  join(import.meta.dirname, '../../../packages/frontend/shell-contract/src'),
]

describe('the shell knows no action of a module (C13, FE-I52)', () => {
  it('none of the names the modules put is written in the shell', async () => {
    const owned = (await assembled()).filter(action => !action.id.startsWith('shell.'))
    expect(owned.length).toBeGreaterThan(15)
    const text = SHELL_SOURCES.flatMap(dir =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter(name => /\.tsx?$/u.test(name))
        .map(name => readFileSync(join(dir, name), 'utf8')),
    ).join('\n')
    expect(owned.filter(action => text.includes(`'${action.id}'`)).map(a => a.id)).toEqual([])
  })
})
