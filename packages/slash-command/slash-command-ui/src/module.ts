import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { needPoint, needProtocol, serviceKey, type ServiceKey } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { CLEARED, entryActions, typedAction, type ComposerWriter } from './model/entries.ts'
import { type Helper, openHelper, type SlashCommandClient } from './model/helper.ts'
import type { ComposerMachine } from './model/ports.ts'

/** What helps a composer: the assembly hands it to the module that owns the composer. */
export type ComposerHelpers = Readonly<{ open(tenant: string, session: string): Helper }>

export const slashCommandComposerKey = serviceKey<ComposerHelpers>('slash-command.composer')

export type SlashCommandUiOptions = Readonly<{
  /** A new composer's logic: the recognizer of the command domain, as the assembly takes it from its pure contract. */
  composer: () => ComposerMachine
  /** Where the module that owns the composer lets words be written or said; without it entries cannot run. */
  writer?: ServiceKey<ComposerWriter>
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
    },
    apply(shell, { client, writer }, provide) {
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
      return () => list(null)
    },
  })
}
