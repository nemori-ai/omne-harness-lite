// A local `node:http` server for the Web provider tests: pages of several media types, redirect
// chains, a server that never answers, a gzip bomb, a slow body, and an Exa double. Nothing here
// reaches the network outside 127.0.0.1.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'

export type SeenRequest = Readonly<{
  method: string
  path: string
  headers: Readonly<Record<string, string | string[] | undefined>>
  body: string
}>

export type ExaAnswer = Readonly<{ status: number; contentType?: string; body: string }>

export type WebFixture = Readonly<{
  origin: string
  /** A port on 127.0.0.1 that was free a moment ago: connecting to it is refused. */
  closedPort: number
  url(path: string): string
  seen: readonly SeenRequest[]
  /** The Exa double answers every POST on `/exa` with this; tests replace it. */
  exa: { answer: ExaAnswer }
  close(): Promise<void>
}>

export const HTML_PAGE = `<!doctype html>
<html><head><title>Fixture Title</title><style>body{color:red}</style>
<script>window.RLQ = []; alert('x')</script></head>
<body>
<noscript>Enable JavaScript</noscript>
<h1>Heading</h1>
<p>Paragraph with <a href="https://example.test/next">a link</a> and <a href="javascript:alert(1)">a script link</a>.</p>
<p><img src="data:image/png;base64,AAAA" alt="inline image"> and <img src="https://example.test/a.png" alt="remote"></p>
<pre><code class="language-js">const a = 1</code></pre>
<p>中文段落。</p>
</body></html>`

/** Deep enough for turndown's recursive walk to overflow the stack (it fails from about 2000 levels). */
export const DEEP_HTML = `<html><body>${'<div>'.repeat(6000)}deep${'</div>'.repeat(6000)}</body></html>`

const BOMB = gzipSync(Buffer.alloc(8 * 1024 * 1024, 0x61))

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function text(response: ServerResponse, type: string, body: string | Buffer, status = 200): void {
  response.writeHead(status, { 'content-type': type })
  response.end(body)
}

async function closedPort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', () => resolve()))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return port
}

export async function startWebFixture(): Promise<WebFixture> {
  const seen: SeenRequest[] = []
  const exa = { answer: { status: 200, body: JSON.stringify({ results: [] }) } as ExaAnswer }
  const timers = new Set<NodeJS.Timeout>()
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<unknown> => {
    const body = await readBody(request)
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    seen.push({ method: request.method ?? '', path: url.pathname, headers: request.headers, body })
    const path = url.pathname
    if (path === '/html') return text(response, 'text/html; charset=utf-8', HTML_PAGE)
    if (path === '/deep') return text(response, 'text/html', DEEP_HTML)
    if (path === '/plain') return text(response, 'text/plain; charset=utf-8', 'plain 文本\nline 2')
    if (path === '/markdown') return text(response, 'text/markdown', '# Already\n\n*markdown*')
    if (path === '/json') return text(response, 'application/json', '{"a":[1,2],"b":"中"}')
    if (path === '/latin1')
      return text(response, 'text/plain; charset=iso-8859-1', Buffer.from([0x63, 0x61, 0x66, 0xe9]))
    if (path === '/no-type') {
      response.writeHead(200)
      return response.end('untyped')
    }
    if (path === '/png') return text(response, 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    if (path === '/missing') return text(response, 'text/plain', 'gone', 404)
    if (path === '/error') return text(response, 'text/html', '<p>boom</p>', 503)
    if (path.startsWith('/redirect/')) {
      const left = Number(path.slice('/redirect/'.length))
      if (left <= 0) return text(response, 'text/plain', 'landed')
      response.writeHead(302, { location: `/redirect/${String(left - 1)}` })
      return response.end()
    }
    if (path === '/loop') {
      response.writeHead(301, { location: '/loop' })
      return response.end()
    }
    if (path === '/to-ftp') {
      response.writeHead(302, { location: 'ftp://files.test/x' })
      return response.end()
    }
    if (path === '/no-location') {
      response.writeHead(302)
      return response.end()
    }
    if (path === '/silent') return undefined // never answers
    if (path === '/bomb') {
      response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' })
      return response.end(BOMB)
    }
    if (path === '/big') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      for (let index = 0; index < 64; index += 1) response.write('é'.repeat(1024))
      return response.end()
    }
    if (path === '/dribble') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.write('start ')
      const timer = setInterval(() => response.write('. '), 100)
      timers.add(timer)
      response.on('close', () => {
        clearInterval(timer)
        timers.delete(timer)
      })
      return undefined
    }
    if (path === '/exa') {
      const answer = exa.answer
      return text(response, answer.contentType ?? 'application/json', answer.body, answer.status)
    }
    return text(response, 'text/plain', 'no such fixture', 404)
  }
  const server: Server = createServer((request, response) => {
    void handle(request, response)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${String(port)}`
  return {
    origin,
    closedPort: await closedPort(),
    url: path => `${origin}${path}`,
    seen,
    exa,
    close: async () => {
      for (const timer of timers) clearInterval(timer)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
