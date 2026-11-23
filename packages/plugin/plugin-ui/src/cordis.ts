import type { Plugin } from '@deepseek-ai/cordis'
import type { Backoff } from '@omne-harness/client-assembly'
import { pluginProtocol, type PluginProtocol } from '@omne-harness/plugin-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, tenantScope } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { followWanted, type Sleep } from './follow.ts'
import { installOn } from './install.ts'
import { createLoader } from './loader.ts'

export type PluginUiOptions = Readonly<{ backoff?: Backoff; sleep?: Sleep }>

type Running = Readonly<{ stop: () => Promise<void> }>

/** Loads what one tenant is to load, in the scope of that tenant, for as long as it is the one signed in. */
function loadFor(
  shell: ShellService,
  client: ClientOf<PluginProtocol>,
  text: string | undefined,
  options: PluginUiOptions,
): Running | undefined {
  const tenant = readTenantText(text ?? '')
  if (tenant === undefined) return undefined
  const scope = tenantScope(text)
  const loader = createLoader({ install: listed => installOn(shell, listed, scope) })
  const stopFollowing = followWanted({
    client,
    tenant,
    onList: list => loader.converge(list),
    ...options,
  })
  return {
    async stop() {
      await stopFollowing()
      await loader.stop()
    },
  }
}

export function createPluginUiModule(options: PluginUiOptions = {}): Plugin.Object {
  return defineUiModule({
    name: 'plugin-ui',
    needs: { plugin: needProtocol<ClientOf<PluginProtocol>>(pluginProtocol) },
    apply(shell, { plugin: client }) {
      let wanted: string | undefined
      let running: Running | undefined
      let turning: Promise<void> = Promise.resolve()
      const turn = (text: string | undefined): void => {
        if (text === wanted) return
        wanted = text
        turning = turning.then(async () => {
          await running?.stop()
          running = undefined
          if (wanted === text) running = loadFor(shell, client, text, options)
        })
      }
      const unsubscribe = shell.scope.subscribe(turn)
      turn(shell.scope.get())
      return () => {
        unsubscribe()
        turn(undefined)
      }
    },
  })
}
