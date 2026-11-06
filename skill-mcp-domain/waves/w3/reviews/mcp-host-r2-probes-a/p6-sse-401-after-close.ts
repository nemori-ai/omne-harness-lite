// P6: legacy fallback GET answers 401 head, body slow; close() runs while the body is read.
import { factory, server, race, material } from './common.ts'
let getSeen!: () => void
const gotGet = new Promise<void>(r => (getSeen = r))
const s = await server((req, body, res) => {
  if (req.method === 'GET' && req.headers.accept?.includes('text/event-stream')) {
    res.writeHead(401, { 'www-authenticate': 'Bearer realm="x"', 'content-type': 'text/plain' }); res.write('slow'); getSeen()
    setTimeout(() => res.end('...'), 1000); return
  }
  if (req.method === 'GET') { res.writeHead(404).end(); return }
  if (body?.method === 'server/discover') { res.writeHead(404, { 'content-type': 'text/plain' }).end('nope'); return }
  if (body?.method === 'initialize') { res.writeHead(400, { 'content-type': 'text/plain' }).end('bad'); return }
  res.writeHead(500).end()
})
const events: string[] = []
const credential = { purpose: 'http-authorization', authorize: async (h: Headers) => { events.push('authorize'); h.set('authorization', 'Bearer SECRET-TOKEN-123'); return { ok: 'done' } }, reportRejection: async () => { events.push('reportRejection') }, release: async () => {} }
const f = await factory()
const t = (await f.open(material(s.url, credential), new AbortController().signal)).ok
const d = t.discover()
await gotGet; await new Promise(r => setTimeout(r, 50))
await t.close(); events.push('close() resolved')
const r = await race(d, 3000)
await new Promise(r => setTimeout(r, 100))
console.log('P6 events:', events.join(' > '))
console.log('P6 discover():', r.settled ? JSON.stringify((r as any).v.failure ?? 'ok').slice(0, 120) : 'pending')
s.close()
