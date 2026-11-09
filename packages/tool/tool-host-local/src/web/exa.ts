// The Exa `/search` client: one POST with the key in `x-api-key`, the answer parsed at the boundary
// with zod, the HTTP status mapped to the closed `WebFailure` set. No retry: a request that was sent
// may have consumed credits, and a cancellation does not refund them.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SearchHit, WebFailure } from '@omne-harness/tool-definitions'
import { Agent, fetch as undiciFetch } from 'undici'
import { z } from 'zod'
import { classifyThrown, parseContentType, readCapped } from './body.ts'

export type WebSearchOptions = Readonly<{
  /** The Exa search endpoint, for example `https://api.exa.ai/search`. */
  endpoint: URL
  /** `lite` accepts only the request body written here; `auto` is the richer, costlier search. */
  type: 'lite' | 'auto'
  /** Asked of Exa per result and enforced here per excerpt, in characters (Exa may exceed it). */
  highlightChars: number
  /** Total duration of the call. */
  timeoutMs: number
}>

/** An Exa answer longer than this is not a search result page; it cannot be cut, so it is `too-large`. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const MIN_TIMER_MS = 1000

const resultSchema = z.looseObject({
  title: z.string().nullish(),
  url: z.string().min(1),
  publishedDate: z.string().nullish(),
  highlights: z.array(z.string()).nullish(),
})
const answerSchema = z.looseObject({ results: z.array(resultSchema) })

function excerptOf(highlights: readonly string[] | null | undefined, chars: number): string {
  const joined = (highlights ?? []).join(' ').replace(/\s+/gu, ' ').trim()
  const points = [...joined]
  return points.length <= chars ? joined : `${points.slice(0, chars).join('')}…`
}

function hitsOf(results: z.infer<typeof answerSchema>['results'], chars: number): SearchHit[] {
  return results.map(result => {
    const title = result.title?.trim()
    const publishedAt = result.publishedDate?.trim()
    return {
      title: title === undefined || title.length === 0 ? result.url : title,
      url: result.url,
      ...(publishedAt === undefined || publishedAt.length === 0 ? {} : { publishedAt }),
      excerpt: excerptOf(result.highlights, chars),
    }
  })
}

function statusFailure(status: number): WebFailure {
  switch (status) {
    case 401:
      return { kind: 'denied' }
    case 402:
      return { kind: 'quota-exhausted' }
    case 429:
      return { kind: 'rate-limited' }
    default:
      return { kind: 'upstream', status }
  }
}

export async function searchExa(
  input: Readonly<{ query: string; limit: number }>,
  key: string,
  options: WebSearchOptions,
  signal: AbortSignal,
): Promise<Outcome<readonly SearchHit[], WebFailure>> {
  const timer = Math.max(options.timeoutMs, MIN_TIMER_MS)
  const agent = new Agent({ connectTimeout: timer, headersTimeout: timer, bodyTimeout: timer })
  const total = AbortSignal.timeout(options.timeoutMs)
  const combined = AbortSignal.any([total, signal])
  try {
    const response = await undiciFetch(options.endpoint, {
      method: 'POST',
      dispatcher: agent,
      signal: combined,
      headers: {
        'x-api-key': key,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'omne-harness-web/0.0.0',
      },
      body: JSON.stringify({
        query: input.query,
        type: options.type,
        numResults: input.limit,
        contents: { highlights: { maxCharacters: options.highlightChars } },
      }),
    })
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel()
      return fail(statusFailure(response.status))
    }
    const body = await readCapped(response.body, MAX_RESPONSE_BYTES)
    if (body.truncated) return fail({ kind: 'too-large' })
    const { mediaType } = parseContentType(response.headers.get('content-type'))
    if (mediaType !== 'application/json')
      return fail({ kind: 'unavailable', diagnostic: `search provider answered ${mediaType}` })
    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.bytes))
    } catch {
      return fail({ kind: 'unavailable', diagnostic: 'search provider answered invalid JSON' })
    }
    const answer = answerSchema.safeParse(parsed)
    if (!answer.success)
      return fail({
        kind: 'unavailable',
        diagnostic: 'search provider answered an unexpected shape',
      })
    return succeed(hitsOf(answer.data.results, options.highlightChars))
  } catch (error) {
    return fail(classifyThrown(error, signal, total))
  } finally {
    await agent.destroy()
  }
}
