// The local fetch of one page (I-10): GET only, no cookies, no credentials, no scripts. The redirect
// loop is written here so that every hop is checked and counted exactly (undici's redirect
// interceptor is off by one); the total duration is one signal over every hop and the body read; the
// body is counted after decompression and cut at the cap instead of refused.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { FetchedPage, WebFailure } from '@omne-harness/tool-definitions'
import { Agent, fetch as undiciFetch } from 'undici'
import { classifyThrown, decodeText, parseContentType, readCapped } from './body.ts'
import { htmlToMarkdown } from './markdown.ts'

export type WebFetchOptions = Readonly<{
  /** Redirects followed after the first request; the next one is `redirect-limit`. */
  maxRedirects: number
  /** Total duration of the call over every hop and the body read. */
  timeoutMs: number
  /** Decompressed body bytes kept; a longer body is cut and marked `truncated`. */
  maxBodyBytes: number
}>

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml'])
const TEXT_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-ndjson',
])
const STRUCTURED_SUFFIX = /^application\/[\w.+-]+\+(json|xml)$/u
/** undici needs about a second of resolution for its header and body timers. */
const MIN_TIMER_MS = 1000
const HEADERS = Object.freeze({
  accept:
    'text/markdown, text/html, application/xhtml+xml, text/plain;q=0.9, application/json;q=0.8, application/xml;q=0.8, */*;q=0.1',
  'user-agent': 'omne-harness-web/0.0.0',
})

const isTextual = (mediaType: string): boolean =>
  mediaType.startsWith('text/') ||
  HTML_TYPES.has(mediaType) ||
  TEXT_TYPES.has(mediaType) ||
  STRUCTURED_SUFFIX.test(mediaType)

/** An absolute http or https URL without user information; the fragment is dropped. */
function target(value: string): Outcome<URL, WebFailure> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail({ kind: 'invalid-url' })
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== ''
  )
    return fail({ kind: 'invalid-url' })
  url.hash = ''
  return succeed(url)
}

export async function fetchPage(
  input: Readonly<{ url: string }>,
  options: WebFetchOptions,
  signal: AbortSignal,
): Promise<Outcome<FetchedPage, WebFailure>> {
  const first = target(input.url)
  if ('failure' in first) return first
  const timer = Math.max(options.timeoutMs, MIN_TIMER_MS)
  const agent = new Agent({ connectTimeout: timer, headersTimeout: timer, bodyTimeout: timer })
  const total = AbortSignal.timeout(options.timeoutMs)
  const combined = AbortSignal.any([total, signal])
  try {
    let current = first.ok
    for (let hops = 0; ; hops += 1) {
      const response = await undiciFetch(current, {
        method: 'GET',
        redirect: 'manual',
        dispatcher: agent,
        signal: combined,
        headers: HEADERS,
      })
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (location === null) return fail({ kind: 'upstream', status: response.status })
        if (hops >= options.maxRedirects) return fail({ kind: 'redirect-limit' })
        let resolved: string
        try {
          resolved = new URL(location, current).href
        } catch {
          return fail({ kind: 'invalid-url' })
        }
        const next = target(resolved)
        if ('failure' in next) return next
        current = next.ok
        continue
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel()
        return fail({ kind: 'upstream', status: response.status })
      }
      const header = response.headers.get('content-type')
      const contentType = parseContentType(header)
      if (!isTextual(contentType.mediaType)) {
        await response.body?.cancel()
        return fail({ kind: 'not-text', mediaType: contentType.mediaType })
      }
      const body = await readCapped(response.body, options.maxBodyBytes)
      const text = decodeText(body, contentType, header ?? contentType.mediaType)
      if ('failure' in text) return text
      const markdown = HTML_TYPES.has(contentType.mediaType)
        ? htmlToMarkdown(text.ok).markdown
        : text.ok
      return succeed({
        finalUrl: current.href,
        mediaType: contentType.mediaType,
        markdown,
        truncated: body.truncated,
      })
    }
  } catch (error) {
    return fail(classifyThrown(error, signal, total))
  } finally {
    await agent.destroy()
  }
}
