import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, session, type BrowserWindow } from 'electron'
import { DEFAULT_SERVER } from '../shared/server.ts'
import { BUILD_PROFILE_MESSAGE } from '../startup-signals.ts'
import { serveAppProtocol } from './app-protocol.ts'
import { APP_HOST, INTERNAL_ORIGIN } from './app-url.ts'
import { COOKIE_JAR_ORIGIN, createCookieJar, flushForQuit } from './cookie-jar.ts'
import { developmentHost } from './dev-host.ts'
import { createLogger, type Logger } from './log.ts'
import type { UtilityState } from './recovery.ts'
import { refuseRemoteDebugging } from './remote-debugging.ts'
import { startServerProcess } from './utility-process.ts'
import { APP_PARTITION, openAppWindow, registerAppScheme, type UtilityWatch } from './window.ts'
import { windowStateFile } from './window-state.ts'

if (OMNE_BUILD_PROFILE === 'release') refuseRemoteDebugging()

function focus(window: BrowserWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

function utilityWatch(): UtilityWatch & { set(state: UtilityState): void } {
  let current: UtilityState = 'starting'
  const listeners = new Set<(state: UtilityState) => void>()
  return {
    current: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    set(state) {
      current = state
      for (const listener of listeners) listener(state)
    },
  }
}

async function main(log: Logger): Promise<void> {
  await app.whenReady()
  const pageRoot = fileURLToPath(new URL('../page/', import.meta.url))
  const appSession = session.fromPartition(APP_PARTITION)
  // One utility process for the app, not per window: it outlives windows, reloads and crashes.
  const utility = utilityWatch()
  const forwarding = startServerProcess({
    onLifecycle: ({ state }) => utility.set(state),
    utilityPath: fileURLToPath(new URL('../utility/entry.js', import.meta.url)),
    env: { OMNE_SERVER: process.env['OMNE_SERVER'] ?? DEFAULT_SERVER, OMNE_PAGE_ROOT: pageRoot },
    log,
  })
  serveAppProtocol(appSession, {
    upstream: forwarding.fetch,
    cookies: createCookieJar({
      store: appSession.cookies,
      hosts: [new URL(COOKIE_JAR_ORIGIN).hostname, new URL(INTERNAL_ORIGIN).hostname, APP_HOST],
      log,
    }),
    log,
  })
  void forwarding.ready().catch(() => {})

  const saved = windowStateFile(join(app.getPath('userData'), 'window-state.json'))
  let window: BrowserWindow | undefined = openAppWindow(saved, utility, log)
  window.on('closed', () => {
    window = undefined
  })
  developmentHost?.watchPage(pageRoot, () => window?.webContents.reloadIgnoringCache())
  app.on('second-instance', () => focus(window))
  app.on('window-all-closed', () => app.quit())

  let quitting = false
  app.on('before-quit', event => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    void Promise.allSettled([forwarding.shutdown(), flushForQuit(appSession.cookies, log)]).finally(
      () => app.quit(),
    )
  })
}

function start(): void {
  const log = createLogger()
  // Electron shows a blocking dialog for an uncaught main-process error; the app logs and goes on.
  process.on('uncaughtException', err =>
    log.error({ err }, 'uncaught exception in the main process'),
  )
  process.on('unhandledRejection', err =>
    log.error({ err }, 'unhandled rejection in the main process'),
  )
  log.info({ buildProfile: OMNE_BUILD_PROFILE }, BUILD_PROFILE_MESSAGE)
  if (OMNE_BUILD_PROFILE !== 'release') globalThis.desktopBuildProfile = OMNE_BUILD_PROFILE

  // From appData: asking for the default userData creates the installed app's directory.
  if (developmentHost !== undefined && !app.commandLine.hasSwitch('user-data-dir'))
    app.setPath(
      'userData',
      join(app.getPath('appData'), `${app.getName()}-${developmentHost.userDataSuffix}`),
    )
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.enableSandbox()
  registerAppScheme()
  main(log).catch((failure: unknown) => {
    log.error({ err: failure }, 'startup failed')
    app.exit(1)
  })
}

start()
