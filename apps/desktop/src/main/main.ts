import { watch } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, session, type BrowserWindow } from 'electron'
import { DEFAULT_SERVER } from '../shared/server.ts'
import { serveAppProtocol } from './app-protocol.ts'
import { APP_HOST, INTERNAL_ORIGIN } from './app-url.ts'
import { COOKIE_JAR_ORIGIN, createCookieJar, flushForQuit } from './cookie-jar.ts'
import { createLogger } from './log.ts'
import { startServerProcess } from './utility-process.ts'
import type { UtilityState } from './recovery.ts'
import { APP_PARTITION, openAppWindow, registerAppScheme, type UtilityWatch } from './window.ts'
import { windowStateFile } from './window-state.ts'

const development = process.env['OMNE_DESKTOP_DEV'] === '1'
const log = createLogger()

function focus(window: BrowserWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

function reloadOnRebuild(pageRoot: string, current: () => BrowserWindow | undefined): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(pageRoot, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(() => current()?.webContents.reloadIgnoringCache(), 200)
  })
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

async function start(): Promise<void> {
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
  let window: BrowserWindow | undefined = openAppWindow(saved, utility)
  window.on('closed', () => {
    window = undefined
  })
  if (development) reloadOnRebuild(pageRoot, () => window)
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

// A development run keeps its own user data: its login cookie is not the installed app's.
if (development && !app.commandLine.hasSwitch('user-data-dir'))
  app.setPath('userData', `${app.getPath('userData')}-dev`)

app.enableSandbox()
registerAppScheme()

if (!app.requestSingleInstanceLock()) app.quit()
else
  start().catch((failure: unknown) => {
    process.stderr.write(`omne desktop failed to start: ${String(failure)}\n`)
    app.exit(1)
  })
