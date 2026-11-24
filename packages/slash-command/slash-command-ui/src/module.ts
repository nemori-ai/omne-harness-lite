import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { needProtocol, serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { type Helper, openHelper, type SlashCommandClient } from './model/helper.ts'
import type { ComposerMachine } from './model/ports.ts'

/** What helps a composer: the assembly hands it to the module that owns the composer. */
export type ComposerHelpers = Readonly<{ open(tenant: string, session: string): Helper }>

export const slashCommandComposerKey = serviceKey<ComposerHelpers>('slash-command.composer')

export type SlashCommandUiOptions = Readonly<{
  /** A new composer's logic: the recognizer of the command domain, as the assembly takes it from its pure contract. */
  composer: () => ComposerMachine
}>

export function createSlashCommandUiModule(options: SlashCommandUiOptions) {
  return defineUiModule({
    name: 'slash-command-ui',
    needs: { client: needProtocol<SlashCommandClient>(slashCommandProtocol) },
    apply(_shell, { client }, provide) {
      provide(slashCommandComposerKey, {
        open: (tenant, session) => openHelper(client, options.composer(), { tenant, session }),
      })
    },
  })
}
