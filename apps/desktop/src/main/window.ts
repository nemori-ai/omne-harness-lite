import {
  BrowserWindow,
  dialog,
  protocol,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
  type WebContents,
} from 'electron'
import { APP_SCHEME, APP_URL } from './app-url.ts'
import { externalTarget } from './external-links.ts'
import { MAIN_WINDOW_READY_MESSAGE } from '../startup-signals.ts'
import type { Logger } from './log.ts'
import { createReadiness } from './readiness.ts'
import { createRecovery, type UtilityState } from './recovery.ts'
import {
  DEFAULT_SIZE,
  MIN_SIZE,
  usableState,
  type WindowState,
  type WindowStateFile,
} from './window-state.ts'

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ])
}

const LOAD_ABORTED = -3

const SHOW_FALLBACK_MS = 1_000

/** The app's own persistent session: the cookie jar and the app protocol live on it. */
export const APP_PARTITION = 'persist:omne'

export function windowOptions(state: WindowState | undefined): BrowserWindowConstructorOptions {
  return {
    ...(state?.bounds ?? DEFAULT_SIZE),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'omne',
    show: false,
    webPreferences: {
      partition: APP_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      ...(OMNE_BUILD_PROFILE === 'release' ? { devTools: false } : {}),
    },
  }
}

function openOutside(url: string): void {
  const target = externalTarget(url)
  if (target !== undefined) void shell.openExternal(target).catch(() => {})
}

export function harden(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_URL)) return
    event.preventDefault()
    openOutside(url)
  })
  contents.on('will-attach-webview', event => event.preventDefault())
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  contents.session.setPermissionCheckHandler(() => false)
}

/** The utility process's state now, and its changes until the returned function is called. */
export type UtilityWatch = Readonly<{
  current(): UtilityState
  subscribe(listener: (state: UtilityState) => void): () => void
}>

function recover(window: BrowserWindow, utility: UtilityWatch, log: Logger): void {
  const ask = async <Choice extends string>(
    message: string,
    detail: string,
    choices: readonly (readonly [Choice, string])[],
    signal: AbortSignal,
  ): Promise<Choice> => {
    if (window.isDestroyed()) return choices.at(-1)![0]
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message,
      detail,
      buttons: choices.map(([, label]) => label),
      defaultId: 0,
      cancelId: choices.length - 1,
      signal,
    })
    return choices[response]![0]
  }
  const recovery = createRecovery(
    {
      reload: () => {
        if (!window.isDestroyed()) void window.loadURL(APP_URL).catch(() => {})
      },
      close: () => {
        if (!window.isDestroyed()) window.destroy()
      },
      askLoadFailed: signal =>
        ask(
          '页面没有加载出来',
          '重新加载会丢掉页面里还没保存的输入。',
          [
            ['reload', '重新加载'],
            ['close', '关闭'],
          ],
          signal,
        ),
      askUnresponsive: signal =>
        ask(
          '页面没有响应',
          '重新加载会丢掉页面里还没保存的输入。',
          [
            ['wait', '继续等待'],
            ['reload', '重新加载'],
            ['close', '关闭'],
          ],
          signal,
        ),
    },
    () =>
      /* wall-clock: operation-timing -- spaces automatic reloads apart; compared only with itself */ Date.now(),
    utility.current(),
  )
  window.once(
    'closed',
    utility.subscribe(state => recovery.utility(state)),
  )
  const contents = window.webContents
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== LOAD_ABORTED) recovery.failed()
  })
  // A renderer gone mid-close can neither finish nor veto it: reloading it would hold the quit forever.
  let closing = false
  window.on('close', event => queueMicrotask(() => (closing = !event.defaultPrevented)))
  contents.on('will-prevent-unload', () => (closing = false))
  contents.on('render-process-gone', (_event, details) => {
    if (closing && !window.isDestroyed()) {
      log.warn(
        { reason: details.reason },
        'renderer gone while its window was closing; destroying it',
      )
      window.destroy()
    } else if (details.reason !== 'clean-exit') recovery.failed()
  })
  window.on('unresponsive', () => {
    log.warn({}, 'window unresponsive')
    recovery.unresponsive()
  })
  window.on('responsive', () => {
    log.info({}, 'window responsive again')
    recovery.responsive()
  })
}

function reportReady(window: BrowserWindow, log: Logger): (shown: boolean) => void {
  const readiness = createReadiness(() => log.info({}, MAIN_WINDOW_READY_MESSAGE))
  const contents = window.webContents
  contents.on('did-navigate', (_event, _url, status) => readiness.navigated(status))
  contents.on('did-finish-load', () => readiness.finished())
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== LOAD_ABORTED) readiness.failed()
  })
  window.on('show', () => readiness.shown(true))
  return shown => readiness.shown(shown)
}

export function openAppWindow(
  saved: WindowStateFile,
  utility: UtilityWatch,
  log: Logger,
): BrowserWindow {
  const state = usableState(
    saved.load(),
    screen.getAllDisplays().map(display => display.workArea),
  )
  const window = new BrowserWindow(windowOptions(state))
  // Before maximize(), which shows a hidden window: its `show` must count.
  const afterShown = reportReady(window, log)
  if (state?.maximized === true) window.maximize()
  harden(window.webContents)
  recover(window, utility, log)

  // macOS sends no `show` while the screen is locked: a window just shown counts if it says visible.
  const show = (): void => {
    if (window.isDestroyed() || window.isVisible()) return
    window.show()
    afterShown(window.isVisible())
  }
  const fallback = setTimeout(show, SHOW_FALLBACK_MS)
  window.once('ready-to-show', show)
  window.once('closed', () => clearTimeout(fallback))
  window.on('close', () =>
    saved.save({ bounds: window.getNormalBounds(), maximized: window.isMaximized() }),
  )

  void window.loadURL(APP_URL).catch(() => {})
  return window
}
