export const APP_SCHEME = 'omne-app'
export const APP_HOST = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_URL = `${APP_ORIGIN}/`

// The app scheme's origin serializes as "null"; the forwarding layer needs a real one to compare
// `Origin` with. Nothing ever listens on it.
export const INTERNAL_ORIGIN = 'http://app.desktop'

export function toInternalUrl(appUrl: string): string | null {
  const url = new URL(appUrl)
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null
  return INTERNAL_ORIGIN + url.pathname + url.search
}
