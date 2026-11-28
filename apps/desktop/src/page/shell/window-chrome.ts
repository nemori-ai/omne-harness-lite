/** The app's own macOS window, read from the user agent; a browser tab reserves no room for window buttons. */
export function isMacElectron(userAgent: string): boolean {
  return userAgent.includes('Electron/') && userAgent.includes('Macintosh')
}

export const WINDOW_CHROME_ATTRIBUTE = 'data-window-chrome'

/** Marks the document with the window chrome it is in; the inset `--omne-window-inset` keys off the mark. */
export function markWindowChrome(element: Element, userAgent: string): void {
  if (isMacElectron(userAgent)) element.setAttribute(WINDOW_CHROME_ATTRIBUTE, 'mac-inset')
  else element.removeAttribute(WINDOW_CHROME_ATTRIBUTE)
}
