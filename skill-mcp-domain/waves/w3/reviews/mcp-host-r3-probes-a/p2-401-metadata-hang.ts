// P2: 401 on tools/call whose resource_metadata URL never answers; the call's signal fires.
import { factory, server, race, material } from './common.ts'
let base = ''
const s = await server((req, body, res) => {
  if (req.method === 'GET') return // metadata: never answer
  if (body?.method === 'tools/call') { res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` }).end('no'); return }
  res.writeHead(500).end()
})
base = new URL(s.url).origin
let rejections = 0
const credential = { purpose: 'http-authorization', authorize: async (h: Headers) => { h.set('authorization', 'Bearer SECRET-TOKEN-123'); return { ok: 'done' } }, reportRejection: async () => { rejections++ }, release: async () => {} }
const f = await factory()
const t = (await f.open(material(s.url, credential), new AbortController().signal)).ok
const ac = new AbortController()
const p = t.call({ action: 'echo', args: { kind: 'object', entries: [] } }, ac.signal)
setTimeout(() => ac.abort(), 200)
const r = await race(p, 3000)
console.log('P2 call settled within 3s after abort at 200ms:', r.settled, 'reportRejection calls:', rejections)
await t.close(); const r2 = await race(p, 1000)
console.log('P2 after close: settled', r2.settled, r2.settled ? JSON.stringify((r2 as any).v) : '')
s.close()
