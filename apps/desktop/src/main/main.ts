import { writeSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { macosRequestScreenAccess, screenBackendFor } from '@omne-harness/screen'
import {
  app,
  ipcMain,
  Menu,
  nativeTheme,
  safeStorage,
  session,
  shell,
  type BrowserWindow,
} from 'electron'
import { PAGE_VERSION_EVENT } from '../shared/page-version.ts'
import { DEFAULT_SERVER } from '../shared/server.ts'
import {
  BUILD_PROFILE_MESSAGE,
  COOKIE_KEY_CHECKED_MESSAGE,
  COOKIE_KEY_MISMATCH_MESSAGE,
  COOKIE_KEY_NO_PROBE_MESSAGE,
  COOKIE_KEY_NOT_STORED_MESSAGE,
  COOKIE_KEY_SKIPPED_MESSAGE,
  COOKIE_KEY_STORED_MESSAGE,
  COOKIE_KEY_UNKNOWN_MESSAGE,
  COOKIE_KEY_WRITER_SWITCH,
} from '../startup-signals.ts'
import { firstRoute, serveAppProtocol } from './app-protocol.ts'
import { APP_HOST, INTERNAL_ORIGIN } from './app-url.ts'
import { COOKIE_JAR_ORIGIN, createCookieJar, flushForQuit } from './cookie-jar.ts'
import {
  checkCookieKeyProbe,
  COOKIE_KEY_PROBE_TEXT,
  cookieKeyProbeLine,
  type CookieKeyOutcome,
  cookieKeyWriterCrashHandler,
  storeCookieKeyFirst,
} from './cookie-key.ts'
import { deviceFigureDeps, watchMainWindow } from './desk-window.ts'
import { deviceViewRoute } from './device-view.ts'
import { openLookWindow } from './look-window.ts'
import { developmentHost } from './dev-host.ts'
import { deviceFigure } from './device-figure.ts'
import { deviceScreenRoute } from './device-screen.ts'
import { createLogger, type Logger } from './log.ts'
import { tryCandidate } from './page-candidate.ts'
import { watchMount, watchStable } from './page-mount.ts'
import { PAGE_TRIAL, pageSettings } from './page-settings.ts'
import { installRequest, pageUpdates } from './page-update.ts'
import { pageVersions } from './page-versions.ts'
import type { UtilityState } from './recovery.ts'
import { refuseRemoteDebugging } from './remote-debugging.ts'
import { loadScreenLibrary, SCREEN_SETTINGS_URL } from './screen-host.ts'
import { screenOverlays } from './screen-overlay.ts'
import { startServerProcess } from './utility-process.ts'
import { installVisualIpc } from './visual-ipc.ts'
import { followVisualTheme, isTrustedSender, pageBackground } from './visual-look.ts'
import { createVisualMirror } from './visual-mirror.ts'
import {
  APP_PARTITION,
  openAppWindow,
  registerAppScheme,
  windowShade,
  type UtilityWatch,
} from './window.ts'
import { windowStateFile } from './window-state.ts'

if (OMNE_BUILD_PROFILE === 'release') refuseRemoteDebugging()

function focus(window: BrowserWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

function utilityWatch(retry: () => void): UtilityWatch & { set(state: UtilityState): void } {
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
    retry,
  }
}

function setAppMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        role: 'viewMenu',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          ...(OMNE_BUILD_PROFILE === 'release' ? [] : [{ role: 'toggleDevTools' as const }]),
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  )
}

