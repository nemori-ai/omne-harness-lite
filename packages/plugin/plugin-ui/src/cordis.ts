import type { Plugin } from '@deepseek-ai/cordis'
import type { Backoff } from '@omne-harness/client-assembly'
import { pluginProtocol, type PluginProtocol } from '@omne-harness/plugin-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, tenantScope } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { NO_FLOOR, fiberOf, heldOf, standingOf, type FloorPort } from './floor.ts'
import { followWanted, type Sleep } from './follow.ts'
import { installOn, type Code } from './install.ts'
import { createReporter, reportsOf } from './report.ts'
import { createLoader } from './loader.ts'

export type PluginUiOptions = Readonly<{
  backoff?: Backoff
  sleep?: Sleep
  code?: Code
  floor?: FloorPort
  /** The name this client goes by on the server; one of its own making when none is given. */
  clientId?: () => string
}>

type Running = Readonly<{ stop: () => Promise<void> }>

/** Loads what one tenant is to load, in the scope of that tenant, for as long as it is the one signed in. */
function loadFor(
  shell: ShellService,
  client: ClientOf<PluginProtocol>,
  text: string | undefined,
  options: PluginUiOptions,
): Running | undefined {
  const tenant = readTenantText(text ?? '')
  if (tenant === undefined || text === undefined) return undefined
  const scope = tenantScope(text)
  const { code, floor = NO_FLOOR, clientId = () => crypto.randomUUID(), ...pace } = options
  const id = clientId()
  const risen = floor.rise(text)
  const known = new Set(risen.want)
  const marked = new Set<string>()
  const loader = createLoader({
    held: risen.held ? heldOf(risen.want) : new Map(),
    install(listed) {
      const fiber = fiberOf(listed.name, listed.version)
      floor.want(text, fiber)
      known.add(fiber)
      return installOn(shell, listed, scope, code)
    },
  })
  const mark = (held: ReadonlySet<string>): void => {
    for (const fiber of marked) {
      if (held.has(fiber)) continue
      marked.delete(fiber)
      shell.markStart(fiber, 'gone')
    }
    for (const fiber of held) {
      marked.add(fiber)
      shell.markStart(fiber, 'held')
    }
  }
  /** Brings the floor and the marks on the shell to what the loader holds now. */
  const settle = (): void => {
    const standing = standingOf(loader.states())
    for (const fiber of known) {
      if (standing.wanted.has(fiber)) continue
      known.delete(fiber)
      floor.unwant(text, fiber)
    }
    mark(standing.held)
    if (!standing.loading) floor.settle(text)
    reporter.touch()
  }
  const reporter = createReporter(
    () => ({
      plugins: reportsOf(loader.states(), shell.changes().conflicts),
      ...shell.described(),
    }),
    async reported =>
      (await client['report-loaded']({ tenant, client: id, ...reported })).outcome === 'succeeded',
  )
  let listed = false
  const told = (): void => {
    if (listed) reporter.touch()
  }
  const unwatch = [shell.watchAdoptions(told), shell.watchChanges(told)]
  loader.watch(settle)
  const stopFollowing = followWanted({
    client,
    tenant,
    id,
    onList(list) {
      loader.converge(list)
      listed = true
      settle()
    },
    ...pace,
  })
  return {
    async stop() {
      reporter.stop()
      for (const stop of unwatch) stop()
      await stopFollowing()
      mark(new Set())
      await loader.stop()
      floor.settle(text)
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
