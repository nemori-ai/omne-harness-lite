import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startModelGateway, type GatewayRoute } from '../../src/lab/model-gateway/gateway.ts'
import {
  parseModelScript,
  providerUrlOf,
  scriptedAnswer,
} from '../../src/lab/model-gateway/script.ts'

const chat = (...texts: string[]) =>
  JSON.stringify({ model: 'openai/m', messages: texts.map(content => ({ role: 'user', content })) })
const asked = (rawBody: string, path = '/api/v1/chat/completions') => ({
  index: 0,
  body: rawBody,
  rawBody,
  path,
})
const SCRIPT = parseModelScript(
  JSON.stringify({
    steps: [{ when: {}, say: '好了。' }],
    provider: [{ has: ['Batch: examine/'] }, { has: ['裁决'], lacks: ['演练'] }],
  }),
)

describe('the requests a model script leaves to the provider', () => {
  it('names no provider for a request none of its rules fits, and for a script that has no such rules', () => {
    expect(providerUrlOf(SCRIPT, asked(chat('你好')))).toBeNull()
    expect(providerUrlOf(SCRIPT, asked(chat('裁决的演练')))).toBeNull()
    const plain = parseModelScript(JSON.stringify({ steps: [] }))
    expect(providerUrlOf(plain, asked(chat('Batch: examine/1/1/')))).toBeNull()
  })

  it('sends a fitting request where the release would have sent it: by the interface its body speaks', () => {
    const brief = 'Batch: examine/1/1/'
    expect(providerUrlOf(SCRIPT, asked(chat(brief)))).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
    const responses = JSON.stringify({ model: 'm', input: [{ role: 'user', content: brief }] })
    expect(providerUrlOf(SCRIPT, asked(responses))).toBe('https://openrouter.ai/api/v1/responses')
    const messages = JSON.stringify({ model: 'm', thinking: {}, messages: [{ content: brief }] })
    expect(providerUrlOf(SCRIPT, asked(messages))).toBe('https://openrouter.ai/api/v1/messages')
    const decision = JSON.stringify({ model: 'm', state: '裁决', questions: {} })
    expect(providerUrlOf(SCRIPT, asked(decision))).toBe('https://openrouter.ai/api/alpha/decisions')
    expect(providerUrlOf(SCRIPT, asked(chat(brief)), 'https://127.0.0.1:9')).toBe(
      'https://127.0.0.1:9/api/v1/chat/completions',
    )
  })
})

/** A provider that says 429 to everything and keeps what it was sent. */
async function provider() {
  const seen: { authorization: string | undefined; body: string }[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      seen.push({ authorization: request.headers.authorization, body })
      response.writeHead(429, { 'content-type': 'application/json' })
      response.end('{"error":"slow down"}')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return { seen, origin, close: () => new Promise(resolve => server.close(resolve)) }
}

describe('a gateway whose script passes a request on', () => {
  const closing: (() => Promise<unknown>)[] = []
  async function lab(route: GatewayRoute) {
    const gateway = await startModelGateway(request => scriptedAnswer(SCRIPT, request), route)
    gateway.trustInProcess()
    closing.push(() => gateway.close())
    return gateway
  }
  afterEach(async () => {
    for (const close of closing.splice(0)) await close()
  })

  it('sends the request as it came, authorization and body, and gives back what the provider answered; the next request is the script’s again', async () => {
    const upstream = await provider()
    closing.push(upstream.close)
    const gateway = await lab(request => providerUrlOf(SCRIPT, request, upstream.origin))
    const send = (body: string) =>
      fetch(gateway.url, {
        method: 'POST',
        headers: { authorization: 'Bearer key-1', 'content-type': 'application/json' },
        body,
      })
    const brief = chat('Batch: examine/1/1/', '查一下')
    const passed = await send(brief)
    expect([passed.status, passed.headers.get('content-type'), await passed.text()]).toEqual([
      429,
      'application/json',
      '{"error":"slow down"}',
    ])
    expect(upstream.seen).toEqual([{ authorization: 'Bearer key-1', body: brief }])
    const own = await send(chat('你好'))
    expect(await own.text()).toContain('好了。')
    expect(upstream.seen).toHaveLength(1)
  })

  it('answers 502 when the provider cannot be reached', async () => {
    const gateway = await lab(() => 'http://127.0.0.1:9/api/v1/x')
    const reply = await fetch(gateway.url, { method: 'POST', body: '{}' })
    expect(reply.status).toBe(502)
  })
})
