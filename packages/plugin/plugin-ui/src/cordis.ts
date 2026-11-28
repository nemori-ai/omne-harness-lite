import type { Plugin } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type { Backoff } from '@omne-harness/client-assembly'
import {
  NO_FLOOR,
  createLoader,
  fiberOf,
  heldOf,
  pluginProtocol,
  standingOf,
  type FloorPort,
  type Listed,
  type PluginProtocol,
} from '@omne-harness/plugin-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  lookScope,
  needPoint,
  needProtocol,
  tenantScope,
  type KeyedPoint,
  type PointSink,
  type ServiceKey,
} from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { followWanted, type Sleep } from './follow.ts'
import { handedNames, installOn, presentIn, type Code } from './install.ts'
import { createWear, memoryLookStore, type LookStore, type Wear } from './looks.ts'
import {
  beforeRevisionFour,
  beforeRevisionThree,
  createReporter,
  describedOf,
  reportsOf,
  type Reported,
} from './report.ts'
import { SkinChoice } from './view/skin-choice.tsx'
import { PLUGIN_CATEGORY, PluginPage } from './view/plugin-page.tsx'
import type { PluginGovernance } from './view/plugin-port.ts'

export type PluginUiOptions = Readonly<{
  backoff?: Backoff
  sleep?: Sleep
  code?: Code
  floor?: FloorPort
  /** Where the look a person chose is remembered; without one it lasts as long as this run. */
  looks?: LookStore
  /** The name this client goes by on the server; one of its own making when none is given. */
  clientId?: () => string
  /** Where the choice of skins is drawn: the place above the list of one category of the assets page. */
  skinsAbove?: KeyedPoint<Readonly<{ category: string }>>
  reports?: boolean
}>

type Running = Readonly<{ stop: () => Promise<void> }>

const SKIN_CATEGORY = 'skin'

const isSkin = (listed: Listed): boolean => listed.kind === 'skin'

const SILENT = Object.freeze({ touch: () => undefined, stop: () => undefined })

/** Loads what one tenant is to load for as long as it is the one signed in: a skin in the scope of its own look, the rest in the scope of the tenant. */
function loadFor(
  shell: ShellService,
  client: ClientOf<PluginProtocol>,
  text: string | undefined,
  options: PluginUiOptions,
  wear: Wear,
): Running | undefined {
  const tenant = readTenantText(text ?? '')
  if (tenant === undefined || text === undefined) return undefined
  const scopeOf = (listed: Listed) =>
    isSkin(listed) ? lookScope(text, listed.name) : tenantScope(text)
  const {
    code,
    floor = NO_FLOOR,
    clientId = () => crypto.randomUUID(),
    looks: _looks,
    reports = true,
    ...pace
  } = options
  let skins: ReadonlySet<string> | undefined
  wear.open(text)
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
      return installOn(shell, listed, scopeOf(listed), code)
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
    if (skins !== undefined) wear.settle(skins, loader.states())
    reporter.touch()
  }
  const reporter = !reports
    ? SILENT
    : createReporter(
        () => ({
          plugins: reportsOf(loader.states(), shell.changes().conflicts),
          ...describedOf(shell.described()),
          handed: handedNames(code, shell),
        }),
        async reported => {
          const send = (told: Reported) => client['report-loaded']({ tenant, client: id, ...told })
          for (const told of [reported, beforeRevisionFour(reported)]) {
            const answer = await send(told)
            if (answer.outcome !== 'unavailable') return answer.outcome === 'succeeded'
          }
          return (await send(beforeRevisionThree(reported))).outcome === 'succeeded'
        },
      )
  let listed = false
  /** The tree changed: a waiting plugin whose lacks are all declared now is loaded again in the same version. */
  const recheck = (): void => {
    const described = shell.described()
    for (const [name, state] of loader.states())
      if (state.kind === 'waiting' && presentIn(described, state.lacks)) loader.appeared(name)
  }
  const told = (): void => {
    recheck()
    if (listed) reporter.touch()
  }
  const unwatch = [shell.watchAdoptions(told), shell.watchChanges(told)]
  loader.watch(settle)
  const stopFollowing = followWanted({
    client,
    tenant,
    id,
    onList(list) {
      skins = new Set(list.filter(isSkin).map(each => each.name))
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
      wear.close()
      await loader.stop()
      if (listed) floor.settle(text)
    },
  }
}

export function createPluginUiModule(options: PluginUiOptions = {}): Plugin.Object {
  return defineUiModule({
    name: 'plugin-ui',
    needs: { plugin: needProtocol<ClientOf<PluginProtocol>>(pluginProtocol) },
    apply(shell, { plugin: client }) {
      const wear = createWear({
        wear: look => shell.wear(look),
        store: options.looks ?? memoryLookStore(),
      })
      options.skinsAbove?.contribute(shell, SKIN_CATEGORY, {
        id: 'plugin-ui.skins',
        order: 0,
        render: () => createElement(SkinChoice, { wear }),
      })
      let wanted: string | undefined
      let running: Running | undefined
      let turning: Promise<void> = Promise.resolve()
      const turn = (text: string | undefined): void => {
        if (text === wanted) return
        wanted = text
        turning = turning.then(async () => {
          await running?.stop()
          running = undefined
          if (wanted === text) running = loadFor(shell, client, text, options, wear)
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

export type PluginViewOptions = Readonly<{
  page: PointSink<Readonly<{ asset?: string }>>
  governance: ServiceKey<PluginGovernance>
  target: (category: string, name?: string) => Readonly<{ page: string; subject: string }>
}>

export function createPluginViewModule({ page, governance, target }: PluginViewOptions) {
  return defineUiModule({
    name: 'plugin-ui.view',
    needs: { governance: needPoint(governance) },
    apply(shell, bound) {
      const port = bound.governance.get()
      if (port === undefined) return
      const go = (category: string, name: string): void => {
        const at = target(category, name)
        shell.navigate(at.page, at.subject)
      }
      page.contribute(shell, {
        id: PLUGIN_CATEGORY,
        order: 0,
        label: 'Plugin',
        render: ({ scope, subject }) =>
          scope === undefined
            ? null
            : createElement(PluginPage, {
                governance: port,
                tenant: scope,
                pointAt: subject.asset,
                go,
              }),
      })
    },
  })
}
