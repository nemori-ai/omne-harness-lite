import { createHash } from 'node:crypto'
import {
  calendarTransportEvidenceSchema,
  instantSchema,
  type Instant,
} from '@omne-harness/calendar-contract'
import { z } from 'zod'
import {
  defaultCalendarSourceLimits,
  type CalendarSourceAdapterOptions,
  type CalendarSourceLimits,
  type CalendarSourceResponseEvidence,
  type CalendarSourceKnowledge,
} from './types.ts'

export const digest = (content: Uint8Array): string =>
  createHash('sha256').update(content).digest('hex')
export const utf8 = (content: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content)
export const encode = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value))
export const decodeJson = (content: Uint8Array): unknown => JSON.parse(utf8(content))
export const failureReason = (error: unknown): string =>
  error instanceof Error ? error.message : 'Source acquisition failed'

const limitsSchema = z.object({
  maxBodyBytes: z.number().int().positive(),
  maxBundleBytes: z.number().int().positive(),
  maxYears: z.number().int().min(1).max(64),
  maxPages: z.number().int().min(1).max(5),
  maxBodies: z.number().int().min(1).max(100),
  maxRedirects: z.number().int().min(0).max(3),
  timeoutMs: z.number().int().min(1).max(30_000),
})
export function sourceLimits(options: CalendarSourceAdapterOptions): CalendarSourceLimits {
  return limitsSchema.parse({ ...defaultCalendarSourceLimits, ...options.limits })
}
export interface AcquiredResponse extends CalendarSourceResponseEvidence {
  readonly method: 'GET' | 'HEAD'
  readonly knowledge: CalendarSourceKnowledge
}
function checkUrl(value: string, allowedOrigins: readonly string[]): URL {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !allowedOrigins.includes(url.origin)
  )
    throw new Error('Source URL is outside its fixed HTTPS origins')
  return url
}
function endpointMap(options: CalendarSourceAdapterOptions): Map<string, string> {
  const result = new Map<string, string>()
  for (const [origin, target] of Object.entries(options.testEndpoints?.origins ?? {})) {
    const url = new URL(target)
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error('Test endpoint must be an explicit loopback HTTP origin')
    result.set(origin, url.origin)
  }
  return result
}
function headersEvidence(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of ['content-type', 'content-length', 'etag', 'last-modified']) {
    const value = headers.get(key)
    if (value !== null) result[key] = value
  }
  return result
}
async function readBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw new Error('Source response has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > limit) throw new Error('Source body byte limit exceeded')
      chunks.push(next.value)
    }
    signal.throwIfAborted()
    if (!length) throw new Error('Source response is empty')
    return Buffer.concat(chunks, length)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
async function resolveKnowledge(input: {
  sourceId: string
  response: CalendarSourceResponseEvidence
  acquiredAt: Instant
  signal: AbortSignal
  options: CalendarSourceAdapterOptions
}): Promise<CalendarSourceKnowledge> {
  const resolved = await input.options.sourceKnowledgeResolver?.(input)
  input.signal.throwIfAborted()
  let knowledge = resolved
  if (!knowledge) {
    const header = input.response.headers['last-modified']
    const parsed = header ? new Date(header) : null
    if (!header || !parsed || !Number.isFinite(parsed.getTime()) || parsed.toUTCString() !== header)
      throw new Error('Source has no valid Last-Modified or versioned knowledge resolver')
    knowledge = {
      knowledgeAsOf: instantSchema.parse(parsed.toISOString()),
      reference: `${input.response.url}#last-modified=${encodeURIComponent(header)}`,
    }
  }
  const at = instantSchema.parse(knowledge.knowledgeAsOf)
  if (at > input.acquiredAt || !knowledge.reference.trim())
    throw new Error('Invalid source knowledge evidence')
  return { knowledgeAsOf: at, reference: knowledge.reference }
}
export function createSourceHttp(input: {
  sourceId: string
  acquiredAt: Instant
  allowedOrigins: readonly string[]
  timeoutMs: number
  options: CalendarSourceAdapterOptions
  signal: AbortSignal
}) {
  const limits = sourceLimits(input.options)
  const endpoints = endpointMap(input.options)
  const client = input.options.httpClient ?? fetch
  let total = 0
  const responses: AcquiredResponse[] = []
  async function request(
    url: string,
    method: 'GET' | 'HEAD',
    headers: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ) {
    let current = checkUrl(url, input.allowedOrigins)
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted()
      const mapped = endpoints.get(current.origin)
      const actual = mapped ? `${mapped}${current.pathname}${current.search}` : current.href
      const response = await client(actual, { method, headers, redirect: 'manual', signal })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        if (!location || redirects >= limits.maxRedirects)
          throw new Error('Source redirect limit exceeded or Location missing')
        const next = new URL(location, actual)
        const canonical =
          mapped && next.origin === mapped
            ? `${current.origin}${next.pathname}${next.search}`
            : next.href
        current = checkUrl(canonical, input.allowedOrigins)
        continue
      }
      return { response, actual }
    }
  }
  async function read(
    url: string,
    method: 'GET' | 'HEAD' = 'GET',
    headers: Readonly<Record<string, string>> = {},
  ): Promise<AcquiredResponse> {
    const signal = AbortSignal.any([
      input.signal,
      AbortSignal.timeout(Math.min(limits.timeoutMs, input.timeoutMs)),
    ])
    const { response, actual } = await request(url, method, headers, signal)
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error(`Source answered HTTP ${response.status}`)
    }
    const content =
      method === 'HEAD'
        ? new Uint8Array()
        : await readBody(
            response,
            Math.min(limits.maxBodyBytes, limits.maxBundleBytes - total),
            signal,
          )
    if (method === 'HEAD') await response.body?.cancel()
    total += content.byteLength
    const evidence = {
      url: actual,
      status: response.status,
      headers: headersEvidence(response.headers),
      content,
    }
    const knowledge = await resolveKnowledge({ ...input, response: evidence, signal })
    const acquired = { ...evidence, method, knowledge }
    responses.push(acquired)
    return acquired
  }
  return { read, responses, limits }
}
export type SourceHttp = ReturnType<typeof createSourceHttp>
export function bundleResponses(responses: readonly AcquiredResponse[]) {
  return responses.map(({ content, ...evidence }) => ({
    ...evidence,
    contentBase64: Buffer.from(content).toString('base64'),
  }))
}
export function responseMarker(responses: readonly AcquiredResponse[]): string {
  return digest(encode(responses.map(response => [response.url, digest(response.content)])))
}

export function transportEvidence(responses: readonly AcquiredResponse[]) {
  return responses.map(response => {
    const length = response.headers['content-length']
    if (length !== undefined && !/^\d+$/.test(length))
      throw new Error('Invalid Content-Length metadata')
    return calendarTransportEvidenceSchema.parse({
      url: response.url,
      method: response.method,
      status: response.status,
      etag: response.headers.etag ?? null,
      lastModified: response.headers['last-modified'] ?? null,
      contentLength: length === undefined ? null : Number(length),
      bodyHash: response.method === 'HEAD' ? null : digest(response.content),
      knowledgeBasis: response.knowledge.reference,
    })
  })
}
