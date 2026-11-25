import { app, BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron'
import { APP_URL } from './app-url.ts'
import type { DeskWindow, DeviceFigure, DeviceFigureDeps } from './device-figure.ts'
import { harden, LOAD_ABORTED, windowOptions } from './window.ts'

const DESK_PAGE = `${APP_URL}desk.html`
const NOWHERE = { x: 0, y: 0, width: 0, height: 0 }

/** Background throttling stays on: the desk page tells it is shown from its own document's visibility. */
export function deskWindowOptions(): BrowserWindowConstructorOptions {
  return {
    show: false,
    type: 'panel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    // Another app is in front when the person presses the figure: that first press has to reach the page.
    acceptFirstMouse: true,
    webPreferences: { ...windowOptions(undefined).webPreferences },
  }
}

function openDeskWindow(gone: () => void): DeskWindow {
  const window = new BrowserWindow(deskWindowOptions())
  window.setAlwaysOnTop(true, 'status')
  // Without skipTransformProcessType the main window and the Dock icon flash.
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
  const contents = window.webContents
  harden(contents)
  let left = false
  const leave = () => {
    if (left) return
    left = true
    gone()
  }
  // The first navigation is the load below; any later one is the page reloading itself.
  let navigations = 0
  contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument && (navigations += 1) > 1) leave()
  })
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== LOAD_ABORTED) leave()
  })
  contents.on('render-process-gone', leave)
  window.on('unresponsive', leave)
  void window.loadURL(DESK_PAGE).catch(() => {})
  return window
}

const live = (window: BrowserWindow | undefined): window is BrowserWindow =>
  window !== undefined && !window.isDestroyed()

export function deviceFigureDeps(main: () => BrowserWindow | undefined): DeviceFigureDeps {
  return {
    leave: process.platform === 'darwin',
    open: openDeskWindow,
    main: {
      content: () => {
        const window = main()
        return live(window) ? window.getContentBounds() : NOWHERE
      },
      visible: () => {
        const window = main()
        return live(window) && window.isVisible() && !window.isMinimized()
      },
      front: () => {
        const window = main()
        if (!live(window)) return
        if (window.isMinimized()) window.restore()
        window.show()
        // The desk layer never activates the app, so another app is in front: raising has to take it.
        app.focus({ steal: true })
        window.focus()
      },
    },
    cursor: () => screen.getCursorScreenPoint(),
    screenAt: point => screen.getDisplayNearestPoint(point).bounds,
    every: (ms, tick) => {
      const timer = setInterval(tick, ms)
      return () => clearInterval(timer)
    },
  }
}

/** Tells the lease what happens to the main window: its page starting to load or going away, moving, closing. */
export function watchMainWindow(window: BrowserWindow, figure: DeviceFigure): void {
  const contents = window.webContents
  contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) figure.pageGone()
  })
  contents.on('render-process-gone', () => figure.pageGone())
  const moved = () => figure.moved()
  window.on('move', moved)
  window.on('resize', moved)
  window.on('show', moved)
  window.on('hide', moved)
  window.on('minimize', moved)
  window.on('restore', moved)
  window.once('closed', () => figure.closed())
}
