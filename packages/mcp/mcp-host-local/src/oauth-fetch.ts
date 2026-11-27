import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { OAuthAnswer, OAuthBody, OAuthFetch } from '@omne-harness/mcp-contract/provider'

/** Metadata, registration and token answers are small; a larger body is not read as JSON. */
const MAX_BODY_BYTES = 1024 * 1024

async function answerOf(response: Response): Promise<OAuthAnswer> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES)
    return { status: response.status, json: undefined }
  try {
    return { status: response.status, json: JSON.parse(new TextDecoder().decode(bytes)) as unknown }
  } catch {
    return { status: response.status, json: undefined }
  }
}

function bodyOf(body: OAuthBody): Readonly<{ type: string; text: string }> {
  return body.kind === 'form'
    ? {
        type: 'application/x-www-form-urlencoded',
        text: new URLSearchParams(body.fields).toString(),
      }
    : { type: 'application/json', text: JSON.stringify(body.value) }
}

/** Requests of OAuth over HTTP: redirects are answered, not followed; a request that gets no answer says so. */
export function createOAuthFetch(fetchOf: typeof fetch = fetch): OAuthFetch {
  async function send(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Outcome<OAuthAnswer, 'no-answer'>> {
    try {
      const response = await fetchOf(url, { ...init, redirect: 'manual', signal })
      return succeed(await answerOf(response))
    } catch {
      return fail('no-answer')
    }
  }
  return {
    get: (url, signal) =>
      send(url, { method: 'GET', headers: { accept: 'application/json' } }, signal),
    post(url, body, headers, signal) {
      const { type, text } = bodyOf(body)
      const sent = { ...headers, accept: 'application/json', 'content-type': type }
      return send(url, { method: 'POST', headers: sent, body: text }, signal)
    },
  }
}
