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
import { createRecovery } from './recovery.ts'
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

function recover(window: BrowserWindow): void {
  const ask = async <Choice extends string>(
    message: string,
    detail: string,
    choices: readonly (readonly [Choice, string])[],
  ): Promise<Choice> => {
    if (window.isDestroyed()) return choices.at(-1)![0]
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message,
      detail,
      buttons: choices.map(([, label]) => label),
      defaultId: 0,
      cancelId: choices.length - 1,
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
      askLoadFailed: () =>
        ask('页面没有加载出来', '重新加载会丢掉页面里还没保存的输入。', [
          ['reload', '重新加载'],
          ['close', '关闭'],
        ]),
      askUnresponsive: () =>
        ask('页面没有响应', '重新加载会丢掉页面里还没保存的输入。', [
          ['wait', '继续等待'],
          ['reload', '重新加载'],
          ['close', '关闭'],
        ]),
    },
    () =>
      /* wall-clock: operation-timing -- spaces automatic reloads apart; compared only with itself */ Date.now(),
  )
  const contents = window.webContents
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== LOAD_ABORTED) recovery.failed()
  })
  contents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') recovery.failed()
  })
  window.on('unresponsive', () => recovery.unresponsive())
  window.on('responsive', () => recovery.responsive())
}

export function openAppWindow(saved: WindowStateFile): BrowserWindow {
  const state = usableState(
    saved.load(),
    screen.getAllDisplays().map(display => display.workArea),
  )
  const window = new BrowserWindow(windowOptions(state))
  if (state?.maximized === true) window.maximize()
  harden(window.webContents)
  recover(window)

  const show = (): void => {
    if (!window.isDestroyed() && !window.isVisible()) window.show()
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
