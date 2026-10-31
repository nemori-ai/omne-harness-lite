// @module-tag slow — makes one real HTTPS request to OpenRouter through the environment's proxy.
// It runs only when OMNE_LIVE_TESTS=1 and skips at run time otherwise: a `skipIf` would make the
// slow tier's pre-parse drop the whole file, even with the switch set.
import type { JsonLimits } from '@omne-harness/json-text'
import { expect, it } from 'vitest'
import { readProtocolFrames } from '../../src/frames.ts'
import { startExchange } from '../../src/http.ts'
import { openNetwork, type ProxyConfig } from '../../src/network.ts'
import { readSseEvents } from '../../src/sse.ts'
import { claimed, held, started } from '../support/exchange.ts'

const ENDPOINT = new URL('https://openrouter.ai/api/v1/chat/completions')
/** A small, cheap model and an 8-token answer: one run costs far less than a cent. */
const MODEL = 'openai/gpt-4o-mini'

const JSON_LIMITS: JsonLimits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 1_024,
  maxMembers: 256,
  maxStringLength: 16_384,
  maxNumberLength: 64,
}

/**
 * The test boundary maps the environment to the package's proxy configuration; the package itself
 * never reads `process.env`. With the switch set, a missing proxy is a failure, not a skip.
 */
function proxyFromEnvironment(): ProxyConfig {
  const url = process.env.HTTPS_PROXY
  if (url === undefined || url === '')
    throw new Error('OMNE_LIVE_TESTS=1 requires HTTPS_PROXY: the credential is added by the proxy')
  const bypass = (process.env.NO_PROXY ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry !== '')
  return { url, bypass }
}

it('one streamed chat completion through the proxy is a 200 whose SSE frames reach the end-marker', async ctx => {
  if (process.env.OMNE_LIVE_TESTS !== '1') ctx.skip()
  const resources = openNetwork({
    maxConnections: 1,
    idleConnectionTimeoutMs: 60_000,
    proxy: proxyFromEnvironment(),
  })
  try {
    const body = new TextEncoder().encode(
      JSON.stringify({
        model: MODEL,
        stream: true,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Say hello.' }],
      }),
    )
    const exchange = started(
      startExchange(
        resources,
        {
          url: ENDPOINT,
          // A placeholder: the proxy replaces it with the real credential.
          headers: { authorization: 'Bearer placeholder', 'content-type': 'application/json' },
          body,
          reservation: await held(resources),
          connectTimeoutMs: 30_000,
          maxErrorBodyBytes: 4_096,
        },
        new AbortController().signal,
      ),
    )
    const result = await exchange.result
    // Only the kind and the status: headers and bodies stay out of the test output.
    expect(result.kind === 'ok' || result.kind === 'http-error' ? result.status : result).toBe(200)
    const kinds: string[] = []
    for await (const frame of readProtocolFrames(readSseEvents(claimed(result), 65_536), {
      endMarker: '[DONE]',
      json: JSON_LIMITS,
    }))
      kinds.push('ok' in frame ? frame.ok.kind : frame.failure)
    expect(kinds.at(-1)).toBe('end-marker')
    expect(kinds.filter(kind => kind !== 'data' && kind !== 'end-marker')).toEqual([])
    await exchange.stopped
  } finally {
    await resources.close()
  }
  expect(resources.inFlight.size).toBe(0)
})
