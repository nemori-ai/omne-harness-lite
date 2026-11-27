import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { APP_URL } from './app-url.ts'
import type { LookWindow } from './device-view.ts'
import { harden, windowOptions } from './window.ts'

/** Never shown and never focused, out of the task bar and the window switcher. It renders offscreen: a hidden window hands back a frame it painted before. */
export function lookWindowOptions(width: number, height: number): BrowserWindowConstructorOptions {
  return {
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      ...windowOptions(undefined).webPreferences,
      offscreen: true,
      backgroundThrottling: false,
    },
  }
}

/** A window in the session the application window uses, so it carries the same login; no preload, so it has no way to the visual mirror. */
export function openLookWindow(width: number, height: number): LookWindow {
  const window = new BrowserWindow(lookWindowOptions(width, height))
  const contents = window.webContents
  harden(contents)
  return {
    contents,
    load: query => void window.loadURL(`${APP_URL}${query}`).catch(() => {}),
    async capture(wide, high) {
      const image = (await contents.capturePage()).resize({
        width: wide,
        height: high,
        quality: 'best',
      })
      const { width: drawnWidth, height: drawnHeight } = image.getSize()
      return { png: new Uint8Array(image.toPNG()), width: drawnWidth, height: drawnHeight }
    },
    close: () => {
      if (!window.isDestroyed()) window.destroy()
    },
  }
}
