import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, NativeTheme } from 'electron'
import type { VisualPreferences } from '../shared/visual-record.ts'
import { APP_HOST, APP_SCHEME } from './app-url.ts'
import type { VisualMirror } from './visual-mirror.ts'

/** `--kami-page` in tokens.css, the page's own background, light and dark; a test keeps them equal. */
export const PAGE_BACKGROUND = { light: '#f5f4ed', dark: '#1c1c19' } as const

export function themeSource(theme: VisualPreferences['theme']): NativeTheme['themeSource'] {
  return theme === 'system' ? 'system' : theme
}

export function pageBackground(theme: VisualPreferences['theme'], systemDark: boolean): string {
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  return dark ? PAGE_BACKGROUND.dark : PAGE_BACKGROUND.light
}

/** Only the window's current main frame, on a page of the app, talks to the mirror. */
export function isTrustedSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  window: BrowserWindow | undefined,
): boolean {
  const frame = event.senderFrame
  if (
    window === undefined ||
    window.isDestroyed() ||
    !frame ||
    event.sender !== window.webContents ||
    frame !== window.webContents.mainFrame
  )
    return false
  try {
    const url = new URL(frame.url)
    return url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST
  } catch {
    return false
  }
}

/** The native look follows the mirror's theme: `themeSource` now and on each change, and each window's
 background, also when the system turns while the theme follows it. */
export function followVisualTheme(
  mirror: Pick<VisualMirror, 'theme' | 'onThemeChange'>,
  theme: Pick<NativeTheme, 'themeSource' | 'shouldUseDarkColors' | 'on' | 'off'>,
  windows: () => readonly BrowserWindow[],
): () => void {
  const paint = (): void => {
    const background = pageBackground(mirror.theme(), theme.shouldUseDarkColors)
    for (const window of windows()) if (!window.isDestroyed()) window.setBackgroundColor(background)
  }
  const apply = (): void => {
    theme.themeSource = themeSource(mirror.theme())
    paint()
  }
  apply()
  const release = mirror.onThemeChange(apply)
  theme.on('updated', paint)
  return () => {
    release()
    theme.off('updated', paint)
  }
}
