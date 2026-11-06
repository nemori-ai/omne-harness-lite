// P1: T5 — call's signal fires after the POST left, before the answer head: does `call` stop waiting?
import { factory, server, race, material } from './common.ts'
const s = await server((req, body, res) => { if (body?.method === 'tools/call') { /* never answer */ return } res.writeHead(500).end() })
const f = await factory()
const opened = await f.open(material(s.url), new AbortController().signal)
const t = opened.ok
const ac = new AbortController()
const started = performance.now()
const p = t.call({ action: 'echo', args: { kind: 'object', entries: [] } }, ac.signal)
setTimeout(() => ac.abort(), 200)
const r = await race(p, 3000)
console.log('P1 call settled within 3s after abort at 200ms:', r.settled, 'elapsed', Math.round(performance.now() - started))
const c0 = performance.now(); await t.close(); const r2 = await race(p, 1000)
console.log('P1 after close(): call settled:', r2.settled, r2.settled ? JSON.stringify(Object.keys((r2 as any).v)) : '', 'close took', Math.round(performance.now()-c0))
if (r2.settled && (r2 as any).v.ok) console.log('P1 answer:', JSON.stringify(await (r2 as any).v.ok.answer))
s.close()
