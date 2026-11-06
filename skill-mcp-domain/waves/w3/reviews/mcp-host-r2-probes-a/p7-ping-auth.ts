// P7: a protected peer sends `ping` inside the SSE answer stream of tools/call; is the response POST authorized?
import { factory, server, material } from './common.ts'
const posts: string[] = []
const s = await server((req, body, res) => {
  const auth = req.headers.authorization ? 'auth' : 'NO-AUTH'
  posts.push(`${body?.method ?? (body?.result !== undefined ? 'response:' + body.id : JSON.stringify(body))}[${auth}]`)
  if (!req.headers.authorization) { res.writeHead(401, { 'www-authenticate': 'Bearer' }).end(); return }
  if (body?.method === 'tools/call') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: 'p1', method: 'ping' })}\n\n`)
    setTimeout(() => res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [] } })}\n\n`), 300)
    return
  }
  res.writeHead(202).end()
})
const events: string[] = []
const credential = { purpose: 'http-authorization', authorize: async (h: Headers) => { events.push('authorize'); h.set('authorization', 'Bearer SECRET-TOKEN-123'); return { ok: 'done' } }, reportRejection: async () => { events.push('reportRejection') }, release: async () => {} }
const f = await factory()
const t = (await f.open(material(s.url, credential), new AbortController().signal)).ok
const c = await t.call({ action: 'echo', args: { kind: 'object', entries: [] } }, new AbortController().signal)
await c.ok.answer; await new Promise(r => setTimeout(r, 200))
console.log('P7 POSTs seen by the peer:', posts.join(', '), '| handle:', events.join(','))
await t.close(); s.close()
