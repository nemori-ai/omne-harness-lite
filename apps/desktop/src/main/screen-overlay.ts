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
  let shown = new Map<string, BrowserWindow>()
  function overlay(page: URL, bounds: Rectangle, focused: boolean, gone: () => void) {
    const window = new BrowserWindow(overlayOptions(bounds))
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setBounds(bounds)
    const contents = window.webContents
    harden(contents)
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== LOAD_ABORTED) gone()
    })
    contents.on('render-process-gone', gone)
    window.once('closed', () => {
      if ([...shown.values()].includes(window)) gone()
    })
    window.once('ready-to-show', () => {
      window.showInactive()
      if (focused) window.focus()
    })
    void window.loadURL(page.href).catch(() => {})
    return window
  }
  return {
    open(monitors, capture, gone) {
      const pointer = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
      shown = new Map(
        monitors.map(monitor => {
          const display = displayOf(monitor)
          const page = new URL(OVERLAY_PAGE)
          page.searchParams.set('screen', monitor.id)
          page.searchParams.set('capture', String(capture))
          const focused = display.id === pointer
          return [monitor.id, overlay(page, display.bounds, focused, () => gone(monitor.id))]
        }),
      )
    },
    lock(inUse) {
      for (const [id, window] of shown)
        if (id !== inUse && !window.isDestroyed()) window.setIgnoreMouseEvents(true)
    },
    close() {
      const closing = shown
      shown = new Map()
      for (const window of closing.values()) if (!window.isDestroyed()) window.destroy()
    },
  }
}
