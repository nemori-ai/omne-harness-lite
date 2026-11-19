import { APP_SCHEME } from './app-url.ts'

const MAX_URL_LENGTH = 512
const LOGGABLE_SCHEMES = new Set([`${APP_SCHEME}:`, 'http:', 'https:', 'file:'])

export function safeUrl(url: string, scope: 'origin-path' | 'path' = 'origin-path'): string {
  try {
    const parsed = new URL(url)
    const value = !LOGGABLE_SCHEMES.has(parsed.protocol)
      ? `(${parsed.protocol} URL)`
      : scope === 'path'
        ? parsed.pathname
        : `${parsed.protocol}//${parsed.host}${parsed.pathname}`
    return value.length > MAX_URL_LENGTH ? value.slice(0, MAX_URL_LENGTH - 1) + '…' : value
  } catch {
    return '(invalid URL)'
  }
}

export function redactLogUrls(text: string): string {
  return text.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, url => {
    const suffix = url.match(/[)\],.;}]+$/)?.[0] ?? ''
    return safeUrl(suffix ? url.slice(0, -suffix.length) : url) + suffix
  })
}
