import type { SuperviseConfig } from '@omne-harness/assembly'
import {
  DEVICE_PAGE_VERSION,
  DEVICE_PAGE_VERSION_TOLD,
  type PageNotice,
  type PageVersionAnswer,
} from '../shared/page-version.ts'
import type { LocalRoute } from './app-protocol.ts'
import type { Logger } from './log.ts'
import { runTrial, type Mount, type TrialDeps } from './page-trial.ts'
import type { PageVersions, Serving } from './page-versions.ts'

export const INSTALL_SWITCH = '--install-page-bundle='

/** The directory a command line asks to install as the next version of the page, when it asks. */
export function installRequest(argv: readonly string[]): string | undefined {
  const asked = argv.find(arg => arg.startsWith(INSTALL_SWITCH))?.slice(INSTALL_SWITCH.length)
  return asked === undefined || asked === '' ? undefined : asked
}

export type PageUpdateDeps = Readonly<{
  versions: PageVersions
  /** Serves this version from now on: the forwarding layer starts again on its files, the window loads again. */
  serve(serving: Serving): Promise<void>
  nudge(): void
  candidate(root: string): Promise<Mount>
  window: Pick<TrialDeps, 'watch' | 'stable' | 'reload' | 'after'>
  config: SuperviseConfig
  log: Logger
}>

export type PageUpdates = Readonly<{
  /** A trial is under way: it answers the failures of the main window, nobody else reloads or asks. */
  onTrial(): boolean
  install(directory: string): Promise<void>
  /** At the start of the app: goes on with the trial of a version that has not settled. */
  resume(): void
  route: LocalRoute
}>

const json = (body: PageVersionAnswer): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export function pageUpdates(deps: PageUpdateDeps, started: Serving): PageUpdates {
  const { versions, log } = deps
  let serving = started
  let trial = false
  let busy = false
  let notice: PageNotice | null =
    started.unusable === undefined
      ? null
      : { kind: 'unusable', from: started.unusable.version, reason: started.unusable.reason }
  const note = (next: PageNotice): void => {
    notice = next
    log.info({ notice: next }, 'page version: something to tell the person')
    deps.nudge()
  }
  const serve = async (version: string): Promise<void> => {
    serving = { version, root: versions.rootOf(version), settled: false }
    await deps.serve(serving)
  }

  async function onTrial(version: string): Promise<void> {
    trial = true
    try {
      const outcome = await runTrial({
        ...deps.window,
        tell: kind => versions.tell(version, kind),
        config: deps.config,
      })
      log.info({ version, outcome }, 'page version: the trial ended')
      if (outcome.kind !== 'went-back') return
      await serve(outcome.to)
      note({ kind: 'fell', from: version, to: outcome.to, falls: outcome.falls })
    } finally {
      trial = false
    }
  }

  async function install(directory: string): Promise<void> {
    const installed = await versions.install(directory)
    if (installed.kind === 'refused') return note({ kind: 'refused', reason: installed.reason })
    const { version } = installed
    if (version === serving.version) return
    const mount = await deps.candidate(versions.rootOf(version))
    if (mount !== 'mounted') return note({ kind: 'refused', reason: mount, version })
    log.info({ version }, 'page version: the candidate came up out of sight')
    versions.switchTo(version)
    await serve(version)
    note({ kind: 'switched', to: version })
    void onTrial(version).catch(err => log.error({ err }, 'page version: the trial failed'))
  }

  return {
    onTrial: () => trial,
    async install(directory) {
      if (busy || trial) return void log.warn({ directory }, 'page version: an update is under way')
      busy = true
      try {
        await install(directory)
      } catch (err) {
        log.error({ err, directory }, 'page version: the install failed')
        note({ kind: 'refused', reason: err instanceof Error ? err.message : String(err) })
      } finally {
        busy = false
      }
    },
    resume() {
      if (!started.settled)
        void onTrial(started.version).catch(err =>
          log.error({ err }, 'page version: the trial failed'),
        )
    },
    route(request) {
      const { pathname } = new URL(request.url)
      if (request.method === 'GET' && pathname === DEVICE_PAGE_VERSION)
        return Promise.resolve(json({ version: serving.version, notice }))
      if (request.method !== 'POST' || pathname !== DEVICE_PAGE_VERSION_TOLD) return undefined
      notice = null
      return Promise.resolve(new Response(null, { status: 204 }))
    },
  }
}
