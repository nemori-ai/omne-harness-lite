import { BrowserWindow, session } from 'electron'
import { serveAppProtocol } from './app-protocol.ts'
import { APP_HOST, APP_URL, INTERNAL_ORIGIN } from './app-url.ts'
import { COOKIE_JAR_ORIGIN, createCookieJar } from './cookie-jar.ts'
import type { Logger } from './log.ts'
import { watchMount } from './page-mount.ts'
import type { Mount } from './page-trial.ts'
import { startServerProcess, type ServerProcessOptions } from './utility-process.ts'
import { harden, windowOptions } from './window.ts'

type Options = Readonly<{
  pageRoot: string
  server: string
  utilityPath: string
  deadlineMs: number
  log: Logger
}>

let tried = 0

/** Starts a version of the page once out of sight: its own forwarding process, a window not shown, a session not kept. */
export async function tryCandidate(options: Options): Promise<Mount> {
  const { log } = options
  const candidate = session.fromPartition(`omne-candidate-${String((tried += 1))}`)
  const env: ServerProcessOptions['env'] = {
    OMNE_SERVER: options.server,
    OMNE_PAGE_ROOT: options.pageRoot,
  }
  const forwarding = startServerProcess({ utilityPath: options.utilityPath, env, log })
  serveAppProtocol(candidate, {
    upstream: forwarding.fetch,
    cookies: createCookieJar({
      store: candidate.cookies,
      hosts: [new URL(COOKIE_JAR_ORIGIN).hostname, new URL(INTERNAL_ORIGIN).hostname, APP_HOST],
      log,
    }),
    log,
  })
  const shown = windowOptions(undefined)
  const { partition: _kept, ...preferences } = shown.webPreferences ?? {}
  const window = new BrowserWindow({
    ...shown,
    show: false,
    webPreferences: { ...preferences, session: candidate },
  })
  harden(window.webContents)
  try {
    const mount = watchMount(window.webContents, options.deadlineMs)
    void window.loadURL(APP_URL).catch(() => {})
    return await mount
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await forwarding.shutdown().catch(() => {})
    await candidate.clearStorageData().catch(() => {})
  }
}
