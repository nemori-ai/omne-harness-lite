import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { needPoint, needProtocol, serviceKey, type ServiceKey } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { CLEARED, entryActions, typedAction, type ComposerWriter } from './model/entries.ts'
import { type Helper, openHelper, type SlashCommandClient } from './model/helper.ts'
import { KeyBindings, type BindingCache, type PreferencePort } from './model/bindings.ts'
import type { ComposerMachine } from './model/ports.ts'
import { KeysPage } from './view/keys-page.tsx'

const KEYS_PAGE = 'commands-and-keys'
const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

function localCache(name: string): BindingCache {
  const key = `omne.${name}`
  return {
    read: () => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: text => {
      try {
        window.localStorage.setItem(key, text)
      } catch {}
    },
  }
}

/** The page of every command but the Skills, where the keys are changed; the changes are the account's. */
function keysPage(shell: ShellService, preferences: () => PreferencePort | undefined): () => void {
  const name = MAC ? 'keys.mac' : 'keys.other'
  const bindings = new KeyBindings(preferences, localCache(name), name)
  const reload = (): void => {
    if (shell.login.state() === 'signed-in') void bindings.load()
  }
  reload()
  shell.contribute('keymap', {
    id: 'slash-command.keymap',
    changes: bindings.changes,
    subscribe: bindings.subscribe,
  })
  shell.contribute('pages', {
    id: KEYS_PAGE,
    title: '命令与快捷键',
    order: 30,
    icon: 'commands',
    group: 'utility',
    render: () => (
      <KeysPage
        actions={{
          items: () => shell.items('actions'),
          subscribe: l => shell.subscribe('actions', l),
        }}
        bindings={bindings}
        mac={MAC}
      />
    ),
  })
  shell.contribute('actions', {
    id: 'slash-command.keys',
    title: '命令与快捷键',
    group: '页面',
    kind: 'ui',
    order: 3,
    available: () => true,
    run: () => shell.navigate(KEYS_PAGE),
  })
  return shell.login.subscribe(reload)
}

/** What helps a composer: the assembly hands it to the module that owns the composer. */
export type ComposerHelpers = Readonly<{ open(tenant: string, session: string): Helper }>

export const slashCommandComposerKey = serviceKey<ComposerHelpers>('slash-command.composer')

export type SlashCommandUiOptions = Readonly<{
  /** A new composer's logic: the recognizer of the command domain, as the assembly takes it from its pure contract. */
  composer: () => ComposerMachine
  /** Where the module that owns the composer lets words be written or said; without it entries cannot run. */
  writer?: ServiceKey<ComposerWriter>
  /** Where the identity interface lets the account's preferences be read and written; without it keys stay here. */
  preferences?: ServiceKey<PreferencePort>
}>

/** The list of the composer last opened, put in the action table; the one before is taken out first. */
function listedActions(shell: ShellService, writer: () => ComposerWriter | undefined) {
  let withdraw: readonly (() => unknown)[] = []
  return (catalog: Parameters<ComposerMachine['listed']>[0]): void => {
    for (const taken of withdraw) taken()
    withdraw =
      catalog === null
        ? []
        : entryActions(catalog, writer).map(action => shell.contribute('actions', action))
  }
}

function helping(shell: ShellService, helper: Helper): Helper {
  let text = ''
  return {
    ...helper,
    input(next, caret) {
      text = next
      helper.input(next, caret)
    },
    key(key) {
      const action = key === 'enter' ? typedAction(text, shell.items('actions')) : undefined
      if (action === undefined) return helper.key(key)
      const can = action.available()
      if (can !== true) {
        shell.toast({ id: 'slash-command.typed', tone: 'attention', title: can })
        return { kind: 'held' }
      }
      void Promise.resolve().then(action.run)
      return CLEARED
    },
  }
}

export function createSlashCommandUiModule(options: SlashCommandUiOptions) {
  return defineUiModule({
    name: 'slash-command-ui',
    needs: {
      client: needProtocol<SlashCommandClient>(slashCommandProtocol),
      writer: needPoint(options.writer, { optional: true }),
      preferences: needPoint(options.preferences, { optional: true }),
    },
    apply(shell, { client, writer, preferences }, provide) {
      const stopKeys = keysPage(shell, () => preferences.get())
      const list = listedActions(shell, () => writer.get())
      let shown: object | undefined
      provide(slashCommandComposerKey, {
        open: (tenant, session) => {
          const mine = {}
          shown = mine
          const machine = options.composer()
          const watched: ComposerMachine = {
            ...machine,
            listed: catalog => {
              machine.listed(catalog)
              if (shown === mine) list(catalog)
            },
          }
          const helper = helping(shell, openHelper(client, watched, { tenant, session }))
          return {
            ...helper,
            close() {
              helper.close()
              if (shown === mine) list(null)
            },
          }
        },
      })
      return () => {
        stopKeys()
        list(null)
      }
    },
  })
}