async function main(log: Logger, cookieKey: CookieKeyOutcome): Promise<void> {
  await app.whenReady()
  setAppMenu()
  const builtinRoot = fileURLToPath(new URL('../page/', import.meta.url))
  const settings = pageSettings(process.env)
  const versions = pageVersions({
    userData: app.getPath('userData'),
    builtinRoot,
    publisherKeys: settings.publisherKeys,
  })
  const started = await versions.serving()
  let pageRoot = started.root
  const server = process.env['OMNE_SERVER'] ?? DEFAULT_SERVER
  const utilityPath = fileURLToPath(new URL('../utility/entry.js', import.meta.url))
  const appSession = session.fromPartition(APP_PARTITION)
  // One utility process for the app, not per window: it outlives windows, reloads and crashes.
  const utility = utilityWatch(() => void forwarding.restart().catch(() => {}))
  const forwarding = startServerProcess({
    onLifecycle: ({ state }) => utility.set(state),
    utilityPath,
    env: () => ({ OMNE_SERVER: server, OMNE_PAGE_ROOT: pageRoot }),
    log,
  })
  const contents = () => window?.webContents
  const updates = pageUpdates(
    {
      versions,
      async serve(serving) {
        pageRoot = serving.root
        await forwarding.restart()
        contents()?.reloadIgnoringCache()
      },
      nudge: () =>
        void contents()
          ?.executeJavaScript(`window.dispatchEvent(new Event('${PAGE_VERSION_EVENT}'))`, true)
          .catch(() => {}),
      candidate: root =>
        tryCandidate({ pageRoot: root, server, utilityPath, deadlineMs: settings.mountMs, log }),
      window: {
        watch: async () => {
          const now = contents()
          return now === undefined ? 'closed' : watchMount(now, settings.mountMs)
        },
        stable: async () => {
          const now = contents()
          return now !== undefined && (await watchStable(now, settings.stableMs))
        },
        reload: () => contents()?.reloadIgnoringCache(),
        after: ms => delay(ms),
      },
      config: PAGE_TRIAL,
      log,
    },
    started,
  )
  const figure = deviceFigure(deviceFigureDeps(() => window))
  serveAppProtocol(appSession, {
    upstream: forwarding.fetch,
    cookies: createCookieJar({
      store: appSession.cookies,
      hosts: [new URL(COOKIE_JAR_ORIGIN).hostname, new URL(INTERNAL_ORIGIN).hostname, APP_HOST],
      log,
    }),
    log,
    local: firstRoute([
      updates.route,
      figure.route,
      deviceViewRoute({ open: openLookWindow, deadlineMs: settings.mountMs }),
      deviceScreenRoute({
        backend: () =>
          screenBackendFor(process.platform, { load: () => loadScreenLibrary(app.isPackaged) }),
        window: windowShade(() => window),
        overlays: screenOverlays(),
        requestAccess: process.platform === 'darwin' ? () => macosRequestScreenAccess() : null,
        openSettings:
          process.platform === 'darwin' ? () => shell.openExternal(SCREEN_SETTINGS_URL) : null,
        now: Date.now,
      }),
    ]),
  })
  void forwarding.ready().catch(() => {})

  let window: BrowserWindow | undefined
  const visual = createVisualMirror(app.getPath('userData'), { log })
  const stopLook = followVisualTheme(visual, nativeTheme, () => (window ? [window] : []))
  installVisualIpc(ipcMain, visual, event => isTrustedSender(event, window), log)
  const saved = windowStateFile(join(app.getPath('userData'), 'window-state.json'))
  window = openAppWindow(saved, utility, log, updates.onTrial, {
    preload: fileURLToPath(new URL('../preload/preload.cjs', import.meta.url)),
    background: pageBackground(visual.theme(), nativeTheme.shouldUseDarkColors),
  })
  updates.resume()
  const install = (argv: readonly string[]): void => {
    const directory = installRequest(argv)
    if (directory !== undefined) void updates.install(directory)
  }
  install(process.argv)
  watchMainWindow(window, figure)
  checkCookieKey(log, cookieKey)
  window.on('closed', () => {
    window = undefined
  })
  developmentHost?.watchPage(builtinRoot, () => window?.webContents.reloadIgnoringCache())
  app.on('second-instance', (_event, argv) => {
    install(argv)
    focus(window)
  })
  app.on('window-all-closed', () => app.quit())

  let quitting = false
  app.on('before-quit', event => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    visual.retryPending()
    stopLook()
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
  const cookieKey: CookieKeyOutcome =
    OMNE_BUILD_PROFILE === 'dev'
      ? { kind: 'none' }
      : storeCookieKeyFirst({
          platform: process.platform,
          userData: app.getPath('userData'),
          execPath: process.execPath,
          appPath: process.defaultApp ? app.getAppPath() : undefined,
          appVersion: app.getVersion(),
        })
  logCookieKey(log, cookieKey)
  app.enableSandbox()
  registerAppScheme()
  main(log, cookieKey).catch((failure: unknown) => {
    log.error({ err: failure }, 'startup failed')
    app.exit(1)
  })
}

/** What an unstored key costs: only a packaged app encrypts its cookies. */
const unstoredKeyRisk = (): string =>
  app.isPackaged
    ? "a crash in this launch's first ~10 s loses its persistent cookies"
    : 'this unpackaged launch does not encrypt its cookies, so they are not at risk'

function logCookieKey(log: Logger, cookieKey: CookieKeyOutcome): void {
  if (cookieKey.kind === 'skipped')
    log.warn({ failedAt: cookieKey.failedAt, risk: unstoredKeyRisk() }, COOKIE_KEY_SKIPPED_MESSAGE)
  if (cookieKey.kind !== 'ran') return
  const { ms, status, error, readError } = cookieKey
  if (cookieKey.key === 'stored') log.info({ ms }, COOKIE_KEY_STORED_MESSAGE)
  else if (cookieKey.key === 'missing')
    log.warn({ ms, status, error, risk: unstoredKeyRisk() }, COOKIE_KEY_NOT_STORED_MESSAGE)
  else log.warn({ ms, status, error, reason: readError }, COOKIE_KEY_UNKNOWN_MESSAGE)
}

/** Once the window is on its way: whether this launch runs on the key its writer stored. */
function checkCookieKey(log: Logger, cookieKey: CookieKeyOutcome): void {
  if (cookieKey.kind !== 'ran' || cookieKey.key !== 'stored') return
  if (cookieKey.probe === undefined) return void log.warn({}, COOKIE_KEY_NO_PROBE_MESSAGE)
  const checked = checkCookieKeyProbe(cookieKey.probe, sealed => safeStorage.decryptString(sealed))
  if (checked.ok) log.info({}, COOKIE_KEY_CHECKED_MESSAGE)
  else log.error({ reason: checked.reason, risk: unstoredKeyRisk() }, COOKIE_KEY_MISMATCH_MESSAGE)
}

/** The copy: no log, no lock, no window; Chromium makes the key, the clean quit writes it. */
function runCookieKeyWriter(): void {
  const crash = cookieKeyWriterCrashHandler(code => process.exit(code))
  process.on('uncaughtException', crash)
  process.on('unhandledRejection', crash)
  app.disableHardwareAcceleration()
  void app.whenReady().then(() => {
    try {
      if (safeStorage.isEncryptionAvailable())
        writeSync(1, cookieKeyProbeLine(safeStorage.encryptString(COOKIE_KEY_PROBE_TEXT)))
    } catch {}
    app.quit()
  })
}

const keyWriter =
  OMNE_BUILD_PROFILE !== 'dev' &&
  process.platform === 'win32' &&
  app.commandLine.hasSwitch(COOKIE_KEY_WRITER_SWITCH)
if (keyWriter) runCookieKeyWriter()
else start()
