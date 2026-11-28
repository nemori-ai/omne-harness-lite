import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import { createOAuthFetch } from '@omne-harness/mcp-host-local'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

type Seen = { method?: string; type?: string; authorization?: string; body: string }

async function serve(
  answer: (request: IncomingMessage, body: string) => [number, string, Record<string, string>?],
) {
  const seen: Seen[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => (body += String(chunk)))
    request.on('end', () => {
      seen.push({
        ...(request.method === undefined ? {} : { method: request.method }),
        ...(request.headers['content-type'] === undefined
          ? {}
          : { type: request.headers['content-type'] }),
        ...(request.headers.authorization === undefined
          ? {}
          : { authorization: request.headers.authorization }),
        body,
      })
      const [status, text, headers] = answer(request, body)
      response.writeHead(status, headers ?? { 'content-type': 'application/json' })
      response.end(text)
    })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { base: `http://127.0.0.1:${String(port)}`, seen }
}

const never = new AbortController().signal

it('reads a JSON answer with its status; a body that is not JSON reads as no JSON', async () => {
  const peer = await serve(request =>
    request.url === '/meta'
      ? [200, '{"issuer":"x"}']
      : [404, 'not here', { 'content-type': 'text/plain' }],
  )
  const fetched = createOAuthFetch()
  expect(await fetched.get(`${peer.base}/meta`, never)).toEqual({
    ok: { status: 200, json: { issuer: 'x' } },
  })
  expect(await fetched.get(`${peer.base}/nope`, never)).toEqual({
    ok: { status: 404, json: undefined },
  })
  expect(peer.seen[0]?.method).toBe('GET')
})

it('posts a form or JSON with its headers and does not follow a redirect', async () => {
  const peer = await serve(request =>
    request.url === '/moved' ? [302, '', { location: '/elsewhere' }] : [200, '{"ok":true}'],
  )
  const fetched = createOAuthFetch()
  const form = {
    kind: 'form',
    fields: { grant_type: 'refresh_token', refresh_token: 'a b&c' },
  } as const
  expect(
    await fetched.post(`${peer.base}/token`, form, { authorization: 'Basic eA==' }, never),
  ).toEqual({
    ok: { status: 200, json: { ok: true } },
  })
  expect(peer.seen[0]).toEqual({
    method: 'POST',
    type: 'application/x-www-form-urlencoded',
    authorization: 'Basic eA==',
    body: 'grant_type=refresh_token&refresh_token=a+b%26c',
  })
  await fetched.post(
    `${peer.base}/register`,
    { kind: 'json', value: { client_name: 'omne' } },
    {},
    never,
  )
  expect(peer.seen[1]).toMatchObject({ type: 'application/json', body: '{"client_name":"omne"}' })
  expect(await fetched.get(`${peer.base}/moved`, never)).toEqual({
    ok: { status: 302, json: undefined },
  })
  expect(peer.seen.map(item => item.method)).toEqual(['POST', 'POST', 'GET'])
})

it('a request that cannot reach its server, or that is stopped, gets no answer', async () => {
  const peer = await serve(() => [200, '{}'])
  const closed = servers.pop()
  await new Promise(resolve => closed?.close(resolve))
  const fetched = createOAuthFetch()
  expect(await fetched.get(`${peer.base}/meta`, never)).toEqual({ failure: 'no-answer' })
  expect(await fetched.get('https://example.invalid/meta', AbortSignal.abort())).toEqual({
    failure: 'no-answer',
  })
})
