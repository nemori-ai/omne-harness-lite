import type { Monitor } from '@omne-harness/screen'
import {
  BrowserWindow,
  screen,
  type BrowserWindowConstructorOptions,
  type Display,
  type Rectangle,
} from 'electron'
import { APP_URL } from './app-url.ts'
import type { DeviceScreenDeps } from './device-screen.ts'
import { harden, LOAD_ABORTED, windowOptions } from './window.ts'

const OVERLAY_PAGE = `${APP_URL}shot.html`

function overlayOptions(bounds: Rectangle): BrowserWindowConstructorOptions {
  return {
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    enableLargerThanScreen: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: { ...windowOptions(undefined).webPreferences },
  }
}

const displayOf = ({ origin }: Monitor): Display =>
  screen.getDisplayNearestPoint({ x: origin.x + 1, y: origin.y + 1 })

/** One borderless window over each screen, above the menu bar and the Dock, showing the page a screenshot is picked on. */
export function screenOverlays(): DeviceScreenDeps['overlays'] {
  let shown: BrowserWindow[] = []
  function overlay(id: string, bounds: Rectangle, focused: boolean, cancel: () => void) {
    const window = new BrowserWindow(overlayOptions(bounds))
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setBounds(bounds)
    const contents = window.webContents
    harden(contents)
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== LOAD_ABORTED) cancel()
    })
    contents.on('render-process-gone', cancel)
    window.once('closed', () => {
      if (shown.includes(window)) cancel()
    })
    window.once('ready-to-show', () => {
      window.showInactive()
      if (focused) window.focus()
    })
    const url = `${OVERLAY_PAGE}?screen=${encodeURIComponent(id)}`
    void window.loadURL(url).catch(() => {})
    return window
  }
  return {
    open(monitors, cancel) {
      const pointer = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
      shown = monitors.map(monitor => {
        const display = displayOf(monitor)
        return overlay(monitor.id, display.bounds, display.id === pointer, cancel)
      })
    },
    close() {
      const closing = shown
      shown = []
      for (const window of closing) if (!window.isDestroyed()) window.destroy()
    },
  }
}
