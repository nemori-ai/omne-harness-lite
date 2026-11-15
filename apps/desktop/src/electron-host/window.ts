import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import {
  BrowserWindow,
  protocol,
  type BrowserWindowConstructorOptions,
  type WebContents,
} from 'electron'
import { CONTENT_SECURITY_POLICY } from '../shared/page-policy.ts'

export const APP_SCHEME = 'omne-app'
export const APP_URL = `${APP_SCHEME}://app/`

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

const notFound = (): Response => new Response('not found', { status: 404 })

async function answerWithFile(pageRoot: string, requestUrl: string): Promise<Response> {
  const { pathname } = new URL(requestUrl)
  let relative: string
  try {
    relative = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname))
  } catch {
    return notFound()
  }
  const root = pageRoot.endsWith(sep) ? pageRoot : pageRoot + sep
  const file = join(pageRoot, relative)
  if (!file.startsWith(root)) return notFound()
  let content: Buffer
  try {
    content = await readFile(file)
  } catch {
    return notFound()
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  return new Response(new Uint8Array(content), {
    headers: {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(type.startsWith('text/html')
        ? { 'content-security-policy': CONTENT_SECURITY_POLICY }
        : {}),
    },
  })
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
