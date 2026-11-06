// Q3: a POST answered 500 / 401 whose body never ends: the call's signal, and close().
import { factory, server, race, material } from './common.ts'
const s = await server((req, body, res) => {
  if (body?.method === 'tools/call') { res.writeHead(500, { 'content-type': 'text/plain' }); res.write('partial'); return }
  if (body?.method === 'tools/list') { res.writeHead(401, { 'www-authenticate': 'Bearer' }); res.write('partial'); return }
  res.writeHead(404).end()
})
const f = await factory()
let rej = 0
const cred = { authorize: async (h: Headers) => ({ ok: 'authorized' }), reportRejection: async () => { rej += 1 } }
const t = (await f.open(material(s.url, cred), new AbortController().signal)).ok
const ac = new AbortController()
const call = t.call({ action: 'x', args: { kind: 'object', entries: [] } }, ac.signal)
setTimeout(() => ac.abort(), 100)
const r = await race(call, 1000) as any
console.log('Q3 call() with signal at 100 ms returned within 1s:', r.settled, r.settled && r.v.ok ? JSON.stringify(await r.v.ok.answer) : JSON.stringify(r.v))
const list = t.listActions()
await new Promise(r => setTimeout(r, 200))
const c = await race(t.close(), 1000)
console.log('Q3 close() with a 401 body open returned within 1s:', c.settled, '| listActions:', JSON.stringify((await race(list, 500) as any).v), '| reportRejection', rej)
s.close(); process.exit(0)
