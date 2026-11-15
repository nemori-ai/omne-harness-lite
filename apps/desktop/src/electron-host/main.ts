import { fileURLToPath } from 'node:url'
import { app, ipcMain, type BrowserWindow, type WebContents } from 'electron'
import { accessProtocol } from '@omne-harness/public-contract'
import { httpServer, memoryCredentialStore, openLoginSession } from '../main-core/index.ts'
import { domainProtocols } from '../shared/protocols.ts'
import { DEFAULT_SERVER } from '../web-host/config.ts'
import { serveHostIpc, type HostPage } from './ipc-host.ts'
import { APP_URL, openAppWindow, registerAppScheme, serveAppFiles } from './window.ts'

function pageOf(contents: WebContents): HostPage {
  return {
    id: contents.id,
    send(channel, payload) {
      if (!contents.isDestroyed()) contents.send(channel, payload)
    },
    onGone(listener) {
      const gone = (): void => {
        contents.removeListener('destroyed', gone)
        contents.removeListener('render-process-gone', gone)
        contents.removeListener('did-navigate', gone)
        listener()
      }
      contents.once('destroyed', gone)
      contents.once('render-process-gone', gone)
      contents.once('did-navigate', gone)
    },
  }
}

function focus(window: BrowserWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

async function start(): Promise<void> {
  const session = await openLoginSession({
    connect: httpServer(process.env['OMNE_SERVER'] ?? DEFAULT_SERVER),
    store: memoryCredentialStore(),
    contracts: [accessProtocol, ...domainProtocols],
  })
  await app.whenReady()
  serveAppFiles(fileURLToPath(new URL('../page/', import.meta.url)))
  serveHostIpc({
    session,
    appUrl: APP_URL,
    ipc: {
      handle: (channel, handler) =>
        ipcMain.handle(channel, (event, ...args) =>
          handler({ frameUrl: event.senderFrame?.url, page: pageOf(event.sender) }, ...args),
        ),
    },
  })
  let window: BrowserWindow | undefined = openAppWindow(
    fileURLToPath(new URL('./preload.cjs', import.meta.url)),
  )
  window.on('closed', () => {
    window = undefined
  })
  app.on('second-instance', () => focus(window))
  app.on('window-all-closed', () => app.quit())
}

app.enableSandbox()
registerAppScheme()

if (!app.requestSingleInstanceLock()) app.quit()
else
  start().catch((failure: unknown) => {
    process.stderr.write(`omne desktop failed to start: ${String(failure)}\n`)
    app.exit(1)
  })
