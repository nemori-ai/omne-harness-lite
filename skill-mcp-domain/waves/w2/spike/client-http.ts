// createMcpHandler behind node:http (hand adapter; @modelcontextprotocol/node is not installed),
// StreamableHTTPClientTransport with a recording fetch. Run: node --experimental-strip-types client-http.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { Client, StreamableHTTPClientTransport, SdkError, ProtocolError } from '@modelcontextprotocol/client'
import * as z from 'zod/v4'
import { build } from './server.ts'

const log = (label: string, v?: unknown) => console.error(`\n## ${label}\n` + (v === undefined ? '' : JSON.stringify(v, null, 2)))
const errInfo = (e: unknown) =>
  e instanceof SdkError || e instanceof ProtocolError
    ? { class: e.constructor.name, code: (e as any).code, message: e.message, data: (e as any).data }
    : { other: String(e) }

const handler = createMcpHandler(() => build(), { onerror: (e) => console.error('[http-handler onerror]', e.message) })
async function toWeb(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const ac = new AbortController()
  req.socket.once('close', () => ac.abort())
  return new Request(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    signal: ac.signal,
  })
}
const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/protected' && !req.headers.authorization) {
    res.writeHead(401, { 'WWW-Authenticate': 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource", scope="mcp:tools"' })
    res.end()
    return
  }
  const r = await handler.fetch(await toWeb(req))
  res.writeHead(r.status, Object.fromEntries(r.headers))
  if (r.body) Readable.fromWeb(r.body as any).pipe(res)
  else res.end()
  res.on('close', () => { if (!res.writableFinished) console.error('[http] response closed by client before finish:', req.url) })
})
await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()))
const port = (http.address() as any).port

const seen: Array<{ method?: string; headers: Record<string, string>; body: any; status?: number; ctype?: string }> = []
const recordingFetch = async (url: string | URL, init?: RequestInit) => {
  const h = Object.fromEntries(new Headers(init?.headers))
  let body: any
  try { body = init?.body ? JSON.parse(String(init.body)) : undefined } catch { body = String(init?.body) }
  const rec = { method: init?.method, headers: h, body } as (typeof seen)[number]
  seen.push(rec)
  const r = await fetch(url, init)
  rec.status = r.status
  rec.ctype = r.headers.get('content-type') ?? undefined
  return r
}

const TASKS_EXT = 'io.modelcontextprotocol/tasks'
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { fetch: recordingFetch as never })
const client = new Client(
  { name: 'http-client', version: '0.0.1' },
  { capabilities: { elicitation: { form: {} }, extensions: { [TASKS_EXT]: {} } } as never, versionNegotiation: { mode: 'auto' } },
)
client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { name: 'Http' } }))
await client.connect(transport)
log('era/version', { era: client.getProtocolEra(), v: client.getNegotiatedProtocolVersion(), sessionId: transport.sessionId })
log('discover request headers', seen[0])

await client.callTool({ name: 'echo', arguments: { text: 'over http' } })
log('tools/call echo request headers', seen.at(-1)?.headers)
const ask = await client.callTool({ name: 'ask', arguments: {} })
log('ask auto-fulfilled over http', ask.content)

try {
  await client.callTool({ name: 'slow', arguments: { ms: 100 } })
} catch (e) {
  log('slow (task) over http threw', errInfo(e))
}
const tId = 'task-1'
await new Promise((r) => setTimeout(r, 200))
const g = await client.request({ method: 'tasks/get', params: { taskId: tId } }, z.object({ status: z.string() }).loose())
log('tasks/get over http', { status: g.status, headers: seen.at(-1)?.headers })

// cancellation on HTTP: abort the signal
const ac = new AbortController()
const before = seen.length
const p = client.callTool({ name: 'slow', arguments: { ms: 800, inline: true } }, { signal: ac.signal })
setTimeout(() => ac.abort('http-cancel'), 100)
try { await p } catch (e) { log('aborted http call threw', errInfo(e)) }
await new Promise((r) => setTimeout(r, 200))
log('requests sent for the aborted call (methods)', seen.slice(before).map((s) => s.body?.method))

// T4: 401 with WWW-Authenticate, no authProvider
const seen401: any[] = []
const fetch401 = async (url: string | URL, init?: RequestInit) => {
  const r = await fetch(url, init)
  seen401.push({ status: r.status, wwwAuthenticate: r.headers.get('www-authenticate') })
  return r
}
const c2 = new Client({ name: 'http-401', version: '0.0.1' }, { versionNegotiation: { mode: 'auto' } })
try {
  await c2.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/protected`), { fetch: fetch401 as never }))
  log('401 connect unexpectedly ok')
} catch (e) {
  log('401 connect threw', { ...errInfo(e), seenByFetch: seen401 })
}
// Authorization via the fetch hook (where an HttpCredentialHandle.authorize(headers) would go)
const c3 = new Client({ name: 'http-auth', version: '0.0.1' }, { versionNegotiation: { mode: 'auto' } })
const authFetch = async (url: string | URL, init?: RequestInit) => {
  const h = new Headers(init?.headers)
  h.set('authorization', 'Bearer spike')
  return fetch(url, { ...init, headers: h })
}
await c3.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/protected`), { fetch: authFetch as never }))
log('authorized connect via fetch hook', { era: c3.getProtocolEra() })

await client.close(); await c3.close(); await handler.close()
http.close()
process.exit(0)
