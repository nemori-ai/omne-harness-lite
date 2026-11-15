import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BrowserWindow,
  protocol,
  type BrowserWindowConstructorOptions,
  type WebContents,
} from 'electron'
import { answerPageFile } from '../shared/page-files.ts'

export const APP_SCHEME = 'omne-app'
export const APP_URL = `${APP_SCHEME}://app/`

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

async function answerWithFile(pageRoot: string, requestUrl: string): Promise<Response> {
  const answer = await answerPageFile(new URL(requestUrl).pathname, segments =>
    readFile(join(pageRoot, ...segments)).then(
      content => new Uint8Array(content),
      () => undefined,
    ),
  )
  if (answer.status === 404) return new Response('not found', { status: 404 })
  return new Response(answer.body, { headers: answer.headers })
}

export function serveAppFiles(pageRoot: string): void {
  protocol.handle(APP_SCHEME, request => answerWithFile(pageRoot, request.url))
}

export function windowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 860,
    title: 'omne',
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  }
}

export function harden(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) event.preventDefault()
  })
  contents.on('will-attach-webview', event => event.preventDefault())
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  contents.session.setPermissionCheckHandler(() => false)
}

export function openAppWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow(windowOptions(preload))
  harden(window.webContents)
  void window.loadURL(APP_URL)
  return window
}
